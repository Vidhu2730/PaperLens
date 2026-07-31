import json
import sys
import types
import unittest
from uuid import uuid4
from unittest.mock import AsyncMock, patch

redis_client_stub = types.ModuleType("services.redis_client")


async def cache_get(_key):
    return None


async def cache_set(_key, _value, _ttl):
    return None


redis_client_stub.cache_get = cache_get
redis_client_stub.cache_set = cache_set
sys.modules["services.redis_client"] = redis_client_stub

llm_client_stub = types.ModuleType("services.llm_client")


class LLMServiceError(RuntimeError):
    pass


class LLMOptions:
    def __init__(self, response_format=None, extra_params=None):
        self.response_format = response_format
        self.extra_params = extra_params


async def chat(_messages, _options=None):
    return "{}"


llm_client_stub.LLMServiceError = LLMServiceError
llm_client_stub.LLMOptions = LLMOptions
llm_client_stub.chat = chat
sys.modules["services.llm_client"] = llm_client_stub

asyncpg_stub = types.ModuleType("asyncpg")
asyncpg_stub.PostgresError = RuntimeError
asyncpg_stub.Pool = object
asyncpg_stub.create_pool = AsyncMock()
sys.modules["asyncpg"] = asyncpg_stub

from services.es_client import ScopusArticle
from services import project_evaluation as evaluation
from routers import projects as projects_module


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


class ProjectEvaluationTests(unittest.IsolatedAsyncioTestCase):
    def test_rating_conversion_and_computed_score(self):
        self.assertEqual(evaluation.normalize_rating_level(1), 1)
        self.assertEqual(evaluation.normalize_rating_level(None, "Strong match"), 4)
        self.assertEqual(evaluation.rating_percent(5), 100)
        self.assertEqual(evaluation.rating_percent(2), 25)
        self.assertEqual(evaluation.computed_overall_score([100, 50], 25), 65)
        self.assertEqual(evaluation.computed_overall_score([], 75), 75)

    def test_sanitize_preserves_project_criteria_and_normalizes_scores(self):
        project = {
            "id": "project-1",
            "name": "Vaccine stability",
            "description": "Cold chain evidence",
            "criteria": ["Studies refrigerated storage", "Includes human clinical evidence"],
        }
        article = {"sgrid": "SGRID:1", "title": "Example"}
        payload = {
            "overall": {
                "rating_level": 4,
                "rating_label": "No match",
                "reasoning_summary": "Relevant to storage stability.",
            },
            "criteria": [
                {
                    "criterion": "Studies refrigerated storage",
                    "rating_level": 5,
                    "rating_label": "Weak match",
                    "evidence": "The abstract discusses refrigerated storage.",
                },
                {
                    "criterion": "Extra criterion",
                    "rating_level": 5,
                    "evidence": "Should be ignored.",
                },
            ],
        }

        result = evaluation.sanitize_llm_evaluation(payload, article, project)

        self.assertEqual(result["llm_overall"]["rating_label"], "Strong match")
        self.assertEqual(result["llm_overall_score_percent"], 75)
        self.assertEqual(result["criteria"][0]["score_percent"], 100)
        self.assertEqual(result["criteria"][1]["rating_label"], "No match")
        self.assertEqual(result["criteria"][1]["score_percent"], 0)
        self.assertEqual(result["criterion_average_score_percent"], 50)
        self.assertEqual(result["computed_overall_score_percent"], 55)
        self.assertEqual(result["match_score"], 55)

    async def test_evaluate_returns_cached_result_without_article_or_llm_lookup(self):
        cached = {"match_score": 75, "cached": False}

        with (
            patch.object(evaluation, "cache_get", AsyncMock(return_value=cached)),
            patch.object(evaluation, "fetch_scopus_article_by_sgrid", AsyncMock()) as fetch_article,
            patch.object(evaluation, "chat", AsyncMock()) as llm_chat,
        ):
            result = await evaluation.evaluate_article_for_project(
                "SGRID:1",
                {"id": "project-1", "name": "Project", "description": None, "criteria": []},
            )

        fetch_article.assert_not_called()
        llm_chat.assert_not_called()
        self.assertEqual(result["match_score"], 75)
        self.assertTrue(result["cached"])

    async def test_evaluate_generates_and_caches_result(self):
        article = ScopusArticle(
            sgrid="SGRID:1",
            title="Example article",
            abstract="This article studies refrigerated storage.",
            keywords=["storage"],
            publicationYear=2024,
        )
        llm_payload = {
            "overall": {
                "rating_level": 4,
                "rating_label": "Strong match",
                "reasoning_summary": "The article addresses the project topic.",
            },
            "criteria": [
                {
                    "criterion": "Studies refrigerated storage",
                    "rating_level": 5,
                    "rating_label": "Excellent match",
                    "evidence": "The abstract studies refrigerated storage.",
                }
            ],
        }

        with (
            patch.object(evaluation, "cache_get", AsyncMock(return_value=None)),
            patch.object(evaluation, "cache_set", AsyncMock()) as set_cache,
            patch.object(evaluation, "fetch_scopus_article_by_sgrid", AsyncMock(return_value=article)) as fetch_article,
            patch.object(evaluation, "chat", AsyncMock(return_value=json.dumps(llm_payload))) as llm_chat,
        ):
            result = await evaluation.evaluate_article_for_project(
                "SGRID:1",
                {
                    "id": "project-1",
                    "name": "Cold chain project",
                    "description": "Storage criteria",
                    "criteria": ["Studies refrigerated storage"],
                },
            )

        fetch_article.assert_awaited_once_with("SGRID:1")
        llm_chat.assert_awaited_once()
        set_cache.assert_awaited_once()
        self.assertFalse(result["cached"])
        self.assertEqual(result["llm_overall_score_percent"], 75)
        self.assertEqual(result["criterion_average_score_percent"], 100)
        self.assertEqual(result["computed_overall_score_percent"], 95)

    async def test_project_route_checks_project_and_calls_service(self):
        project_id = uuid4()
        project = {
            "id": project_id,
            "user_id": "user-1",
            "name": "Cold chain project",
            "description": None,
            "criteria": ["Studies refrigerated storage"],
            "created_at": None,
            "updated_at": None,
        }
        conn = types.SimpleNamespace(fetchrow=AsyncMock(return_value=project))

        with (
            patch.object(projects_module, "get_pool", AsyncMock(return_value=_Pool(conn))),
            patch.object(
                projects_module,
                "evaluate_article_for_project",
                AsyncMock(return_value={"match_score": 95}),
            ) as evaluate_service,
        ):
            result = await projects_module.evaluate_article(
                project_id=project_id,
                sgrid="SGRID:1",
                request=object(),
                user={"id": "user-1"},
            )

        evaluate_service.assert_awaited_once_with("SGRID:1", project)
        self.assertEqual(result["match_score"], 95)


if __name__ == "__main__":
    unittest.main()
