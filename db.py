from __future__ import annotations

import os
import re
import uuid
from typing import Any

import asyncpg
from fastapi import Header, HTTPException, Request


DEFAULT_DATABASE_URL = "postgresql://paperlens:paperlens@localhost:5432/paperlens"
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY,
        email text NOT NULL UNIQUE,
        current_project_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    )
    """,
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS current_project_id uuid
    """,
    """
    CREATE TABLE IF NOT EXISTS projects (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name text NOT NULL,
        description text,
        criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    )
    """,
    """
    ALTER TABLE projects DROP COLUMN IF EXISTS topic
    """,
    """
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS description text
    """,
    """
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS criteria jsonb NOT NULL DEFAULT '[]'::jsonb
    """,
    """
    DO $$
    BEGIN
        IF to_regclass('public.project_criteria') IS NOT NULL THEN
            EXECUTE '
                UPDATE projects p
                SET criteria = migrated.criteria
                FROM (
                    SELECT project_id, jsonb_agg(text ORDER BY position) AS criteria
                    FROM project_criteria
                    GROUP BY project_id
                ) migrated
                WHERE p.id = migrated.project_id
            ';
        END IF;
    END
    $$
    """,
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'projects_criteria_is_array'
        ) THEN
            ALTER TABLE projects
            ADD CONSTRAINT projects_criteria_is_array
            CHECK (jsonb_typeof(criteria) = 'array');
        END IF;
    END
    $$
    """,
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'users_current_project_id_fkey'
        ) THEN
            ALTER TABLE users
            ADD CONSTRAINT users_current_project_id_fkey
            FOREIGN KEY (current_project_id)
            REFERENCES projects(id)
            ON DELETE SET NULL;
        END IF;
    END
    $$
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_projects_user_created
        ON projects(user_id, created_at DESC)
    """,
    """
    DROP TABLE IF EXISTS project_criteria
    """,
    """
    DROP TABLE IF EXISTS article_evaluations CASCADE
    """,
    """
    CREATE TABLE IF NOT EXISTS project_articles (
        id uuid PRIMARY KEY,
        project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        sgrid text,
        doi text,
        pii text,
        added_at timestamptz NOT NULL DEFAULT now(),
        CHECK (sgrid IS NOT NULL OR doi IS NOT NULL OR pii IS NOT NULL)
    )
    """,
    """
    ALTER TABLE project_articles ADD COLUMN IF NOT EXISTS sgrid text
    """,
    """
    ALTER TABLE project_articles ADD COLUMN IF NOT EXISTS doi text
    """,
    """
    ALTER TABLE project_articles ADD COLUMN IF NOT EXISTS pii text
    """,
    """
    DO $$
    BEGIN
        IF to_regclass('public.articles') IS NOT NULL
           AND EXISTS (
               SELECT 1
               FROM information_schema.columns
               WHERE table_schema = 'public'
                 AND table_name = 'project_articles'
                 AND column_name = 'article_id'
           ) THEN
            EXECUTE '
                UPDATE project_articles pa
                SET
                    sgrid = COALESCE(pa.sgrid, a.sgrid),
                    doi = COALESCE(pa.doi, a.doi),
                    pii = COALESCE(pa.pii, a.pii)
                FROM articles a
                WHERE pa.article_id = a.id
            ';
        END IF;
    END
    $$
    """,
    """
    ALTER TABLE project_articles DROP COLUMN IF EXISTS evaluation_id
    """,
    """
    ALTER TABLE project_articles DROP COLUMN IF EXISTS article_id CASCADE
    """,
    """
    DELETE FROM project_articles
    WHERE sgrid IS NULL AND doi IS NULL AND pii IS NULL
    """,
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'project_articles_has_identifier'
        ) THEN
            ALTER TABLE project_articles
            ADD CONSTRAINT project_articles_has_identifier
            CHECK (sgrid IS NOT NULL OR doi IS NOT NULL OR pii IS NOT NULL);
        END IF;
    END
    $$
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_project_articles_project_added
        ON project_articles(project_id, added_at DESC)
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS idx_project_articles_unique_identifier
        ON project_articles(
            project_id,
            COALESCE(sgrid, ''),
            COALESCE(doi, ''),
            COALESCE(pii, '')
        )
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS idx_project_articles_unique_sgrid
        ON project_articles(project_id, sgrid)
        WHERE sgrid IS NOT NULL
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS idx_project_articles_unique_doi
        ON project_articles(project_id, doi)
        WHERE doi IS NOT NULL
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS idx_project_articles_unique_pii
        ON project_articles(project_id, pii)
        WHERE pii IS NOT NULL
    """,
    """
    DROP TABLE IF EXISTS articles CASCADE
    """,
]


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()


def normalize_email(email: str | None) -> str:
    normalized = (email or "").strip().lower()
    if not EMAIL_RE.match(normalized):
        raise HTTPException(status_code=401, detail="Provide a valid X-User-Email header")
    return normalized


async def init_schema(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        for statement in SCHEMA_STATEMENTS:
            await conn.execute(statement)


async def get_pool(request: Request) -> asyncpg.Pool:
    pool = getattr(request.app.state, "pg_pool", None)
    if pool:
        return pool

    database_url = os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)
    try:
        pool = await asyncpg.create_pool(database_url, min_size=1, max_size=5)
        await init_schema(pool)
    except OSError as exc:
        raise HTTPException(status_code=503, detail="Postgres is not available") from exc
    except asyncpg.PostgresError as exc:
        raise HTTPException(status_code=503, detail="Failed to initialize Postgres schema") from exc

    request.app.state.pg_pool = pool
    return pool


async def close_pool(app: Any) -> None:
    pool = getattr(app.state, "pg_pool", None)
    if pool:
        await pool.close()
        app.state.pg_pool = None


async def get_current_user(
    request: Request,
    x_user_email: str | None = Header(default=None, alias="X-User-Email"),
) -> dict[str, Any]:
    email = normalize_email(x_user_email)
    pool = await get_pool(request)
    user_id = new_uuid()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO users (id, email)
            VALUES ($1, $2)
            ON CONFLICT (email)
            DO UPDATE SET updated_at = now()
            RETURNING id, email, current_project_id
            """,
            user_id,
            email,
        )
    return {"id": row["id"], "email": row["email"], "current_project_id": row["current_project_id"]}
