from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from floorplan_ai import get_floorplan_provider
from ..config import settings
from ..database import get_db
from ..models import FloorplanRecordModel
from ..schemas import FloorplanResponse, RecognizeFloorplanRequest
from ..storage import StorageSecurityError, storage_service

router = APIRouter(prefix="/floorplans", tags=["floorplans"])


def _to_floorplan_response(rec: FloorplanRecordModel) -> FloorplanResponse:
    return FloorplanResponse(
        id=rec.id,
        projectId=rec.project_id,
        originalFilename=rec.original_filename,
        mimeType=rec.mime_type,
        fileSizeBytes=rec.file_size_bytes,
        status=rec.status,
        providerMode=rec.provider_mode,
        overallConfidence=rec.overall_confidence,
        previewUrl=f"/api/v1/floorplans/{rec.id}/file",
        recognition=rec.recognition_payload,
        createdAt=rec.created_at,
    )


@router.post("/upload", response_model=FloorplanResponse, status_code=status.HTTP_201_CREATED)
async def upload_floorplan(
    file: UploadFile = File(...),
    project_id: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> FloorplanResponse:
    raw_bytes = await file.read()
    try:
        detected_mime = storage_service.detect_and_validate_file(
            raw_bytes, max_mb=settings.max_upload_size_mb
        )
        storage_key = storage_service.save_floorplan(raw_bytes, detected_mime)
    except OverflowError as exc:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(exc)) from exc
    except (ValueError, StorageSecurityError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    safe_name = (file.filename or "floorplan.png").split("/")[-1].split("\\")[-1][:200]
    record = FloorplanRecordModel(
        project_id=project_id,
        original_filename=safe_name,
        mime_type=detected_mime,
        file_size_bytes=len(raw_bytes),
        storage_key=storage_key,
        status="uploaded",
        provider_mode="pending",
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _to_floorplan_response(record)


@router.post("/{floorplan_id}/recognize", response_model=FloorplanResponse)
def recognize_floorplan(
    floorplan_id: str,
    payload: RecognizeFloorplanRequest | None = None,
    db: Session = Depends(get_db),
) -> FloorplanResponse:
    record = db.get(FloorplanRecordModel, floorplan_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Floor plan '{floorplan_id}' not found.")

    try:
        raw_bytes = storage_service.read_floorplan(record.storage_key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    record.status = "processing"
    db.commit()

    provider = get_floorplan_provider(
        api_key=settings.gemini_api_key if settings.has_gemini_key else None,
        model=settings.gemini_model,
    )
    known_len = payload.knownWallLengthMeters if payload else None
    preview_url = f"/api/v1/floorplans/{record.id}/file"

    try:
        result = provider.recognize(
            raw_bytes=raw_bytes,
            filename=record.original_filename,
            mime_type=record.mime_type,
            known_wall_length_m=known_len,
            image_url=preview_url,
        )
        record.status = "completed"
        record.provider_mode = result.provider_mode
        record.overall_confidence = result.overall_confidence
        record.recognition_payload = {
            "providerMode": result.provider_mode,
            "requiresScaleCalibration": result.requires_scale_calibration,
            "requiresUserReview": result.requires_user_review,
            "overallConfidence": result.overall_confidence,
            "warnings": result.warnings,
            "detectedImageWidthPx": result.detected_image_width_px,
            "detectedImageHeightPx": result.detected_image_height_px,
            "estimatedPixelsPerMeter": result.estimated_pixels_per_meter,
            "scenePatch": result.scene_patch,
        }
        db.commit()
        db.refresh(record)
        return _to_floorplan_response(record)
    except Exception as exc:
        record.status = "failed"
        record.recognition_payload = {"error": str(exc)}
        db.commit()
        raise HTTPException(status_code=500, detail=f"Recognition failed: {exc}") from exc


@router.get("/{floorplan_id}", response_model=FloorplanResponse)
def get_floorplan(floorplan_id: str, db: Session = Depends(get_db)) -> FloorplanResponse:
    record = db.get(FloorplanRecordModel, floorplan_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Floor plan '{floorplan_id}' not found.")
    return _to_floorplan_response(record)


@router.get("/{floorplan_id}/file")
def get_floorplan_file(floorplan_id: str, db: Session = Depends(get_db)) -> Response:
    record = db.get(FloorplanRecordModel, floorplan_id)
    if not record:
        raise HTTPException(status_code=404, detail="Floor plan not found.")
    raw = storage_service.read_floorplan(record.storage_key)
    return Response(
        content=raw,
        media_type=record.mime_type,
        headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"},
    )
