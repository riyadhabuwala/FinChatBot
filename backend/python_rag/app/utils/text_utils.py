import re
import unicodedata


def tokenize(text: str) -> list[str]:
    text = text.lower()
    text = re.sub(r"[^\w\s\.]", " ", text)
    tokens = text.split()
    stopwords = {
        "the",
        "a",
        "an",
        "is",
        "are",
        "was",
        "were",
        "of",
        "in",
        "on",
        "at",
        "to",
        "for",
        "and",
        "or",
        "but",
    }
    return [t for t in tokens if t not in stopwords and len(t) > 1]


def clean_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def truncate_to_tokens(text: str, max_tokens: int) -> str:
    max_chars = max_tokens * 4
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    last_space = truncated.rfind(" ")
    return truncated[:last_space] if last_space > 0 else truncated
