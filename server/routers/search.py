from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from services.mos_client import MosClientError, MosSdkError, vector_search_articles
from services.search_results import serialize_mos_article

router = APIRouter()

DEFAULT_RESULTS_PER_PAGE = 100
DEFAULT_STARTING_YEAR = 2000


@router.get("/search")
async def search(
    q: str = Query(..., min_length=2, description="Free-text query"),
    size: int = Query(default=DEFAULT_RESULTS_PER_PAGE, ge=1, le=200),
    year: int = Query(default=DEFAULT_STARTING_YEAR, ge=1986),
):
    starting_year = min(year, datetime.now().year)

    try:
        articles = await vector_search_articles(
            query=q,
            number_of_results=size,
            starting_year=starting_year,
        )
    except MosClientError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except MosSdkError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return {
        "query": q,
        "count": len(articles),
        "results": [serialize_mos_article(a) for a in articles],
    }
