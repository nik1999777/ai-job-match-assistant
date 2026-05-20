import re
from typing import Any, Protocol, runtime_checkable
from urllib.parse import urlencode

from pydantic import BaseModel

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_REL_VACANCY_RE = re.compile(r"/vacancy/(\d+)")


class SearchFilters(BaseModel):
    query: str
    area: int = 1                    # 1=Москва, 2=СПб, 113=вся Россия
    experience: str | None = None    # noExperience|between1And3|between3And6|moreThan6
    salary_from: int | None = None
    remote: bool = False
    count: int = 10


class VacancyItem(BaseModel):
    id: str
    title: str
    company: str
    url: str
    text: str
    salary_str: str | None = None


@runtime_checkable
class VacancySearchProvider(Protocol):
    async def search(self, filters: SearchFilters) -> list[VacancyItem]: ...


_EXTRACT_JS = """() => {
    const cards = document.querySelectorAll('[data-qa="vacancy-serp__vacancy"]');
    return Array.from(cards).map(card => {
        const titleEl = card.querySelector('a[data-qa="serp-item__title"]');
        const compEl  = card.querySelector('[data-qa="vacancy-serp__vacancy-employer-text"]');
        const addrEl  = card.querySelector('[data-qa="vacancy-serp__vacancy-address"]');
        const expEl   = card.querySelector('[data-qa*="vacancy-serp__vacancy-work-experience"]');
        const href    = titleEl ? titleEl.href : "";
        const idMatch = href.match(/\\/vacancy\\/(\\d+)/);
        return {
            id:      idMatch ? idMatch[1] : "",
            title:   titleEl ? titleEl.textContent.trim() : "",
            company: compEl  ? compEl.textContent.trim()  : "",
            address: addrEl  ? addrEl.textContent.trim()  : "",
            exp:     expEl   ? expEl.textContent.trim()   : "",
            href,
        };
    }).filter(i => i.id);
}"""


class HHPlaywrightSearchProvider:
    """Поиск через Playwright — одна сессия, все данные из страницы поиска hh.ru.

    Работает без регистрации приложения hh.ru.
    Извлекает: id, title, company, address, experience из карточек поиска.
    """

    async def search(self, filters: SearchFilters) -> list[VacancyItem]:
        from api.clients.browser_pool import get_page
        from api.clients.hh_client import _HEADERS

        params: dict[str, Any] = {
            "text": filters.query,
            "area": filters.area,
            "per_page": min(filters.count, 20),
        }
        if filters.experience:
            params["experience"] = filters.experience
        if filters.salary_from:
            params["salary"] = filters.salary_from
            params["only_with_salary"] = "true"
        if filters.remote:
            params["schedule"] = "remote"

        search_url = "https://hh.ru/search/vacancy?" + urlencode(params)

        async with get_page(user_agent=_HEADERS["User-Agent"]) as page:
            await page.goto(search_url, wait_until="domcontentloaded", timeout=30_000)
            raw_cards: list[dict[str, Any]] = await page.evaluate(_EXTRACT_JS)

        items = []
        for card in raw_cards[: filters.count]:
            if not card.get("id"):
                continue
            text = _build_text_from_card(card)
            items.append(VacancyItem(
                id=card["id"],
                title=card["title"],
                company=card["company"],
                url=f"https://hh.ru/vacancy/{card['id']}",
                text=text,
                salary_str=None,
            ))
        return items


class HHOAuthSearchProvider:
    """hh.ru с зарегистрированным OAuth-приложением — полные описания, высокие лимиты."""

    async def search(self, filters: SearchFilters) -> list[VacancyItem]:
        from api.clients.hh_client import search_vacancies

        raw = await search_vacancies(
            query=filters.query,
            area=filters.area,
            per_page=min(filters.count, 20),
            experience=filters.experience,
            salary_from=filters.salary_from,
            schedule="remote" if filters.remote else None,
        )
        return [_raw_to_item(r) for r in raw[: filters.count]]


def get_search_provider() -> VacancySearchProvider:
    return HHPlaywrightSearchProvider()


def _raw_to_item(raw: dict[str, Any]) -> VacancyItem:
    vacancy_id = str(raw.get("id", ""))
    title = raw.get("name", "")
    company = raw.get("employer", {}).get("name", "")
    return VacancyItem(
        id=vacancy_id,
        title=title,
        company=company,
        url=f"https://hh.ru/vacancy/{vacancy_id}",
        text=_build_text(raw, title, company),
        salary_str=format_salary(raw.get("salary")),
    )


def _build_text_from_card(card: dict[str, Any]) -> str:
    """Строит текст вакансии из данных карточки поиска hh.ru."""
    parts = filter(None, [
        card.get("title", ""),
        f"Компания: {card['company']}" if card.get("company") else "",
        f"Город: {card['address']}" if card.get("address") else "",
        f"Опыт: {card['exp']}" if card.get("exp") else "",
    ])
    return "\n\n".join(parts)


def _build_text(raw: dict[str, Any], title: str, company: str) -> str:
    """Строит текст вакансии из ответа API (используется в HHOAuthSearchProvider)."""
    snippet = raw.get("snippet", {})
    req = _clean(snippet.get("requirement") or "")
    resp = _clean(snippet.get("responsibility") or "")
    area = raw.get("area", {}).get("name", "")
    exp = raw.get("experience", {}).get("name", "")

    parts = filter(None, [
        title,
        f"Компания: {company}" if company else "",
        f"Город: {area}" if area else "",
        f"Опыт: {exp}" if exp else "",
        f"Требования: {req}" if req else "",
        f"Обязанности: {resp}" if resp else "",
    ])
    return "\n\n".join(parts)


def format_salary(salary: dict[str, Any] | None) -> str | None:
    if not salary:
        return None
    lo, hi, cur = salary.get("from"), salary.get("to"), salary.get("currency", "RUB")
    if lo and hi:
        return f"{lo:,}–{hi:,} {cur}".replace(",", " ")
    if lo:
        return f"от {lo:,} {cur}".replace(",", " ")
    if hi:
        return f"до {hi:,} {cur}".replace(",", " ")
    return None


def _clean(s: str) -> str:
    return _HTML_TAG_RE.sub("", s).strip()
