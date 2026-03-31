from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # PostgreSQL — Railway provides DATABASE_URL; local dev uses separate vars
    database_url: str = ""  # Set by Railway as DATABASE_URL
    postgres_user: str = "secretome"
    postgres_password: str = "secretome_pass"
    postgres_db: str = "secretome_db"
    postgres_host: str = "postgres"
    postgres_port: int = 5432

    @property
    def async_database_url(self) -> str:
        if self.database_url:
            url = self.database_url
            if url.startswith("postgres://"):
                return "postgresql+asyncpg://" + url[len("postgres://"):]
            if url.startswith("postgresql://"):
                return "postgresql+asyncpg://" + url[len("postgresql://"):]
            return url  # already has correct driver prefix
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def sync_database_url(self) -> str:
        if self.database_url:
            url = self.database_url
            if url.startswith("postgres://"):
                return "postgresql://" + url[len("postgres://"):]
            return url  # already has correct prefix or is postgresql://
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    # Redis / Celery — Railway sets REDIS_URL; local dev uses docker-compose service names
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str = ""   # falls back to redis_url if not set
    celery_result_backend: str = ""  # falls back to redis_url/1 if not set

    @property
    def effective_broker_url(self) -> str:
        return self.celery_broker_url or self.redis_url

    @property
    def effective_result_backend(self) -> str:
        if self.celery_result_backend:
            return self.celery_result_backend
        # Use database 1 for results to separate from broker
        base = self.redis_url
        if base.endswith("/0"):
            return base[:-2] + "/1"
        return base

    # MinIO
    minio_endpoint: str = "minio:9000"
    minio_root_user: str = "minioadmin"
    minio_root_password: str = "minioadmin123"
    minio_bucket: str = "secretome-results"
    minio_secure: bool = False

    # App
    secret_key: str = "change-me"
    debug: bool = False
    allowed_origins: str = "http://localhost:3000,http://localhost:80"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    # External API settings
    http_timeout: int = 30
    http_max_retries: int = 3
    opentargets_api_url: str = "https://api.platform.opentargets.org/api/v4/graphql"
    disgenet_api_url: str = "https://www.disgenet.org/api"

    # Auth
    access_token_expire_hours: int = 24

    # Invite code — leave empty for open registration
    invite_code: str = ""

    # LLM / Claude API
    anthropic_api_key: str = ""
    llm_model: str = "claude-sonnet-4-5"
    llm_enabled: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
