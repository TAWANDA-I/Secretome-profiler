from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # PostgreSQL
    postgres_user: str = "secretome"
    postgres_password: str = "secretome_pass"
    postgres_db: str = "secretome_db"
    postgres_host: str = "postgres"
    postgres_port: int = 5432

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def database_url_sync(self) -> str:
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    # Redis / Celery
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str = "redis://redis:6379/0"
    celery_result_backend: str = "redis://redis:6379/1"

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

    # LLM / Claude API
    anthropic_api_key: str = ""
    llm_model: str = "claude-sonnet-4-5"
    llm_enabled: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
