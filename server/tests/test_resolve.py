import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

article_suggestions_stub = types.ModuleType("services.article_suggestions")


class ArticleSuggestionError(RuntimeError):
    pass


async def get_article_suggestions(_payload):
    return []


article_suggestions_stub.ArticleSuggestionError = ArticleSuggestionError
article_suggestions_stub.get_article_suggestions = get_article_suggestions
sys.modules["services.article_suggestions"] = article_suggestions_stub

redis_client_stub = types.ModuleType("services.redis_client")


async def cache_get(_key):
    return None


async def cache_set(_key, _value, _ttl):
    return None


redis_client_stub.cache_get = cache_get
redis_client_stub.cache_set = cache_set
sys.modules["services.redis_client"] = redis_client_stub

asyncpg_stub = types.ModuleType("asyncpg")
asyncpg_stub.PostgresError = RuntimeError
asyncpg_stub.Pool = object
asyncpg_stub.create_pool = AsyncMock()
sys.modules["asyncpg"] = asyncpg_stub

mos_client_stub = types.ModuleType("services.mos_client")
mos_client_stub.MosClientError = type("MosClientError", (RuntimeError,), {})
mos_client_stub.MosSdkError = type("MosSdkError", (RuntimeError,), {})


async def lexical_search_articles(**_kwargs):
    return []


async def llm_chat(*_args, **_kwargs):
    return SimpleNamespace(content="{}")


async def llm_stream_chat(*_args, **_kwargs):
    if False:
        yield None


mos_client_stub.lexical_search_articles = lexical_search_articles
mos_client_stub.llm_chat = llm_chat
mos_client_stub.llm_stream_chat = llm_stream_chat
sys.modules["services.mos_client"] = mos_client_stub

from routers import resolve as resolve_module
from services.es_client import ScopusArticle
from services.zotero_client import ZoteroArticleMetadata


GOOGLE_SCHOLAR_LOOKUP_URL = (
    "https://scholar.google.com/scholar_lookup?"
    "title=Delivering+green+buildings:+Process+improvements+for+sustainable+construction"
    "&author=Michael+J+Horman"
    "&year=2006"
    "&doi=10.3992/jgb.1.1.123"
)


SUGGESTIONS = {"questions": [], "actions": []}
PROJECT_ROW = {
    "id": "project-1",
    "user_id": "user-1",
    "name": "Cold chain vaccine stability",
    "description": None,
    "criteria": [],
    "created_at": None,
    "updated_at": None,
}
EVALUATION = {
    "project_id": "project-1",
    "project_name": "Cold chain vaccine stability",
    "llm_overall": {
        "rating_level": 4,
        "rating_label": "Strong match",
        "score_percent": 75,
    },
}
PROJECT_MATCH = {
    "project_id": "project-1",
    "project_name": "Cold chain vaccine stability",
    "rating_level": 4,
    "rating_label": "Strong match",
    "score_percent": 75,
}


class _AcquireContext:
    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, _exc_type, _exc, _tb):
        return False


class _Pool:
    def __init__(self, conn):
        self.conn = conn

    def acquire(self):
        return _AcquireContext(self.conn)


class _ResolveRequest:
    def __init__(self, headers=None, pool=None):
        self.headers = headers or {}
        self.app = SimpleNamespace(state=SimpleNamespace(pg_pool=pool))


