"""Parse resumes from hh.ru profile URLs and PDF files."""
import io
import re
from typing import Any

import fitz  # PyMuPDF

_HH_RESUME_RE = re.compile(r"hh\.ru/resume/([a-f0-9]+)")
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
}


def extract_resume_id(url: str) -> str | None:
    m = _HH_RESUME_RE.search(url)
    return m.group(1) if m else None


async def get_resume_from_hh_url(url: str) -> str:
    """Scrape hh.ru public resume page and return plain text."""
    from playwright.async_api import async_playwright

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(user_agent=_HEADERS["User-Agent"])
        page = await ctx.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=30_000)

        text = await _extract_resume_text(page)
        await browser.close()

    return text


async def _extract_resume_text(page: Any) -> str:
    # try to grab structured blocks first
    blocks: list[str] = []

    # desired position / title
    title_el = await page.query_selector('[data-qa="resume-block-title-position"]')
    if title_el:
        blocks.append(await title_el.inner_text())

    # skills
    skill_els = await page.query_selector_all('[data-qa="resume-tag"]')
    if skill_els:
        skills = [await el.inner_text() for el in skill_els]
        blocks.append("Навыки: " + ", ".join(skills))

    # experience blocks
    exp_els = await page.query_selector_all('[data-qa="resume-block-experience-position"]')
    for el in exp_els:
        blocks.append(await el.inner_text())

    # full description fallback — grab all visible text from the resume container
    if not blocks:
        container = await page.query_selector(".resume") or await page.query_selector("main")
        if container:
            blocks.append(await container.inner_text())
        else:
            blocks.append(await page.inner_text("body"))

    return "\n\n".join(b.strip() for b in blocks if b.strip())


def get_resume_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF bytes using PyMuPDF."""
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    pages_text = [page.get_text() for page in doc]
    doc.close()
    return "\n\n".join(t.strip() for t in pages_text if t.strip())
