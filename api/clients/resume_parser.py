import re

import fitz  # PyMuPDF

_PAGE_NUM_RE = re.compile(r"^\d+(\s*/\s*\d+)?$")
_PAGE_LABEL_RE = re.compile(r"^[Pp]age\s+\d+", re.IGNORECASE)
_MULTI_BLANK_RE = re.compile(r"\n{3,}")


def get_resume_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF bytes using PyMuPDF.

    Uses block-level extraction with position sorting to handle multi-column
    layouts. Removes page numbers and repeated headers/footers.
    """
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    page_count = doc.page_count
    all_blocks: list[str] = []

    for page in doc:
        # get_text("blocks") → (x0, y0, x1, y1, text, block_no, block_type)
        # block_type 0 = text, 1 = image
        blocks = [b for b in page.get_text("blocks") if b[6] == 0]
        # sort by row bucket (y // 20) then left-to-right (x)
        # fixes 2-column PDFs where columns would otherwise interleave
        blocks.sort(key=lambda b: (int(b[1]) // 20, b[0]))
        for b in blocks:
            text = b[4].strip()
            if text:
                all_blocks.append(text)

    doc.close()

    freq: dict[str, int] = {}
    for block in all_blocks:
        freq[block] = freq.get(block, 0) + 1

    cleaned: list[str] = []
    for block in all_blocks:
        stripped = block.strip()
        if _PAGE_NUM_RE.match(stripped):
            continue
        if _PAGE_LABEL_RE.match(stripped):
            continue
        if freq[block] >= max(2, page_count - 1) and len(stripped) < 80:
            continue
        cleaned.append(block)

    text = "\n\n".join(cleaned)
    return _MULTI_BLANK_RE.sub("\n\n", text).strip()
