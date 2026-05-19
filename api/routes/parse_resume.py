from fastapi import APIRouter, HTTPException, UploadFile

from api.clients.resume_parser import get_resume_from_pdf

router = APIRouter(prefix="/api", tags=["resume"])

_MAX_PDF_MB = 10


@router.post("/parse-resume")
async def parse_resume(file: UploadFile) -> dict[str, str]:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=422, detail="Only PDF files are supported")

    data = await file.read()
    if len(data) > _MAX_PDF_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"PDF must be under {_MAX_PDF_MB} MB")

    try:
        text = get_resume_from_pdf(data)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {exc}")

    if not text.strip():
        raise HTTPException(status_code=422, detail="PDF appears to be empty or image-only")

    return {"text": text}
