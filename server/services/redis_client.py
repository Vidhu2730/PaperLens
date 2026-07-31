import json
import logging
import os

import redis.asyncio as aioredis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)

_client: aioredis.Redis | None = None


def get_redis_client() -> aioredis.Redis:
    global _client
    if _client is None:
        url = os.environ.get("REDIS_URL", "redis://localhost:6379")
        _client = aioredis.from_url(url, decode_responses=True)
    return _client


async def close_redis_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def cache_get(key: str) -> object | None:
    try:
        raw = await get_redis_client().get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except RedisError as exc:
        logger.warning("Redis cache_get failed for %s: %s", key, exc)
        return None


async def cache_set(key: str, value: object, ttl: int) -> None:
    try:
        await get_redis_client().setex(key, ttl, json.dumps(value))
    except RedisError as exc:
        logger.warning("Redis cache_set failed for %s: %s", key, exc)
