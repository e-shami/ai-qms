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
    SECRET_KEY: str = "dev-secret-change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    LOGIN_RATE_LIMIT: int = 5
    LOGIN_RATE_WINDOW_SECONDS: int = 300
    PUBLIC_ISSUE_RATE_LIMIT: int = 10
    PUBLIC_ISSUE_RATE_WINDOW_SECONDS: int = 60
    PUBLIC_LOOKUP_RATE_LIMIT: int = 60
    PUBLIC_LOOKUP_RATE_WINDOW_SECONDS: int = 60
    PREDICT_DEFAULT_SERVICE_MIN: float = 5.0
    PREDICT_MIN_SERVICE_SAMPLES: int = 5


settings = Settings()
