from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth.deps import current_user_required
from api.db.models import Analysis, Session, User, get_session
from api.routes.parse_resume import UPLOADS_DIR

router = APIRouter(prefix="/api", tags=["resumes"])


@router.get("/resumes/{file_id}")
async def download_resume(
    file_id: str,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user_required),
) -> FileResponse:
    # Verify the file belongs to this user (security check)
    result = await db.execute(
        select(Analysis)
        .join(Session, Analysis.session_id == Session.id)
        .where(
            Analysis.resume_file_id == file_id,
            Session.user_id == user.id,
        )
    )
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="File not found")

    path = UPLOADS_DIR / f"{file_id}.pdf"
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=path,
        media_type="application/pdf",
        filename="resume.pdf",
    )
