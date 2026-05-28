from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    llm_provider: str = "openai"
    llm_temperature: float = 0.0
    resume_context_limit: int = 8000
    vacancy_context_limit: int = 2000
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"
    groq_api_key: str = ""
    groq_model: str = "meta-llama/llama-4-scout-17b-16e-instruct"
    groq_proxy: str = ""  # e.g. http://user:pass@host:port

    database_url: str = "postgresql+asyncpg://jobmatch:jobmatch@localhost:5433/jobmatch"

    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "vacancies"

    # Semantic skill matching — cosine similarity threshold (0–1)
    # Lower = more permissive matches; higher = stricter
    # Calibrated on BAAI/bge-small-en-v1.5 cosine similarities:
    #   numpy ≈ TensorFlow  = 0.725  → false positive, must exclude  (< threshold)
    #   LangChain ≈ LangGraph = 0.767 → true match, must include    (> threshold)
    #   GitLab CI ≈ GitLab  = 0.845  → true match ✓
    #   Postgres ≈ PostgreSQL = 0.934  → true match ✓
    skill_match_threshold: float = 0.75

    # Match score decision thresholds (used in /batch and /seek)
    # score >= hire_threshold  → hire / strong_match
    # score >= consider_threshold → borderline / worth_considering
    # score < consider_threshold  → no_hire / weak_match
    match_score_hire_threshold: float = 0.75
    match_score_consider_threshold: float = 0.50

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
