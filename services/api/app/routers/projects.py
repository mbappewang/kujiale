from __future__ import annotations

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ProjectModel, SceneRecordModel
from ..schemas import ProjectCreateRequest, ProjectPatchRequest, ProjectResponse
from ..seed import build_default_sydney_scene_dict

router = APIRouter(prefix="/projects", tags=["projects"])


def _to_project_response(p: ProjectModel) -> ProjectResponse:
    return ProjectResponse(
        id=p.id,
        name=p.name,
        description=p.description,
        city=p.city,
        typology=p.typology,
        activeSceneId=p.active_scene_id,
        shareToken=p.share_token,
        createdAt=p.created_at,
        updatedAt=p.updated_at,
    )


@router.get("", response_model=list[ProjectResponse])
def list_projects(db: Session = Depends(get_db)) -> list[ProjectResponse]:
    rows = db.scalars(select(ProjectModel).order_by(ProjectModel.updated_at.desc())).all()
    if not rows:
        # Auto-seed canonical Sydney Coastal Pavilion Demo on fresh DB so first launch is instant!
        demo_project_id = "proj-sydney-coastal-demo"
        demo_scene_id = "scene-sydney-coastal-demo"
        proj = ProjectModel(
            id=demo_project_id,
            name="Sydney Coastal Pavilion (216 m²)",
            description="4-Bedroom Australian Detached Residence with North-Facing Alfresco Deck, Louvred Pergola & Saltwater Plunge Pool.",
            city="Sydney",
            typology="single_storey",
            active_scene_id=demo_scene_id,
        )
        scene_rec = SceneRecordModel(
            id=demo_scene_id,
            project_id=demo_project_id,
            revision=1,
            scene_json=build_default_sydney_scene_dict("Sydney", 0.0),
        )
        db.add(proj)
        db.flush()
        db.add(scene_rec)
        db.commit()
        db.refresh(proj)
        rows = [proj]

    return [_to_project_response(p) for p in rows]


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreateRequest, db: Session = Depends(get_db)) -> ProjectResponse:
    project_id = f"proj-{uuid.uuid4().hex[:12]}"
    scene_id = f"scene-{uuid.uuid4().hex[:12]}"

    scene_dict = (
        payload.initialScene.model_dump()
        if payload.initialScene is not None
        else build_default_sydney_scene_dict(payload.city, payload.orientationDegrees)
    )
    scene_dict["property"]["city"] = payload.city
    scene_dict["property"]["typology"] = payload.typology
    scene_dict["property"]["orientationDegrees"] = payload.orientationDegrees

    project = ProjectModel(
        id=project_id,
        name=payload.name,
        description=payload.description,
        city=payload.city,
        typology=payload.typology,
        active_scene_id=scene_id,
    )
    scene_record = SceneRecordModel(
        id=scene_id,
        project_id=project_id,
        revision=1,
        scene_json=scene_dict,
    )
    db.add(project)
    db.flush()
    db.add(scene_record)
    db.commit()
    db.refresh(project)
    return _to_project_response(project)


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str, db: Session = Depends(get_db)) -> ProjectResponse:
    project = db.get(ProjectModel, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")
    return _to_project_response(project)


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: str, payload: ProjectPatchRequest, db: Session = Depends(get_db)
) -> ProjectResponse:
    project = db.get(ProjectModel, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")
    if payload.name is not None:
        project.name = payload.name
    if payload.description is not None:
        project.description = payload.description
    if payload.city is not None:
        project.city = payload.city
    db.commit()
    db.refresh(project)
    return _to_project_response(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, db: Session = Depends(get_db)) -> None:
    project = db.get(ProjectModel, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")
    db.delete(project)
    db.commit()
