from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # LLM
    llm_provider: str = "openai"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"

    # DB
    database_url: str = "postgresql+asyncpg://jobmatch:jobmatch@localhost:5432/jobmatch"

    # Qdrant
    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "vacancies"

    # App
    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