class ResolveTests(unittest.IsolatedAsyncioTestCase):
    async def test_url_query_doi_resolves_before_zotero(self):
        article = ScopusArticle(sgrid="SGRID:1", doi="10.3992/jgb.1.1.123", pii="PII1")

        with (
            patch.object(resolve_module, "cache_get", AsyncMock(return_value=None)),
            patch.object(resolve_module, "cache_set", AsyncMock()),
            patch.object(resolve_module, "fetch_scopus_article_by_doi", AsyncMock(return_value=article)) as fetch_by_doi,
            patch.object(resolve_module, "resolve_article_metadata_from_url", AsyncMock()) as zotero,
            patch.object(resolve_module, "get_article_suggestions", AsyncMock(return_value=SUGGESTIONS)),
        ):
            response = await resolve_module.resolve(request=None, url=GOOGLE_SCHOLAR_LOOKUP_URL, doi=None)

        fetch_by_doi.assert_awaited_once_with("10.3992/jgb.1.1.123")
        zotero.assert_not_called()
        self.assertEqual(response["doi"], "10.3992/jgb.1.1.123")
        self.assertEqual(response["sgrid"], "SGRID:1")
        self.assertEqual(response["scopus_url"], "https://www.scopus.com/pages/publications/SGRID:1")
        self.assertIsNone(response["project_match"])

    async def test_doi_miss_falls_back_to_zotero_title_resolution(self):
        metadata = ZoteroArticleMetadata(
            title="Delivering green buildings: Process improvements for sustainable construction",
            year=2006,
        )
        article = ScopusArticle(sgrid="SGRID:2", title=metadata.title, doi="10.3992/jgb.1.1.123")

        with (
            patch.object(resolve_module, "cache_get", AsyncMock(return_value=None)),
            patch.object(resolve_module, "cache_set", AsyncMock()),
            patch.object(resolve_module, "fetch_scopus_article_by_doi", AsyncMock(return_value=None)) as fetch_by_doi,
            patch.object(resolve_module, "resolve_article_metadata_from_url", AsyncMock(return_value=metadata)) as zotero,
            patch.object(resolve_module, "_resolve_by_lexical_search", AsyncMock(return_value=article)) as lexical,
            patch.object(resolve_module, "get_article_suggestions", AsyncMock(return_value=SUGGESTIONS)),
        ):
            response = await resolve_module.resolve(request=None, url=GOOGLE_SCHOLAR_LOOKUP_URL, doi=None)

        fetch_by_doi.assert_awaited_once_with("10.3992/jgb.1.1.123")
        zotero.assert_awaited_once_with(GOOGLE_SCHOLAR_LOOKUP_URL)
        lexical.assert_awaited_once_with(metadata)
        self.assertEqual(response["sgrid"], "SGRID:2")

    def test_extracts_only_valid_doi_query_param(self):
        self.assertEqual(resolve_module._doi_from_url_query(GOOGLE_SCHOLAR_LOOKUP_URL), "10.3992/jgb.1.1.123")
        self.assertIsNone(resolve_module._doi_from_url_query("https://example.test/article?doi=not-a-doi"))
        self.assertIsNone(resolve_module._doi_from_url_query("https://example.test/article"))

    async def test_resolve_cache_miss_with_current_project_returns_project_match_and_excludes_cache(self):
        article = ScopusArticle(sgrid="SGRID:1", doi="10.3992/jgb.1.1.123", pii="PII1")

        with (
            patch.object(resolve_module, "cache_get", AsyncMock(return_value=None)),
            patch.object(resolve_module, "cache_set", AsyncMock()) as cache_set_mock,
            patch.object(resolve_module, "fetch_scopus_article_by_doi", AsyncMock(return_value=article)),
            patch.object(resolve_module, "get_article_suggestions", AsyncMock(return_value=SUGGESTIONS)),
            patch.object(resolve_module, "_current_project_for_request", AsyncMock(return_value=PROJECT_ROW)),
            patch.object(resolve_module, "evaluate_article_for_project", AsyncMock(return_value=EVALUATION)) as evaluate,
        ):
            response = await resolve_module.resolve(request=object(), url=GOOGLE_SCHOLAR_LOOKUP_URL, doi=None)

        evaluate.assert_awaited_once_with("SGRID:1", PROJECT_ROW)
        self.assertEqual(response["project_match"], PROJECT_MATCH)
        cache_set_mock.assert_awaited_once()
        cached_payload = cache_set_mock.await_args.args[1]
        self.assertNotIn("project_match", cached_payload)

    async def test_resolve_cache_hit_with_sgrid_computes_project_match(self):
        cached = {
            "doi": "10.3992/jgb.1.1.123",
            "sgrid": "SGRID:1",
            "pii": "PII1",
            "scopus_url": "https://www.scopus.com/pages/publications/SGRID:1",
            "sciencedirect_url": "https://www.sciencedirect.com/science/article/pii/PII1",
            "suggestions": SUGGESTIONS,
            "project_match": {"project_id": "stale"},
            "_suggestion_prompt_version": "internal",
        }

        request = object()
        with (
            patch.object(resolve_module, "cache_get", AsyncMock(return_value=cached)),
            patch.object(resolve_module, "cache_set", AsyncMock()) as cache_set_mock,
            patch.object(resolve_module, "_project_match_for_request", AsyncMock(return_value=PROJECT_MATCH)) as match,
        ):
            response = await resolve_module.resolve(request=request, url=GOOGLE_SCHOLAR_LOOKUP_URL, doi=None)

        match.assert_awaited_once_with(request, "SGRID:1")
        cache_set_mock.assert_not_called()
        self.assertEqual(response["project_match"], PROJECT_MATCH)
        self.assertNotIn("_suggestion_prompt_version", response)

    async def test_resolve_without_user_email_returns_null_project_match(self):
        article = ScopusArticle(sgrid="SGRID:1", doi="10.3992/jgb.1.1.123")

        with (
            patch.object(resolve_module, "cache_get", AsyncMock(return_value=None)),
            patch.object(resolve_module, "cache_set", AsyncMock()),
            patch.object(resolve_module, "fetch_scopus_article_by_doi", AsyncMock(return_value=article)),
            patch.object(resolve_module, "get_article_suggestions", AsyncMock(return_value=SUGGESTIONS)),
            patch.object(resolve_module, "evaluate_article_for_project", AsyncMock()) as evaluate,
        ):
            response = await resolve_module.resolve(
                request=_ResolveRequest(),
                url=GOOGLE_SCHOLAR_LOOKUP_URL,
                doi=None,
            )

        evaluate.assert_not_called()
        self.assertIsNone(response["project_match"])

    async def test_user_with_no_current_project_returns_null_project_match(self):
        conn = SimpleNamespace(
            fetchrow=AsyncMock(return_value={"id": "user-1", "current_project_id": None}),
        )
        request = _ResolveRequest(headers={"X-User-Email": "researcher@example.com"}, pool=_Pool(conn))

        project = await resolve_module._current_project_for_request(request)

        self.assertIsNone(project)
        conn.fetchrow.assert_awaited_once()

    async def test_project_evaluation_failure_returns_null_project_match(self):
        article = ScopusArticle(sgrid="SGRID:1", doi="10.3992/jgb.1.1.123")

        with (
            patch.object(resolve_module, "cache_get", AsyncMock(return_value=None)),
            patch.object(resolve_module, "cache_set", AsyncMock()),
            patch.object(resolve_module, "fetch_scopus_article_by_doi", AsyncMock(return_value=article)),
            patch.object(resolve_module, "get_article_suggestions", AsyncMock(return_value=SUGGESTIONS)),
            patch.object(resolve_module, "_current_project_for_request", AsyncMock(return_value=PROJECT_ROW)),
            patch.object(
                resolve_module,
                "evaluate_article_for_project",
                AsyncMock(side_effect=resolve_module.ProjectEvaluationError("LLM unavailable")),
            ),
        ):
            response = await resolve_module.resolve(request=object(), url=GOOGLE_SCHOLAR_LOOKUP_URL, doi=None)

        self.assertIsNone(response["project_match"])


if __name__ == "__main__":
    unittest.main()
