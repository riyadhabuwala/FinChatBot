import json
from langchain_groq import ChatGroq
from app.config import settings

llm = ChatGroq(
    groq_api_key=settings.groq_api_key,
    model_name="llama-3.1-8b-instant",
    temperature=0.3,
    max_tokens=512,
)


def _safe_invoke(prompt: str) -> str:
    try:
        response = llm.invoke(prompt)
        return getattr(response, "content", "") or str(response)
    except Exception:
        return ""


def hyde_rewrite(query: str, mode: str) -> str:
    prompt = (
        "You are a financial document expert. A user is asking: "
        f"'{query}'\n"
        "Write a short, hypothetical passage (2-3 sentences) that would be the "
        "ideal answer to this question, as if it appeared in a financial report. "
        "Use specific financial language and numbers if relevant. "
        "Write ONLY the hypothetical passage, nothing else."
    )
    rewritten = _safe_invoke(prompt).strip()
    return rewritten if rewritten else query


def multi_query_expand(query: str) -> list[str]:
    prompt = (
        "Generate 3 different ways to ask this financial question, each emphasizing "
        "a different aspect. Return as a JSON array of strings.\n"
        f"Original question: '{query}'"
    )
    text = _safe_invoke(prompt).strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list) and all(isinstance(x, str) for x in parsed):
            return parsed
    except Exception:
        pass
    return [query]


def rewrite_for_mode(query: str, mode: str) -> dict:
    mode_key = (mode or "").lower()
    if mode_key == "document_analysis":
        primary = hyde_rewrite(query, mode_key)
        expansions = multi_query_expand(query)
    elif mode_key == "insights":
        primary = query
        expansions = multi_query_expand(query)
    else:
        primary = hyde_rewrite(query, mode_key)
        expansions = []

    return {
        "primary_query": primary,
        "expansion_queries": expansions,
    }
