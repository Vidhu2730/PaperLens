from __future__ import annotations

import json
import logging
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from db import get_current_user
from services.es_client import (
    ElasticsearchLookupError,
    ScopusArticle,
    fetch_scopus_article_by_doi,
    fetch_scopus_article_by_sgrid,
    fetch_fulltext_by_pii,
)
from services.llm_client import LLMServiceError, stream_chat

router = APIRouter()
logger = logging.getLogger(__name__)

MAX_FULLTEXT_CHARS = 60_000

# Simple in-process cache: sgrid/doi → context block string.
# Avoids re-fetching from ES on every turn of a multi-turn conversation.
_context_cache: dict[str, str] = {}

SYSTEM_PROMPT = (
    "You are PaperLens, a research assistant grounded ONLY in the provided article.\n"
    "- Answer questions using the article context below.\n"
    "- If the answer is not in the article, say so explicitly. Do not invent citations or numbers.\n"
    "- Be concise; use bullet points (- item) for lists; quote short snippets when helpful.\n"
    "- Use ## for section headings (e.g. ## Key findings). Never use bold-only lines as headings.\n"
    "- Do not wrap the entire response in a single bullet list."
)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    sgrid: str | None = None
    doi: str | None = None
    messages: list[ChatMessage]


def _build_context_block(article: ScopusArticle, fulltext: str | None) -> str:
    title = article.title or "(no title)"
    abstract = article.abstract or "(no abstract available)"
    fulltext_block = fulltext or "(full text not available — answer from title/abstract only)"
    return (
        f"TITLE: {title}\n\n"
        f"ABSTRACT:\n{abstract}\n\n"
        f"FULL TEXT:\n{fulltext_block}"
    )


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


@router.post("/chat")
async def chat(body: ChatRequest, user=Depends(get_current_user)):
    if not body.messages:
        raise HTTPException(status_code=400, detail="messages is required")
    if not (body.sgrid or body.doi):
        raise HTTPException(status_code=400, detail="sgrid or doi is required")

    cache_key = body.sgrid or body.doi
    context_block = _context_cache.get(cache_key)  # type: ignore[arg-type]

    if context_block is None:
        try:
            article = await (
                fetch_scopus_article_by_sgrid(body.sgrid)
                if body.sgrid
                else fetch_scopus_article_by_doi(body.doi)
            )
        except ElasticsearchLookupError as exc:
            raise HTTPException(status_code=503, detail="Failed to query Scopus index") from exc

        if not article:
            raise HTTPException(status_code=404, detail="Article not found in Scopus index")

        fulltext: str | None = None
        if article.pii:
            fulltext = await fetch_fulltext_by_pii(article.pii)
            if fulltext:
                fulltext = fulltext[:MAX_FULLTEXT_CHARS]

        context_block = _build_context_block(article, fulltext)
        _context_cache[cache_key] = context_block  # type: ignore[index]

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": context_block},
        *[m.model_dump() for m in body.messages],
    ]

    async def gen():
        mos_start = time.perf_counter()
        first_delta_logged = False
        try:
            logger.info(
                "chat.mos.stream_created elapsed_ms=%.1f",
                (time.perf_counter() - mos_start) * 1000,
            )
            async for delta in stream_chat(messages):
                if delta:
                    if not first_delta_logged:
                        first_delta_logged = True
                        logger.info(
                            "chat.mos.first_delta elapsed_ms=%.1f",
                            (time.perf_counter() - mos_start) * 1000,
                        )
                    yield _sse({"delta": delta})
            logger.info(
                "chat.mos.stream_completed elapsed_ms=%.1f first_delta=%s",
                (time.perf_counter() - mos_start) * 1000,
                first_delta_logged,
            )
            yield _sse({"done": True})
        except LLMServiceError as exc:
            logger.info(
                "chat.mos.stream_failed elapsed_ms=%.1f first_delta=%s",
                (time.perf_counter() - mos_start) * 1000,
                first_delta_logged,
            )
            yield _sse({"error": str(exc)})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
