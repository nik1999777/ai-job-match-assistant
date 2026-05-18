#!/usr/bin/env python3
"""
Fetch vacancies from hh.ru public API and index them into Qdrant.

This script populates the RAG knowledge base. Run it once before starting the API.
hh.ru rate limit: ~5 req/sec on public endpoints — we add small delays.

Usage:
    # index 300 vacancies for 3 ML-related queries
    python -m scripts.index_vacancies

    # custom queries and pages
    python -m scripts.index_vacancies --query "LLM Engineer" --query "ML инженер" --pages 5

    # index for a specific city (area=2 is Saint-Petersburg)
    python -m scripts.index_vacancies --area 2
"""
import asyncio
import argparse
import sys

from qdrant_client import AsyncQdrantClient

from api.clients.hh_client import get_vacancy, search_vacancies, vacancy_to_text
from api.rag.indexer import ensure_collection, index_vacancy
from api.settings import settings

# Tech skills to extract from vacancy text for Qdrant payload
_SKILL_KEYWORDS = {
    "python", "pytorch", "tensorflow", "keras", "fastapi", "flask", "django",
    "langchain", "langgraph", "openai", "ollama", "llm", "gpt", "claude",
    "qdrant", "faiss", "milvus", "pgvector", "elasticsearch",
    "peft", "lora", "qlora", "transformers", "bert", "rag", "fine-tuning",
    "scikit-learn", "xgboost", "catboost",
    "docker", "kubernetes", "kafka", "redis", "postgresql", "clickhouse",
    "spark", "airflow", "mlflow", "wandb",
    "java", "go", "rust", "c++", "sql",
}

DEFAULT_QUERIES = [
    "ML Engineer",
    "LLM Engineer",
    "NLP инженер",
    "Machine Learning",
    "AI разработчик",
]


def _extract_skills(text: str) -> list[str]:
    text_lower = text.lower()
    return sorted(kw for kw in _SKILL_KEYWORDS if kw in text_lower)


async def run(queries: list[str], pages: int, area: int) -> None:
    client = AsyncQdrantClient(url=settings.qdrant_url)

    print(f"Connecting to Qdrant at {settings.qdrant_url} ...")
    await ensure_collection(client)
    print(f"Collection '{settings.qdrant_collection}' ready.\n")

    total_indexed = 0
    total_skipped = 0

    for query in queries:
        print(f"Query: '{query}'")
        for page in range(pages):
            items = await search_vacancies(query, area=area, per_page=100, page=page)
            if not items:
                print(f"  page {page}: no results, stopping.")
                break

            print(f"  page {page}: {len(items)} vacancies found")

            for item in items:
                vacancy_id = str(item["id"])
                title = item.get("name", "")
                try:
                    detail = await get_vacancy(vacancy_id)
                    text = vacancy_to_text(detail)
                    skills = _extract_skills(text)
                    await index_vacancy(client, vacancy_id, title, text, skills)
                    total_indexed += 1
                    if total_indexed % 50 == 0:
                        print(f"    ... {total_indexed} indexed so far")
                    # be polite to hh.ru: ~5 req/sec
                    await asyncio.sleep(0.2)
                except Exception as exc:
                    total_skipped += 1
                    print(f"    skip {vacancy_id} ({title[:40]}): {exc}", file=sys.stderr)

        print()

    print(f"Done. Indexed: {total_indexed} | Skipped: {total_skipped}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Index hh.ru vacancies into Qdrant")
    parser.add_argument(
        "--query",
        action="append",
        dest="queries",
        metavar="QUERY",
        help="Search query (can be used multiple times)",
    )
    parser.add_argument(
        "--pages",
        type=int,
        default=3,
        help="Pages to fetch per query (100 vacancies/page, default: 3)",
    )
    parser.add_argument(
        "--area",
        type=int,
        default=1,
        help="hh.ru area ID: 1=Москва, 2=Питер, 0=Россия (default: 1)",
    )
    args = parser.parse_args()

    queries = args.queries or DEFAULT_QUERIES
    asyncio.run(run(queries, args.pages, args.area))


if __name__ == "__main__":
    main()
