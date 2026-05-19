"""Scrape LinkedIn job postings with stealth Playwright headers."""
import re
from typing import Any

_LI_JOB_RE = re.compile(r"linkedin\.com/jobs/(?:view/)?(\d+)")

_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# suppress webdriver fingerprinting signals
_STEALTH_JS = """
Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3]});
Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en', 'ru']});
window.chrome = {runtime: {}};
"""


def extract_job_id(url: str) -> str | None:
    m = _LI_JOB_RE.search(url)
    return m.group(1) if m else None


async def get_vacancy_from_linkedin(url: str) -> tuple[str, dict[str, Any]]:
    """
    Scrape a LinkedIn job posting. Returns (text, raw_data).
    Raises ValueError with a user-friendly message if blocked or login required.
    """
    from playwright.async_api import async_playwright

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(
            user_agent=_UA,
            viewport={"width": 1280, "height": 800},
            locale="en-US",
        )
        page = await ctx.new_page()
        await page.add_init_script(_STEALTH_JS)
        await page.goto(url, wait_until="domcontentloaded", timeout=30_000)

        if "linkedin.com/login" in page.url or "authwall" in page.url:
            await browser.close()
            raise ValueError(
                "LinkedIn requires login to view this job. "
                "Please paste the job description text manually."
            )

        data = await _extract_linkedin_job(page)
        await browser.close()

    if not data.get("description"):
        raise ValueError(
            "Could not extract job description from LinkedIn. "
            "Please paste the job description text manually."
        )

    return _job_to_text(data), data


async def _extract_linkedin_job(page: Any) -> dict[str, Any]:
    # expand truncated description if "See more" button exists
    see_more = await page.query_selector(
        'button[aria-label="Click to see more description"],'
        '.jobs-description__footer-button'
    )
    if see_more:
        await see_more.click()
        await page.wait_for_timeout(500)

    title_el = await page.query_selector(
        ".job-details-jobs-unified-top-card__job-title,"
        ".top-card-layout__title,"
        "h1"
    )
    title = (await title_el.inner_text()).strip() if title_el else ""

    company_el = await page.query_selector(
        ".job-details-jobs-unified-top-card__company-name,"
        ".topcard__org-name-link"
    )
    company = (await company_el.inner_text()).strip() if company_el else ""

    desc_el = await page.query_selector(
        ".jobs-description-content__text,"
        ".description__text,"
        ".show-more-less-html__markup"
    )
    description = (await desc_el.inner_text()).strip() if desc_el else ""

    return {"title": title, "company": company, "description": description}


def _job_to_text(data: dict[str, Any]) -> str:
    parts = filter(None, [
        data.get("title"),
        f"Компания: {data['company']}" if data.get("company") else "",
        data.get("description"),
    ])
    return "\n\n".join(parts)
