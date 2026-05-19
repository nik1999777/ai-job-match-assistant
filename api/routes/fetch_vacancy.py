from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["vacancy"])


class FetchVacancyRequest(BaseModel):
    url: str


class FetchVacancyResponse(BaseModel):
    text: str


@router.post("/fetch-vacancy", response_model=FetchVacancyResponse)
async def fetch_vacancy(body: FetchVacancyRequest) -> FetchVacancyResponse:
    url = body.url.strip()
    try:
        if "linkedin.com" in url:
            from api.clients.linkedin_client import get_vacancy_from_linkedin
            text, _ = await get_vacancy_from_linkedin(url)
        else:
            from api.clients.hh_client import get_vacancy_by_url
            text, _ = await get_vacancy_by_url(url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to fetch vacancy: {exc}")

    return FetchVacancyResponse(text=text)
