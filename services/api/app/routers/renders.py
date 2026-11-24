from __future__ import annotations

from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session, sessionmaker

from render_worker import generate_blender_cycles_script
from ..database import SessionLocal, get_db
from ..models import RenderJobModel, SceneRecordModel
from ..schemas import RenderCreateRequest, RenderJobResponse

router = APIRouter(prefix="/renders", tags=["renders"])


def _process_render_job_background(job_id: str, db_session_factory=SessionLocal) -> None:
    db = db_session_factory()
    try:
        job = db.get(RenderJobModel, job_id)
        if not job:
            return
        job.status = "processing"
        job.progress_pct = 55
        db.commit()

        scene_rec = db.get(SceneRecordModel, job.scene_id)
        scene_dict = scene_rec.scene_json if scene_rec else {}
        cycles_py = generate_blender_cycles_script(scene_dict, 2560, 1440)

        job.cycles_script_preview = cycles_py
        job.progress_pct = 100
        job.status = "completed"
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
    except Exception:
        job = db.get(RenderJobModel, job_id)
        if job:
            job.status = "failed"
            db.commit()
    finally:
        db.close()


def _to_render_response(job: RenderJobModel) -> RenderJobResponse:
    return RenderJobResponse(
        id=job.id,
        projectId=job.project_id,
        sceneId=job.scene_id,
        quality=job.quality,
        cameraPreset=job.camera_preset,
        status=job.status,
        progressPct=job.progress_pct,
        engineKind=job.engine_kind,
        previewDataUrl=job.preview_data_url,
        cyclesScriptPreview=job.cycles_script_preview,
        createdAt=job.created_at,
        completedAt=job.completed_at,
    )


@router.post("", response_model=RenderJobResponse, status_code=status.HTTP_202_ACCEPTED)
def create_render_job(
    payload: RenderCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> RenderJobResponse:
    engine_kind = (
        "blender_cycles_script_export"
        if payload.quality == "cycles_export"
        else "webgl2_realtime_snapshot"
    )
    job = RenderJobModel(
        project_id=payload.projectId,
        scene_id=payload.sceneId,
        quality=payload.quality,
        camera_preset=payload.cameraPreset,
        status="queued",
        progress_pct=10,
        engine_kind=engine_kind,
        preview_data_url=payload.clientSnapshotDataUrl,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    session_maker = sessionmaker(bind=db.get_bind(), autoflush=False, autocommit=False, future=True)
    background_tasks.add_task(_process_render_job_background, job.id, session_maker)
    return _to_render_response(job)


@router.get("/{render_id}", response_model=RenderJobResponse)
def get_render_job(render_id: str, db: Session = Depends(get_db)) -> RenderJobResponse:
    job = db.get(RenderJobModel, render_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Render job '{render_id}' not found.")
    return _to_render_response(job)
