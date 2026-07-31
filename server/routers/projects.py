from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from db import get_current_user, get_pool, new_uuid
from services.es_client import ElasticsearchLookupError, fetch_scopus_article_by_doi, fetch_scopus_article_by_sgrid
from services.project_evaluation import (
    ProjectEvaluationArticleNotFound,
    ProjectEvaluationError,
    ProjectEvaluationSearchError,
    evaluate_article_for_project,
)

router = APIRouter()


class ProjectCreate(BaseModel):
    name: str = Field(default="Untitled project", max_length=200)
    description: str | None = Field(default=None, max_length=1000)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)


class CriteriaUpdate(BaseModel):
    criteria: list[str] = Field(default_factory=list)


class ArticleReference(BaseModel):
    sgrid: str | None = None
    doi: str | None = None
    pii: str | None = None


class ArticleAdd(ArticleReference):
    article: ArticleReference | None = None


class CurrentProjectUpdate(BaseModel):
    project_id: UUID | None = None


async def _ensure_project(conn, project_id: str, user_id: Any):
    project = await conn.fetchrow(
        """
        SELECT id, user_id, name, description, criteria, created_at, updated_at
        FROM projects
        WHERE id = $1 AND user_id = $2
        """,
        project_id,
        user_id,
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/projects")
async def list_projects(request: Request, user=Depends(get_current_user)):
    pool = await get_pool(request)
    async with pool.acquire() as conn:
        projects = await conn.fetch(
            """
            SELECT
                p.id,
                p.name,
                p.description,
                p.criteria,
                p.created_at,
                p.updated_at,
                COUNT(pa.id)::int AS article_count
            FROM projects p
            LEFT JOIN project_articles pa ON pa.project_id = p.id
            WHERE p.user_id = $1
            GROUP BY p.id, p.name, p.description, p.criteria, p.created_at, p.updated_at
            ORDER BY p.created_at DESC
            """,
            user["id"],
        )

    return {
        "projects": [
            {
                "id": str(project["id"]),
                "name": project["name"],
                "description": project["description"],
                "criteria": _criteria_list(project["criteria"]),
                "article_count": project["article_count"],
                "articles": [],
                "is_current": project["id"] == user["current_project_id"],
                "created_at": project["created_at"].isoformat(),
                "updated_at": project["updated_at"].isoformat(),
            }
            for project in projects
        ]
    }


@router.post("/projects")
async def create_project(payload: ProjectCreate, request: Request, user=Depends(get_current_user)):
    name = payload.name.strip() or "Untitled project"
    description = payload.description.strip() if payload.description else None
    pool = await get_pool(request)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO projects (id, user_id, name, description)
            VALUES ($1, $2, $3, $4)
            RETURNING id, name, description, created_at, updated_at
            """,
            new_uuid(),
            user["id"],
            name,
            description,
        )
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "description": row["description"],
        "criteria": [],
        "article_count": 0,
        "articles": [],
        "is_current": False,
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
    }

@router.put("/projects/current")
async def set_current_project(
    payload: CurrentProjectUpdate,
    request: Request,
    user=Depends(get_current_user),
):
    pool = await get_pool(request)
    async with pool.acquire() as conn:
        if payload.project_id is not None:
            await _ensure_project(conn, payload.project_id, user["id"])
        await conn.execute(
            """
            UPDATE users
            SET current_project_id = $1, updated_at = now()
            WHERE id = $2
            """,
            payload.project_id,
            user["id"],
        )
    return {"project_id": str(payload.project_id) if payload.project_id else None, "ok": True}


@router.get("/projects/{project_id}")
async def get_project(project_id: UUID, request: Request, user=Depends(get_current_user)):
    pool = await get_pool(request)
    async with pool.acquire() as conn:
        project = await _ensure_project(conn, project_id, user["id"])
        article_rows = await conn.fetch(
            """
            SELECT
                id,
                sgrid,
                doi,
                pii,
                added_at
            FROM project_articles pa
            WHERE pa.project_id = $1
            ORDER BY pa.added_at DESC
            """,
            project["id"],
        )

    articles = [await _serialize_saved_article(row) for row in article_rows]
    return {
        "id": str(project["id"]),
        "name": project["name"],
        "description": project["description"],
        "criteria": _criteria_list(project["criteria"]),
        "article_count": len(article_rows),
        "articles": articles,
        "is_current": project["id"] == user["current_project_id"],
        "created_at": project["created_at"].isoformat(),
        "updated_at": project["updated_at"].isoformat(),
    }


@router.patch("/projects/{project_id}")
async def update_project(
    project_id: UUID,
    payload: ProjectUpdate,
    request: Request,
    user=Depends(get_current_user),
):
    if payload.name is None and payload.description is None:
        raise HTTPException(status_code=400, detail="Provide name or description to update")

    pool = await get_pool(request)
    async with pool.acquire() as conn:
        current = await _ensure_project(conn, project_id, user["id"])
        name = payload.name.strip() if payload.name is not None else current["name"]
        if not name:
            raise HTTPException(status_code=400, detail="Project name cannot be empty")
        description = payload.description.strip() if payload.description is not None else current["description"]
        row = await conn.fetchrow(
            """
            UPDATE projects
            SET name = $1, description = $2, updated_at = now()
            WHERE id = $3
            RETURNING id, name, description, updated_at
            """,
            name,
            description or None,
            project_id,
        )
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "description": row["description"],
        "updated_at": row["updated_at"].isoformat(),
    }


@router.delete("/projects/{project_id}")
async def delete_project(project_id: UUID, request: Request, user=Depends(get_current_user)):
    pool = await get_pool(request)
    async with pool.acquire() as conn:
        await _ensure_project(conn, project_id, user["id"])
        await conn.execute("DELETE FROM projects WHERE id = $1", project_id)
    return {"deleted": True}


@router.put("/projects/{project_id}/criteria")
async def replace_criteria(
    project_id: UUID,
    payload: CriteriaUpdate,
    request: Request,
    user=Depends(get_current_user),
):
    criteria = [text.strip() for text in payload.criteria if text.strip()]
    pool = await get_pool(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            await _ensure_project(conn, project_id, user["id"])
            await conn.execute(
                """
                UPDATE projects
                SET criteria = $1::jsonb, updated_at = now()
                WHERE id = $2
                """,
                json.dumps(criteria),
                project_id,
            )
    return {"project_id": str(project_id), "criteria": criteria}


@router.post("/projects/{project_id}/articles")
async def add_article(
    project_id: UUID,
    payload: ArticleAdd,
    request: Request,
    user=Depends(get_current_user),
):
    sgrid = (payload.article.sgrid if payload.article else payload.sgrid) or None
    doi = (payload.article.doi if payload.article else payload.doi) or None
    pii = (payload.article.pii if payload.article else payload.pii) or None

    if not sgrid and not doi and not pii:
        raise HTTPException(status_code=400, detail="sgrid, doi, or pii is required")

    pool = await get_pool(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            await _ensure_project(conn, project_id, user["id"])
            row = await conn.fetchrow(
                """
                SELECT id, added_at
                FROM project_articles
                WHERE project_id = $1
                  AND (
                    ($2::text IS NOT NULL AND sgrid = $2)
                    OR ($3::text IS NOT NULL AND doi = $3)
                    OR ($4::text IS NOT NULL AND pii = $4)
                  )
                LIMIT 1
                """,
                project_id,
                sgrid,
                doi,
                pii,
            )
            if row is None:
                row = await conn.fetchrow(
                    """
                    INSERT INTO project_articles (id, project_id, sgrid, doi, pii)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING id, added_at
                    """,
                    new_uuid(),
                    project_id,
                    sgrid,
                    doi,
                    pii,
                )
            else:
                row = await conn.fetchrow(
                    """
                    UPDATE project_articles
                    SET
                        sgrid = COALESCE(sgrid, $2),
                        doi = COALESCE(doi, $3),
                        pii = COALESCE(pii, $4)
                    WHERE id = $1
                    RETURNING id, added_at
                    """,
                    row["id"],
                    sgrid,
                    doi,
                    pii,
                )
    return {"id": str(row["id"]), "added_at": row["added_at"].isoformat()}


@router.post("/projects/{project_id}/articles/{sgrid}/evaluation")
async def evaluate_article(
    project_id: UUID,
    sgrid: str,
    request: Request,
    user=Depends(get_current_user),
):
    pool = await get_pool(request)
    async with pool.acquire() as conn:
        project = await _ensure_project(conn, project_id, user["id"])

    try:
        return await evaluate_article_for_project(sgrid, project)
    except ProjectEvaluationArticleNotFound as exc:
        raise HTTPException(status_code=404, detail="Article not found in Scopus index") from exc
    except ProjectEvaluationSearchError as exc:
        raise HTTPException(status_code=503, detail="Failed to query Scopus index") from exc
    except ProjectEvaluationError as exc:
        raise HTTPException(status_code=503, detail="Project evaluation is temporarily unavailable") from exc


@router.delete("/projects/{project_id}/articles/{saved_article_id}")
async def remove_article(
    project_id: UUID,
    saved_article_id: UUID,
    request: Request,
    user=Depends(get_current_user),
):
    pool = await get_pool(request)
    async with pool.acquire() as conn:
        await _ensure_project(conn, project_id, user["id"])
        await conn.execute(
            "DELETE FROM project_articles WHERE project_id = $1 AND id = $2",
            project_id,
            saved_article_id,
        )
    return {"deleted": True}


def _json_value(value: Any, fallback: Any) -> Any:
    if value is None:
        return fallback
    if isinstance(value, str):
        return json.loads(value)
    return value


def _criteria_list(value: Any) -> list[str]:
    criteria = _json_value(value, [])
    if not isinstance(criteria, list):
        return []
    return [criterion for criterion in criteria if isinstance(criterion, str)]


async def _serialize_saved_article(row) -> dict[str, Any]:
    article = None
    if row["sgrid"]:
        try:
            article = await fetch_scopus_article_by_sgrid(row["sgrid"])
        except ElasticsearchLookupError:
            article = None
    elif row["doi"]:
        try:
            article = await fetch_scopus_article_by_doi(row["doi"])
        except ElasticsearchLookupError:
            article = None

    citations = getattr(article, "citations", None)
    if isinstance(citations, int):
        citation_items: list[str] = []
        citation_count = citations
    elif isinstance(citations, list):
        citation_items = [str(item) for item in citations]
        citation_count = len(citation_items)
    else:
        citation_items = []
        citation_count = 0

    authors = [
        author.model_dump(exclude_none=True)
        for author in (getattr(article, "authors", None) or [])
    ]
    keywords = getattr(article, "keywords", None) or []
    if isinstance(keywords, str):
        keywords = [keywords] if keywords.strip() else []

    sgrid = getattr(article, "sgrid", None) or row["sgrid"]
    doi = getattr(article, "doi", None) or row["doi"]
    pii = getattr(article, "pii", None) or row["pii"]
    return {
        "id": str(row["id"]),
        "mapping_id": str(row["id"]),
        "sgrid": sgrid,
        "doi": doi,
        "pii": pii,
        "title": getattr(article, "title", None) or "Saved article",
        "abstract": getattr(article, "abstract", None),
        "sourceTitle": getattr(article, "sourceTitle", None) or getattr(article, "journalTitle", None),
        "publicationYear": getattr(article, "publicationYear", None) or getattr(article, "issueYear", None),
        "citations": citation_items,
        "citationCount": citation_count,
        "authors": authors,
        "keywords": keywords,
        "scopus_url": f"https://www.scopus.com/pages/publications/{sgrid}" if sgrid else None,
        "sciencedirect_url": f"https://www.sciencedirect.com/science/article/pii/{pii}" if pii else None,
        "added_at": row["added_at"].isoformat(),
    }
