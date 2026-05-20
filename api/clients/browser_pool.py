"""Shared Playwright browser for the whole server lifecycle.

Instead of launching a new Chromium process per request (expensive, ~1-2s),
we start one browser on startup and reuse it. Each request gets its own
isolated BrowserContext (separate cookies/storage), which is cheap to create.

Analogy: browser = connection pool, context = transaction, page = cursor.
"""
import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

from playwright.async_api import Browser, Page, Playwright, async_playwright

_playwright: Playwright | None = None
_browser: Browser | None = None
_sem = asyncio.Semaphore(3)  # max 3 concurrent page operations


async def start() -> None:
    global _playwright, _browser
    _playwright = await async_playwright().start()
    _browser = await _playwright.chromium.launch(headless=True)


async def stop() -> None:
    global _playwright, _browser
    if _browser:
        await _browser.close()
        _browser = None
    if _playwright:
        await _playwright.stop()
        _playwright = None


@asynccontextmanager
async def get_page(user_agent: str | None = None) -> AsyncIterator[Page]:
    """Yield an isolated page from the shared browser.

    Falls back to an ephemeral browser if the singleton is not running
    (e.g. during tests or local use without lifespan).
    """
    if _browser is None or not _browser.is_connected():
        async with _ephemeral_page(user_agent) as page:
            yield page
        return

    async with _sem:
        ctx = await _browser.new_context(user_agent=user_agent)
        page = await ctx.new_page()
        try:
            yield page
        finally:
            await ctx.close()


@asynccontextmanager
async def _ephemeral_page(user_agent: str | None = None) -> AsyncIterator[Page]:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(user_agent=user_agent)
        page = await ctx.new_page()
        try:
            yield page
        finally:
            await ctx.close()
            await browser.close()
