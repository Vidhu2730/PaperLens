from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Literal

from services.mos_client import MosClientError, MosSdkError, llm_chat, llm_stream_chat

MessageRole = Literal["system", "developer", "user", "assistant"]


class LLMServiceError(RuntimeError):
    """Raised when the MOS LLM service cannot be configured or called."""


@dataclass(frozen=True)
class LLMOptions:
    response_format: dict[str, Any] | None = None
    extra_params: dict[str, Any] | None = None


async def chat(messages: list[dict[str, Any]], options: LLMOptions | None = None) -> str:
    options = options or LLMOptions()
    try:
        llm_response = await llm_chat(
            messages,
            response_format=options.response_format,
            extra_params=options.extra_params,
        )
    except (MosClientError, MosSdkError) as exc:
        raise LLMServiceError(f"MOS LLM chat failed: {exc}") from exc

    content = llm_response.content.strip()
    if not content:
        raise LLMServiceError("MOS LLM returned empty content")
    return content


async def stream_chat(
    messages: list[dict[str, Any]],
    options: LLMOptions | None = None,
) -> AsyncIterator[str]:
    options = options or LLMOptions()
    try:
        async for event in llm_stream_chat(
            messages,
            response_format=options.response_format,
            extra_params=options.extra_params,
        ):
            if event.error:
                raise LLMServiceError(f"MOS LLM stream returned error: {event.error}")
            if event.delta:
                yield event.delta
    except (MosClientError, MosSdkError) as exc:
        raise LLMServiceError(f"MOS LLM stream failed: {exc}") from exc
    except Exception as exc:
        raise LLMServiceError(f"MOS LLM stream failed: {exc}") from exc
