from __future__ import annotations

import copy
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from design_ai import interpret_natural_language_design
from ..config import settings
from ..database import get_db
from ..models import DesignSchemeModel, ProjectModel
from ..schemas import (
    DesignApplyCommandRequest,
    DesignGenerateRequest,
    DesignSchemeResponse,
    SceneDataDTO,
)

router = APIRouter(tags=["designs"])

STYLE_MATERIAL_MAP: dict[str, dict[str, str]] = {
    "modern_coastal": {
        "living_floor": "timber-spotted-gum",
        "bed_floor": "timber-coastal-oak",
        "wet_floor": "tile-porcelain-travertine",
        "wall": "plaster-coastal-white",
        "feature_wall": "plaster-warm-sand",
        "exterior": "brick-sydney-sandstock",
        "roof": "roof-colorbond-monument",
        "sofa_mat": "fabric-coastal-linen",
    },
    "sydney_contemporary": {
        "living_floor": "concrete-polished-architectural",
        "bed_floor": "timber-spotted-gum",
        "wet_floor": "marble-carrara-honed",
        "wall": "paint-crisp-white",
        "feature_wall": "plaster-warm-sand",
        "exterior": "paint-charcoal-facade",
        "roof": "roof-colorbond-monument",
        "sofa_mat": "leather-tan-saddle",
    },
    "melbourne_heritage": {
        "living_floor": "timber-blackbutt-deck",
        "bed_floor": "timber-spotted-gum",
        "wet_floor": "tile-terrazzo-coastal",
        "wall": "plaster-warm-sand",
        "feature_wall": "plaster-sage-eucalyptus",
        "exterior": "brick-melbourne-red",
        "roof": "roof-terracotta-shingle",
        "sofa_mat": "fabric-charcoal-boucle",
    },
    "outback_minimalist": {
        "living_floor": "marble-travertine",
        "bed_floor": "timber-coastal-oak",
        "wet_floor": "tile-porcelain-travertine",
        "wall": "plaster-warm-sand",
        "feature_wall": "plaster-sage-eucalyptus",
        "exterior": "plaster-warm-sand",
        "roof": "roof-terracotta-shingle",
        "sofa_mat": "leather-tan-saddle",
    },
}


def _apply_commands_server_side(scene_dict: dict[str, Any], commands: list[dict[str, Any]]) -> dict[str, Any]:
    out = copy.deepcopy(scene_dict)
    for cmd in commands:
        ctype = cmd.get("type")
        if ctype == "apply_style_preset":
            style_id = cmd.get("styleId", "modern_coastal")
            target_room = cmd.get("targetRoomId")
            pal = STYLE_MATERIAL_MAP.get(style_id, STYLE_MATERIAL_MAP["modern_coastal"])
            out["activeStyleId"] = style_id
            if not target_room:
                out["property"]["exteriorWallMaterialId"] = pal["exterior"]
                out["property"]["roofMaterialId"] = pal["roof"]
            for room in out.get("rooms", []):
                if target_room and room.get("id") != target_room:
                    continue
                if room.get("isOutdoor"):
                    continue
                rtype = room.get("roomType", "")
                if rtype in ("bathroom", "laundry"):
                    room["floorMaterialId"] = pal["wet_floor"]
                elif rtype in ("master_bedroom", "bedroom", "study"):
                    room["floorMaterialId"] = pal["bed_floor"]
                    room["wallMaterialId"] = pal["feature_wall"] if rtype == "master_bedroom" else pal["wall"]
                elif rtype != "garage":
                    room["floorMaterialId"] = pal["living_floor"]
                    room["wallMaterialId"] = pal["wall"]
            for furn in out.get("furniture", []):
                if target_room and furn.get("roomId") != target_room:
                    continue
                if str(furn.get("catalogId", "")).startswith("sofa-"):
                    furn["primaryMaterialId"] = pal["sofa_mat"]
        elif ctype == "update_room_material":
            for room in out.get("rooms", []):
                if room.get("id") == cmd.get("roomId"):
                    if cmd.get("target") == "floor":
                        room["floorMaterialId"] = cmd["materialId"]
                    elif cmd.get("target") == "wall":
                        room["wallMaterialId"] = cmd["materialId"]
        elif ctype == "update_lighting":
            if "timeOfDay" in cmd and cmd["timeOfDay"]:
                out["lighting"]["timeOfDay"] = cmd["timeOfDay"]
            if "interiorLightsOn" in cmd and cmd["interiorLightsOn"] is not None:
                out["lighting"]["interiorLightsOn"] = bool(cmd["interiorLightsOn"])
    return out


