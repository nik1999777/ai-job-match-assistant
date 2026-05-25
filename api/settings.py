from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    llm_provider: str = "openai"
    llm_temperature: float = 0.0
    resume_context_limit: int = 4000
    vacancy_context_limit: int = 2000
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"

    database_url: str = "postgresql+asyncpg://jobmatch:jobmatch@localhost:5433/jobmatch"

    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "vacancies"

    # Semantic skill matching — cosine similarity threshold (0–1)
    # Lower = more permissive matches; higher = stricter
    skill_match_threshold: float = 0.75

    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 дней

    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:5173"]

    # Langfuse — LLM tracing (http://localhost:3000)
    langfuse_host: str = "http://localhost:3000"
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""


settings = Settings()
