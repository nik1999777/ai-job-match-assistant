"""
Lightweight language detection based on Unicode character ranges.
No external dependencies — sufficient for distinguishing Russian vs English resumes.
"""


def detect_language(text: str) -> str:
    """Return 'Russian' if text is predominantly Cyrillic, otherwise 'English'."""
    if not text:
        return "English"
    cyrillic = sum(1 for c in text if "Ѐ" <= c <= "ӿ")
    return "Russian" if cyrillic / len(text) > 0.15 else "English"
