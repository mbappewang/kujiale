from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import SceneRecordModel
from ..schemas import SceneDataDTO, SceneResponse

router = APIRouter(prefix="/scenes", tags=["scenes"])


@router.get("/{scene_id}", response_model=SceneResponse)
def get_scene(scene_id: str, db: Session = Depends(get_db)) -> SceneResponse:
    record = db.get(SceneRecordModel, scene_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found.")
    validated = SceneDataDTO.model_validate(record.scene_json)
    return SceneResponse(
        id=record.id,
        projectId=record.project_id,
        revision=record.revision,
        scene=validated,
        updatedAt=record.updated_at,
    )


@router.put("/{scene_id}", response_model=SceneResponse)
def save_scene(
    scene_id: str, payload: SceneDataDTO, db: Session = Depends(get_db)
) -> SceneResponse:
    record = db.get(SceneRecordModel, scene_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found.")

    record.scene_json = payload.model_dump()
    record.revision = (record.revision or 1) + 1
    db.commit()
    db.refresh(record)

    return SceneResponse(
        id=record.id,
        projectId=record.project_id,
        revision=record.revision,
        scene=payload,
        updatedAt=record.updated_at,
    )
