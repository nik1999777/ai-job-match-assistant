#!/usr/bin/env python3
"""Index hh.ru vacancies into Qdrant.

Search pages: Playwright (API requires OAuth2 for search).
Individual vacancies: hh.ru official API (salary + key_skills), Playwright fallback.
"""
import asyncio
import argparse
import sys

from playwright.async_api import async_playwright, BrowserContext

from api.clients.hh_client import vacancy_to_text, get_vacancy, _page_to_vacancy_data, _VACANCY_URL_RE
from api.ml.skill_extractor import SkillExtractor
from api.rag.indexer import ensure_collection, index_vacancy
from api.settings import settings
from qdrant_client import AsyncQdrantClient

_skill_extractor = SkillExtractor()

DEFAULT_QUERIES = [
    # AI / ML
    "ML Engineer",
    "LLM Engineer",
    "AI Engineer",
    "Machine Learning разработчик",
    "Data Scientist",
    # Backend
    "Python разработчик",
    "Backend разработчик",
    "Java разработчик",
    "Go разработчик",
    "Node.js разработчик",
    "PHP разработчик",
    "C# разработчик",
    "Kotlin разработчик",
    "Ruby разработчик",
    # Frontend
    "Frontend разработчик",
    "React разработчик",
    "Vue разработчик",
    "Angular разработчик",
    "TypeScript разработчик",
    # Fullstack
    "Fullstack разработчик",
    # Mobile
    "iOS разработчик",
    "Android разработчик",
    "Flutter разработчик",
    "React Native разработчик",
    # DevOps / Infra / Cloud
    "DevOps инженер",
    "Site Reliability Engineer",
    "Cloud Engineer",
    # Data
    "Data Engineer",
    "Data Analyst",
    "BI аналитик",
    # QA
    "QA Engineer",
    "Автоматизатор тестирования",
    # Security
    "Инженер по информационной безопасности",
    # Embedded / Low-level
    "Embedded разработчик",
    "C++ разработчик",
    # Architecture & Leadership
    "Solution Architect",
    "Tech Lead",
    "Team Lead разработчик",
    # Management
    "Product Manager",
    "Project Manager",
    # Design
    "UX Designer",
    "UI Designer",
    "Product Designer",
]

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def _salary_str(data: dict) -> str | None:
    salary = data.get("salary")
    if not salary:
        return None
    lo = salary.get("from")
    hi = salary.get("to")
    curr = salary.get("currency", "RUR")
    sym = {"RUR": "₽", "USD": "$", "EUR": "€", "KZT": "₸", "UAH": "₴"}.get(curr, curr)
    if lo and hi:
        return f"{lo:,}–{hi:,} {sym}".replace(",", " ")
    if lo:
        return f"от {lo:,} {sym}".replace(",", " ")
    if hi:
        return f"до {hi:,} {sym}".replace(",", " ")
    return None


async def _search_page(ctx: BrowserContext, query: str, area: int, page_num: int, debug: bool = False) -> list[dict]:
    """Return list of {id, name} from one search results page via Playwright."""
    url = (
        f"https://hh.ru/search/vacancy"
        f"?text={query}&area={area}&items_on_page=100&page={page_num}&no_magic=true"
    )
    page = await ctx.new_page()
    await page.goto(url, wait_until="domcontentloaded", timeout=60_000)
    await asyncio.sleep(3)

    if debug:
        screenshot_path = f"/tmp/hh_debug_{page_num}.png"
        await page.screenshot(path=screenshot_path, full_page=False)
        print(f"  [debug] screenshot saved: {screenshot_path}")
        title = await page.title()
        print(f"  [debug] page title: {title}")

    links = await page.evaluate("""() => {
        let els = document.querySelectorAll('a[data-qa="serp-item__title-link"]');
        if (!els.length) els = document.querySelectorAll('a[data-qa="vacancy-serp__vacancy-title"]');
        if (!els.length) {
            const all = Array.from(document.querySelectorAll('a[href*="/vacancy/"]'))
                .filter(a => /\\/vacancy\\/\\d+/.test(a.href) && a.textContent.trim().length > 5);
            const seen = new Set();
            els = all.filter(a => {
                const key = a.href.split('?')[0];
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            return Array.from(els).map(a => ({ href: a.href, title: a.textContent.trim() }));
        }
        return Array.from(els).map(a => ({ href: a.href, title: a.textContent.trim() }));
    }""")
    await page.close()

    results = []
    for link in links:
        m = _VACANCY_URL_RE.search(link["href"])
        if m:
            results.append({"id": m.group(1), "name": link["title"]})
    return results


async def run(queries: list[str], pages: int, area: int, pause: float, debug: bool = False) -> None:
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
                items = await _search_page(ctx, query, area, page_num, debug=debug)
                if not items:
                    print(f"  page {page_num}: no results, stopping.")
                    break

                print(f"  page {page_num}: {len(items)} vacancies found")

                for item in items:
                    vacancy_id = str(item["id"])
                    title = item.get("name", "")
                    try:
                        # Official API: richer data (salary, key_skills), faster than Playwright
                        try:
                            data = await get_vacancy(vacancy_id)
                        except Exception:
                            # Fallback to Playwright if API blocked
                            vpage = await ctx.new_page()
                            await vpage.goto(
                                f"https://hh.ru/vacancy/{vacancy_id}",
                                wait_until="domcontentloaded",
                                timeout=30_000,
                            )
                            data = await _page_to_vacancy_data(vpage)
                            await vpage.close()

                        text = vacancy_to_text(data)
                        company = data.get("employer", {}).get("name", "")
                        salary = _salary_str(data)
                        # Tier 1: official hh.ru tags (HR-normalized)
                        # Tier 2: BERT NER on text (catches skills not in tags)
                        api_skills = [s["name"] for s in data.get("key_skills", [])]
                        ner_skills = _skill_extractor.extract(text)
                        seen: set[str] = set()
                        skills: list[str] = []
                        for s in api_skills + ner_skills:
                            key = s.lower()
                            if key not in seen:
                                seen.add(key)
                                skills.append(s)
                        url = f"https://hh.ru/vacancy/{vacancy_id}"
                        await index_vacancy(
                            qdrant, vacancy_id, title, text, skills,
                            url=url, company=company, salary_str=salary,
                        )
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
    parser = argparse.ArgumentParser(description="Index hh.ru vacancies into Qdrant")
    parser.add_argument("--query", action="append", dest="queries", metavar="QUERY")
    parser.add_argument("--pages", type=int, default=3, help="Search pages per query (100 vacancies each)")
    parser.add_argument("--area", type=int, default=113, help="hh.ru area: 113=Russia, 1=Moscow, 2=SPb")
    parser.add_argument("--pause", type=float, default=1.5, help="Seconds between requests")
    parser.add_argument("--debug", action="store_true", help="Save screenshot of first search page")
    args = parser.parse_args()

    asyncio.run(run(args.queries or DEFAULT_QUERIES, args.pages, args.area, args.pause, args.debug))


if __name__ == "__main__":
    main()
