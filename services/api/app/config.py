from __future__ import annotations

import sys
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Register sibling modular packages (floorplan_ai, design_ai, render_worker)
SERVICES_DIR = Path(__file__).resolve().parents[2]
for mod_dir in ("floorplan-ai", "design-ai", "render-worker"):
    candidate = str(SERVICES_DIR / mod_dir)
    if candidate not in sys.path:
        sys.path.insert(0, candidate)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "AussieHome 3D Studio API"
    app_env: str = "development"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"

    # SQLite fallback in dev; PostgreSQL in production via DATABASE_URL
    database_url: str = "sqlite:///./data/aussiehome.db"
    redis_url: str = ""

    storage_backend: str = "local"
    local_storage_dir: str = "./storage"
    max_upload_size_mb: int = 20

    # Server-side AI credentials ONLY — never serialized to clients
    ai_provider: str = "auto"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def has_gemini_key(self) -> bool:
        return bool(self.gemini_api_key and self.gemini_api_key.strip())


settings = Settings()
