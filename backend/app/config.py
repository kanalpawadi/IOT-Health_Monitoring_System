"""Application settings, loaded from environment / .env file."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ------------------------------------------------------------------ #
    # Database
    # ------------------------------------------------------------------ #
    # Supabase > Settings > Database > Connection string > URI.
    # Prefer the "Session pooler" URI (port 6543 / host aws-0-*.pooler...)
    # if your network has no IPv6 route to the direct db.* host.
    database_url: str = ""

    # Supabase > Settings > API. Used only to hand the browser a read-only
    # realtime subscription; the backend itself talks straight to Postgres.
    supabase_url: str = ""
    supabase_anon_key: str = ""

    # ------------------------------------------------------------------ #
    # Generative AI (Groq)
    # ------------------------------------------------------------------ #
    groq_api_key: str = ""
    # Verified working with strict JSON mode on this account (~600 ms).
    # The openai/gpt-oss-* models on Groq are reasoning models: they emit
    # reasoning tokens that break response_format=json_object, so they are a
    # poor fit here even though they are larger.
    # Check your own catalogue with: GET https://api.groq.com/openai/v1/models
    groq_model: str = "qwen/qwen3.8-27b"

    # Don't re-bill the LLM for a status that hasn't changed.
    ai_cache_seconds: int = 120

    # ------------------------------------------------------------------ #
    # Monitoring behaviour
    # ------------------------------------------------------------------ #
    default_device_id: str = "esp8266-01"

    # How far back the trend engine looks when deciding rising/falling/stable.
    trend_window_minutes: int = 15

    # A vital must breach its threshold this many readings in a row before an
    # alert fires. Suppresses the single-sample noise that a finger shifting on
    # the MAX30102 produces.
    persistence_samples: int = 3

    # Don't re-log the same rule for the same device more often than this.
    alert_cooldown_seconds: int = 180

    # A device with no reading for this long is shown as offline.
    offline_after_seconds: int = 60

    # If set, the /api/ingest endpoint requires this value in the
    # X-Device-Key header. Leave empty to keep ingest open on a lab network.
    ingest_key: str = ""

    # ------------------------------------------------------------------ #
    # CORS
    # ------------------------------------------------------------------ #
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
