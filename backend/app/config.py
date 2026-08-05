from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "AI-QMS"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    DATABASE_URL: str = "postgresql+psycopg://aiqms:aiqms@db:5432/aiqms"
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]


settings = Settings()