def _to_scheme_response(rec: DesignSchemeModel) -> DesignSchemeResponse:
    return DesignSchemeResponse(
        id=rec.id,
        projectId=rec.project_id,
        name=rec.name,
        styleId=rec.style_id,
        providerMode=rec.provider_mode,
        summary=rec.summary,
        estimatedBudgetAUD=rec.estimated_budget_aud,
        sceneSnapshot=SceneDataDTO.model_validate(rec.scene_snapshot),
        createdAt=rec.created_at,
    )


@router.post("/designs/generate", response_model=DesignSchemeResponse, status_code=status.HTTP_201_CREATED)
def generate_design_scheme(
    payload: DesignGenerateRequest, db: Session = Depends(get_db)
) -> DesignSchemeResponse:
    project = db.get(ProjectModel, payload.projectId)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{payload.projectId}' not found.")

    raw_scene = payload.scene.model_dump()
    commands: list[dict[str, Any]] = [{"type": "apply_style_preset", "styleId": payload.styleId}]
    provider_mode = "deterministic_rules"
    summary = f"Generated Australian '{payload.styleId}' renovation scheme with validated clearances."

    if payload.prompt:
        nl = interpret_natural_language_design(
            prompt=payload.prompt,
            scene=raw_scene,
            api_key=settings.gemini_api_key if settings.has_gemini_key else None,
            model=settings.gemini_model,
        )
        commands = nl.commands
        provider_mode = nl.provider_mode
        summary = nl.summary

    updated_scene_dict = _apply_commands_server_side(raw_scene, commands)
    validated_scene = SceneDataDTO.model_validate(updated_scene_dict)
    budget = sum(f.priceAUD for f in validated_scene.furniture)

    scheme = DesignSchemeModel(
        project_id=payload.projectId,
        name=payload.name,
        style_id=validated_scene.activeStyleId,
        provider_mode=provider_mode,
        summary=summary,
        estimated_budget_aud=round(budget, 2),
        scene_snapshot=validated_scene.model_dump(),
    )
    db.add(scheme)
    db.commit()
    db.refresh(scheme)
    return _to_scheme_response(scheme)


@router.post("/designs/apply-command")
def apply_natural_language_command(payload: DesignApplyCommandRequest) -> dict[str, Any]:
    raw_scene = payload.scene.model_dump()
    nl = interpret_natural_language_design(
        prompt=payload.naturalLanguagePrompt,
        scene=raw_scene,
        api_key=settings.gemini_api_key if settings.has_gemini_key else None,
        model=settings.gemini_model,
    )
    updated_dict = _apply_commands_server_side(raw_scene, nl.commands)
    validated = SceneDataDTO.model_validate(updated_dict)
    return {
        "providerMode": nl.provider_mode,
        "summary": nl.summary,
        "detectedStyle": nl.detected_style,
        "targetRoomId": nl.target_room_id,
        "commands": nl.commands,
        "updatedScene": validated.model_dump(),
    }


@router.get("/projects/{project_id}/designs", response_model=list[DesignSchemeResponse])
def list_project_designs(
    project_id: str, db: Session = Depends(get_db)
) -> list[DesignSchemeResponse]:
    rows = db.scalars(
        select(DesignSchemeModel)
        .where(DesignSchemeModel.project_id == project_id)
        .order_by(DesignSchemeModel.created_at.desc())
    ).all()
    return [_to_scheme_response(r) for r in rows]
