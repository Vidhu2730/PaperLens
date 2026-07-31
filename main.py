from dotenv import load_dotenv

load_dotenv()

from contextlib import asynccontextmanager
import logging
import os
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import close_pool
from services.mos_client import close_mos_client, init_mos_client
from services.redis_client import close_redis_client
from routers.article import router as article_router
from routers.chat import router as chat_router
from routers.projects import router as projects_router
from routers.resolve import router as resolve_router
from routers.search import router as search_router

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    stream=sys.stdout,
    force=True,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_mos_client()
    try:
        yield
    finally:
        await close_mos_client()
        await close_pool(app)
        await close_redis_client()


app = FastAPI(title="PaperLens API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(resolve_router)
app.include_router(article_router)
app.include_router(search_router)
app.include_router(projects_router)
app.include_router(chat_router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "paperlens"}
