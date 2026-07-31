"""Thin singleton wrapper around the MOS async client."""

import logging
import os
from collections.abc import AsyncIterator
from inspect import isawaitable
from typing import Any

from mos import AsyncMos
from mos.enums import GptModel, SearchType
from mos.exceptions import MosError
from mos.models import (
    ArticleSearch,
    GptModelConfig,
    LLMChatMessage,
    LLMChatRequest,
    LLMChatResponse,
    LLMStreamEvent,
    ScopusArticle,
)
from pydantic import ValidationError


class MosClientError(RuntimeError):
    """Raised when the MOS SDK client cannot be initialized."""


class MosSdkError(RuntimeError):
    """Raised when a MOS SDK call fails."""


logger = logging.getLogger(__name__)
_mos_client: AsyncMos | None = None


def init_mos_client() -> AsyncMos:
    """Initialize the process-wide MOS async client."""
    global _mos_client
    if _mos_client is not None:
        return _mos_client

    client_id = os.environ.get("MOS_CLIENT_ID")
    client_secret = os.environ.get("MOS_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise MosClientError("MOS_CLIENT_ID / MOS_CLIENT_SECRET not configured")

    _mos_client = AsyncMos(client_id=client_id, client_secret=client_secret)
    return _mos_client


def get_mos() -> AsyncMos:
    if _mos_client is None:
        raise MosClientError("MOS client is not initialized")
    return _mos_client


async def close_mos_client() -> None:
    """Close the process-wide MOS async client."""
    global _mos_client
    if _mos_client is None:
        return
    await _mos_client.http.close()
    _mos_client = None


async def vector_search_articles(
    *,
    query: str,
    number_of_results: int,
    starting_year: int,
) -> list[ScopusArticle]:
    request = ArticleSearch(
        search_query=query,
        search_type=SearchType.VECTOR_SEARCH,
        starting_year=starting_year,
        number_of_results=number_of_results,
    )
    try:
        return await get_mos().search.articles(request)
    except MosError as exc:
        raise MosSdkError(f"MOS article search failed: {exc}") from exc


async def lexical_search_articles(
    *,
    query: str,
    number_of_results: int,
    starting_year: int,
) -> list[ScopusArticle]:
    request = ArticleSearch(
        search_query=query,
        search_type=SearchType.ELASTIC_SEARCH,
        starting_year=starting_year,
        number_of_results=number_of_results,
    )
    try:
        return await get_mos().search.articles(request)
    except MosError as exc:
        raise MosSdkError(f"MOS lexical article search failed: {exc}") from exc


def _env_value(name: str) -> str | None:
    value = os.environ.get(name)
    return value.strip() if value and value.strip() else None


def _default_gpt_config() -> GptModelConfig:
    return GptModelConfig(
        gpt_model=GptModel.gpt_4o_mini,
        temperature=float(_env_value("MOS_LLM_TEMPERATURE") or 0.7),
    )


def _llm_request(
    messages: list[dict[str, Any] | LLMChatMessage],
    *,
    response_format: dict[str, Any] | None = None,
    extra_params: dict[str, Any] | None = None,
) -> LLMChatRequest:
    gpt_config = _default_gpt_config()
    merged_extra_params = dict(extra_params or {})
    if "model_name" in merged_extra_params:
        logger.warning("Ignoring unsupported MOS LLM extra param: model_name")
        merged_extra_params.pop("model_name", None)
    return LLMChatRequest(
        messages=[
            message if isinstance(message, LLMChatMessage) else LLMChatMessage(**message)
            for message in messages
        ],
        gpt_config=gpt_config,
        response_format=response_format,
        extra_params=merged_extra_params,
    )


async def llm_chat(
    messages: list[dict[str, Any]],
    *,
    response_format: dict[str, Any] | None = None,
    extra_params: dict[str, Any] | None = None,
) -> LLMChatResponse:
    try:
        request = _llm_request(
            messages,
            response_format=response_format,
            extra_params=extra_params,
        )
        return await get_mos().llm.chat(request)
    except (ValueError, ValidationError) as exc:
        raise MosSdkError(f"Invalid MOS LLM request: {exc}") from exc
    except MosError as exc:
        raise MosSdkError(f"MOS LLM chat failed: {exc}") from exc


async def llm_stream_chat(
    messages: list[dict[str, Any]],
    *,
    response_format: dict[str, Any] | None = None,
    extra_params: dict[str, Any] | None = None,
) -> AsyncIterator[LLMStreamEvent]:
    try:
        request = _llm_request(
            messages,
            response_format=response_format,
            extra_params=extra_params,
        )
        stream = get_mos().llm.stream_chat(request)
        if isawaitable(stream):
            stream = await stream

        async for event in stream:
            yield event
    except (ValueError, ValidationError) as exc:
        raise MosSdkError(f"Invalid MOS LLM stream request: {exc}") from exc
    except MosError as exc:
        raise MosSdkError(f"MOS LLM stream failed: {exc}") from exc
