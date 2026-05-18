#!/usr/bin/env python3
import asyncio
import argparse
import re
import sys

from playwright.async_api import async_playwright, BrowserContext

from api.clients.hh_client import vacancy_to_text, _page_to_vacancy_data, _VACANCY_URL_RE
from api.rag.indexer import ensure_collection, index_vacancy
from api.settings import settings
from qdrant_client import AsyncQdrantClient

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

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def _extract_skills(text: str) -> list[str]:
    text_lower = text.lower()
    return sorted(kw for kw in _SKILL_KEYWORDS if kw in text_lower)


async def _search_page(ctx: BrowserContext, query: str, area: int, page_num: int) -> list[dict]:
    """Return list of {id, name} from one search results page."""
    url = (
        f"https://hh.ru/search/vacancy"
        f"?text={query}&area={area}&items_on_page=100&page={page_num}"
    )
    page = await ctx.new_page()
    await page.goto(url, wait_until="domcontentloaded", timeout=30_000)

    links = await page.evaluate("""() => {
        const els = document.querySelectorAll('a[data-qa="serp-item__title-link"]');
        return Array.from(els).map(a => ({ href: a.href, title: a.textContent.trim() }));
    }""")
    await page.close()

    results = []
    for link in links:
        m = _VACANCY_URL_RE.search(link["href"])
        if m:
            results.append({"id": m.group(1), "name": link["title"]})
    return results


async def run(queries: list[str], pages: int, area: int, pause: float) -> None:
    qdrant = AsyncQdrantClient(url=settings.qdrant_url)
    print(f"Connecting to Qdrant at {settings.qdrant_url} ...")
    await ensure_collection(qdrant)
    print(f"Collection '{settings.qdrant_collection}' ready.\n")

    total_indexed = 0
    total_skipped = 0

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(user_agent=_USER_AGENT)

        for query in queries:
            print(f"Query: '{query}'")
            for page_num in range(pages):
                items = await _search_page(ctx, query, area, page_num)
                if not items:
                    print(f"  page {page_num}: no results, stopping.")
                    break

                print(f"  page {page_num}: {len(items)} vacancies found")

                for item in items:
                    vacancy_id = str(item["id"])
                    title = item.get("name", "")
                    try:
                        page = await ctx.new_page()
                        await page.goto(
                            f"https://hh.ru/vacancy/{vacancy_id}",
                            wait_until="domcontentloaded",
                            timeout=30_000,
                        )
                        data = await _page_to_vacancy_data(page)
                        await page.close()

                        text = vacancy_to_text(data)
                        skills = _extract_skills(text)
                        await index_vacancy(qdrant, vacancy_id, title, text, skills)
                        total_indexed += 1
                        if total_indexed % 20 == 0:
                            print(f"    ... {total_indexed} indexed so far")

                        await asyncio.sleep(pause)
                    except Exception as exc:
                        total_skipped += 1
                        print(f"    skip {vacancy_id} ({title[:40]}): {exc}", file=sys.stderr)

            print()

        await browser.close()

    print(f"Done. Indexed: {total_indexed} | Skipped: {total_skipped}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Index hh.ru vacancies into Qdrant via Playwright")
    parser.add_argument("--query", action="append", dest="queries", metavar="QUERY")
    parser.add_argument("--pages", type=int, default=3, help="Search pages per query (100 vacancies each)")
    parser.add_argument("--area", type=int, default=1, help="hh.ru area: 1=Moscow, 2=SPb, 0=Russia")
    parser.add_argument("--pause", type=float, default=2.0, help="Seconds between requests")
    args = parser.parse_args()

    asyncio.run(run(args.queries or DEFAULT_QUERIES, args.pages, args.area, args.pause))


if __name__ == "__main__":
    main()
