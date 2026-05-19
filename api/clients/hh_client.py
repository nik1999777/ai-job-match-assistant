import json
import re
from typing import Any

import httpx

HH_API_BASE = "https://api.hh.ru"

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
}

_VACANCY_URL_RE = re.compile(r"hh\.ru/vacancy/(\d+)")
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")


def extract_vacancy_id(url_or_id: str) -> str:
    m = _VACANCY_URL_RE.search(url_or_id)
    return m.group(1) if m else url_or_id.strip()


def vacancy_to_text(data: dict[str, Any]) -> str:
    employer = data.get("employer", {}).get("name", "")
    title = data.get("name", "")
    skills = [s["name"] for s in data.get("key_skills", [])]

    raw_desc = data.get("description", "")
    desc = _HTML_TAG_RE.sub(" ", raw_desc)
    desc = _WHITESPACE_RE.sub(" ", desc).strip()

    parts = filter(None, [
        title,
        f"Компания: {employer}" if employer else "",
        f"Навыки: {', '.join(skills)}" if skills else "",
        desc,
    ])
    return "\n\n".join(parts)


async def get_vacancy(vacancy_id: str) -> dict[str, Any]:
    async with httpx.AsyncClient(headers=_HEADERS, timeout=10.0) as client:
        resp = await client.get(f"{HH_API_BASE}/vacancies/{vacancy_id}")
        resp.raise_for_status()
        return resp.json()


async def _page_to_vacancy_data(page: Any) -> dict[str, Any]:
    # try JSON-LD (Schema.org JobPosting) — most reliable
    try:
        raw = await page.evaluate("""() => {
            for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
                try {
                    const d = JSON.parse(s.textContent);
                    if (d['@type'] === 'JobPosting') return s.textContent;
                } catch(e) {}
            }
            return null;
        }""")
        if raw:
            ld = json.loads(raw)
            return {
                "name": ld.get("title", ""),
                "employer": {"name": ld.get("hiringOrganization", {}).get("name", "")},
                "description": ld.get("description", ""),
                "key_skills": [],
            }
    except Exception:
        pass

    # fallback: DOM selectors
    title_el = await page.query_selector('[data-qa="vacancy-title"]')
    title = (await title_el.inner_text()) if title_el else await page.title()

    company_el = await page.query_selector('[data-qa="vacancy-company-name"]')
    company = (await company_el.inner_text()) if company_el else ""

    desc_el = await page.query_selector('[data-qa="vacancy-description"]')
    description = (await desc_el.inner_text()) if desc_el else ""

    skill_els = await page.query_selector_all('[data-qa="bloko-tag__text"]')
    skills = [{"name": await el.inner_text()} for el in skill_els]

    return {
        "name": title.strip(),
        "employer": {"name": company.strip()},
        "description": description,
        "key_skills": skills,
    }


async def get_vacancy_by_url(url_or_id: str) -> tuple[str, dict[str, Any]]:
    """Fetch hh.ru vacancy: official API first, Playwright as fallback."""
    vacancy_id = extract_vacancy_id(url_or_id)

    # official hh.ru API — no auth required for public vacancies
    try:
        data = await get_vacancy(vacancy_id)
        return vacancy_to_text(data), data
    except Exception:
        pass

    # fallback: Playwright (handles DDoS Guard, login walls, etc.)
    from playwright.async_api import async_playwright

    target_url = f"https://hh.ru/vacancy/{vacancy_id}"
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(user_agent=_HEADERS["User-Agent"])
        page = await ctx.new_page()
        await page.goto(target_url, wait_until="domcontentloaded", timeout=30_000)
        data = await _page_to_vacancy_data(page)
        await browser.close()

    return vacancy_to_text(data), data


async def search_vacancies(
    query: str,
    area: int = 1,  # 1 = Москва, 2 = Санкт-Петербург, 0 = Россия
    per_page: int = 100,
    page: int = 0,
) -> list[dict[str, Any]]:
    params = {
        "text": query,
        "area": area,
        "per_page": per_page,
        "page": page,
        "only_with_salary": False,
    }
    async with httpx.AsyncClient(headers=_HEADERS, timeout=15.0) as client:
        resp = await client.get(f"{HH_API_BASE}/vacancies", params=params)
        resp.raise_for_status()
        return resp.json().get("items", [])
