import sys
import types
import unittest
from unittest.mock import AsyncMock, patch

article_suggestions_stub = types.ModuleType("services.article_suggestions")


class ArticleSuggestionError(RuntimeError):
    pass


async def get_article_suggestions(_payload):
    return {"questions": [], "actions": []}


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

from routers import article as article_module
from services.es_client import ScopusArticle


class ArticleTests(unittest.IsolatedAsyncioTestCase):
    async def test_article_response_includes_links_and_suggestions(self):
        record = ScopusArticle(
            sgrid="33748458326",
            doi="10.1016/example",
            pii="S1234567890123456",
            title="Example article",
        )
        suggestions = {
            "questions": [{"label": "Key finding", "prompt": "What is the key finding?"}],
            "actions": [{"label": "Summarize", "prompt": "Summarize this article."}],
        }

        with (
            patch.object(article_module, "fetch_scopus_article_by_sgrid", AsyncMock(return_value=record)) as fetch_article,
            patch.object(article_module, "get_article_suggestions", AsyncMock(return_value=suggestions)) as get_suggestions,
        ):
            response = await article_module.article(sgrid="33748458326")

        fetch_article.assert_awaited_once_with("33748458326")
        get_suggestions.assert_awaited_once()
        self.assertEqual(response["sgrid"], "33748458326")
        self.assertEqual(response["scopus_url"], "https://www.scopus.com/pages/publications/33748458326")
        self.assertEqual(
            response["sciencedirect_url"],
            "https://www.sciencedirect.com/science/article/pii/S1234567890123456",
        )
        self.assertEqual(response["suggestions"], suggestions)

    async def test_similar_articles_returns_redis_cache_hit(self):
        cached = {
            "sgrid": "33748458326",
            "query": "Example article",
            "count": 1,
            "results": [{"sgrid": "RELATED:1", "title": "Related article"}],
        }

        with (
            patch.object(article_module, "cache_get", AsyncMock(return_value=cached)) as get_cache,
            patch.object(article_module, "fetch_scopus_article_by_sgrid", AsyncMock()) as fetch_article,
            patch.object(article_module, "vector_search_articles", AsyncMock()) as vector_search,
        ):
            response = await article_module.similar_articles(sgrid="33748458326", size=10)

        get_cache.assert_awaited_once_with("article:similar:sgrid:33748458326:v1:size:10")
        fetch_article.assert_not_awaited()
        vector_search.assert_not_awaited()
        self.assertEqual(response, cached)

    async def test_similar_articles_searches_and_caches_by_sgrid(self):
        record = ScopusArticle(
            sgrid="33748458326",
            doi="10.1016/example",
            title="Example article",
        )
        current_candidate = types.SimpleNamespace(
            sgrid="33748458326",
            doi="10.1016/example",
            pii=None,
            title="Example article",
            abstract="Current",
            authors=[],
            sourceTitle="Journal",
            keywords=[],
            publicationYear=2024,
            citations=[],
            relevance=None,
            scopus_link=None,
        )
        related_candidate = types.SimpleNamespace(
            sgrid="RELATED:1",
            doi="10.1016/related",
            pii="PII1",
            title="Related article",
            abstract="Related abstract",
            authors=[],
            sourceTitle="Related Journal",
            keywords=["keyword"],
            publicationYear=2023,
            citations=["C1"],
            relevance=None,
            scopus_link=None,
        )

        with (
            patch.object(article_module, "cache_get", AsyncMock(return_value=None)),
            patch.object(article_module, "cache_set", AsyncMock()) as set_cache,
            patch.object(article_module, "fetch_scopus_article_by_sgrid", AsyncMock(return_value=record)) as fetch_article,
            patch.object(
                article_module,
                "vector_search_articles",
                AsyncMock(return_value=[current_candidate, related_candidate]),
            ) as vector_search,
        ):
            response = await article_module.similar_articles(sgrid="33748458326", size=10)

        fetch_article.assert_awaited_once_with("33748458326")
        vector_search.assert_awaited_once_with(
            query="Example article",
            number_of_results=11,
            starting_year=article_module.DEFAULT_STARTING_YEAR,
        )
        set_cache.assert_awaited_once()
        cache_key, cached_payload, ttl = set_cache.await_args.args
        self.assertEqual(cache_key, "article:similar:sgrid:33748458326:v1:size:10")
        self.assertEqual(ttl, article_module.SIMILAR_ARTICLES_CACHE_TTL)
        self.assertEqual(cached_payload, response)
        self.assertEqual(response["query"], "Example article")
        self.assertEqual(response["count"], 1)
        self.assertEqual(response["results"][0]["sgrid"], "RELATED:1")
        self.assertEqual(response["results"][0]["citationCount"], 1)


if __name__ == "__main__":
    unittest.main()
