from langchain_core.language_models import BaseChatModel

from api.settings import settings


def get_llm() -> BaseChatModel:
    if settings.llm_provider == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
            temperature=settings.llm_temperature,
        )

    if settings.llm_provider == "groq":
        import httpx
        from langchain_groq import ChatGroq

        # Route only Groq traffic through proxy (if configured),
        # so hh.ru / HuggingFace / Ollama stay on direct connection
        http_client = (
            httpx.AsyncClient(proxy=settings.groq_proxy)
            if settings.groq_proxy else None
        )
        return ChatGroq(
            model=settings.groq_model,
            api_key=settings.groq_api_key,
            temperature=settings.llm_temperature,
            http_async_client=http_client,
        )

    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        temperature=settings.llm_temperature,
    )
