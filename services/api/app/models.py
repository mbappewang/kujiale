from __future__ import annotations

from datetime import datetime, timezone
import uuid
from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid.uuid4())


class ProjectModel(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    city: Mapped[str] = mapped_column(String(64), default="Sydney")
    typology: Mapped[str] = mapped_column(String(40), default="single_storey")
    active_scene_id: Mapped[str] = mapped_column(String(64), nullable=False)
    share_token: Mapped[str] = mapped_column(String(64), default=_uuid, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class SceneRecordModel(Base):
    __tablename__ = "scenes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    revision: Mapped[int] = mapped_column(Integer, default=1)
    scene_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class FloorplanRecordModel(Base):
    __tablename__ = "floorplans"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    project_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(80), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="uploaded")  # uploaded | processing | completed | failed
    provider_mode: Mapped[str] = mapped_column(String(40), default="pending")
    overall_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    recognition_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class DesignSchemeModel(Base):
    __tablename__ = "design_schemes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    style_id: Mapped[str] = mapped_column(String(64), nullable=False)
    provider_mode: Mapped[str] = mapped_column(String(40), default="deterministic_rules")
    summary: Mapped[str] = mapped_column(Text, default="")
    estimated_budget_aud: Mapped[float] = mapped_column(Float, default=0.0)
    scene_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class RenderJobModel(Base):
    __tablename__ = "render_jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(String(64), index=True)
    scene_id: Mapped[str] = mapped_column(String(64))
    quality: Mapped[str] = mapped_column(String(32), default="high")
    camera_preset: Mapped[str] = mapped_column(String(64), default="living_room")
    status: Mapped[str] = mapped_column(String(32), default="queued")  # queued | processing | completed | failed
    progress_pct: Mapped[int] = mapped_column(Integer, default=0)
    engine_kind: Mapped[str] = mapped_column(String(48), default="webgl2_realtime_snapshot")
    preview_data_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    cycles_script_preview: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
