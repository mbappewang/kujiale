from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check(db: Session = Depends(get_db)) -> dict:
    db_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    return {
        "status": "ok" if db_ok else "degraded",
        "service": settings.app_name,
        "environment": settings.app_env,
        "databaseConnected": db_ok,
        "storageBackend": settings.storage_backend,
        "aiProviderMode": "gemini" if settings.has_gemini_key else "assisted_demo",
        "aiKeyConfigured": settings.has_gemini_key,
        "locale": "en-AU",
        "units": "m",
    }
