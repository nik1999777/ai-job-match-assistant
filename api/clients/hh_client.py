"""
Client for hh.ru public API.

Vacancies are publicly accessible without authentication.
Resumes require OAuth from the user (not implemented here — user pastes text).

Docs: https://api.hh.ru/openapi/redoc
"""
import re
from typing import Any

import httpx

HH_API_BASE = "https://api.hh.ru"

# hh.ru requires a User-Agent identifying the application
_HEADERS = {
    "User-Agent": "ai-job-match-assistant/1.0 (github.com/nik1999777/ai-job-match-assistant)",
    "HH-User-Agent": "ai-job-match-assistant/1.0",
}

# Matches both full URLs and short IDs:
# https://hh.ru/vacancy/123456789
# https://moscow.hh.ru/vacancy/123456789
_VACANCY_URL_RE = re.compile(r"hh\.ru/vacancy/(\d+)")
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")


def extract_vacancy_id(url_or_id: str) -> str:
    """Return numeric ID from hh.ru vacancy URL or passthrough raw ID."""
    m = _VACANCY_URL_RE.search(url_or_id)
    return m.group(1) if m else url_or_id.strip()


def vacancy_to_text(data: dict[str, Any]) -> str:
    """
    Convert hh.ru vacancy JSON → plain text for LLM and embeddings.

    hh.ru returns description as HTML — we strip all tags.
    """
    employer = data.get("employer", {}).get("name", "")
    title = data.get("name", "")

    # skills come as a list of {"name": "Python"} dicts
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
    """Fetch full vacancy JSON by numeric ID."""
    async with httpx.AsyncClient(headers=_HEADERS, timeout=10.0) as client:
        resp = await client.get(f"{HH_API_BASE}/vacancies/{vacancy_id}")
        resp.raise_for_status()
        return resp.json()


async def get_vacancy_by_url(url_or_id: str) -> tuple[str, dict[str, Any]]:
    """
    Fetch vacancy from URL or ID.
    Returns (plain_text, raw_json) so caller can access both.
    """
    vacancy_id = extract_vacancy_id(url_or_id)
    data = await get_vacancy(vacancy_id)
    return vacancy_to_text(data), data


async def search_vacancies(
    query: str,
    area: int = 1,       # 1 = Москва; 2 = Санкт-Петербург
    per_page: int = 100,
    page: int = 0,
) -> list[dict[str, Any]]:
    """
    Search vacancies via hh.ru API.

    Returns list of summary items (not full descriptions).
    Call get_vacancy(item["id"]) for full text.
    """
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
