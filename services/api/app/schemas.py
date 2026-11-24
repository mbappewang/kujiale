from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field


class Point2DDTO(BaseModel):
    x: float
    z: float


class Vec3DTO(BaseModel):
    x: float
    y: float
    z: float


class PropertyMetaDTO(BaseModel):
    country: Literal["AU"] = "AU"
    city: str = "Sydney"
    latitude: float = -33.8688
    longitude: float = 151.2093
    orientationDegrees: float = 0.0
    typology: Literal["detached", "single_storey", "double_storey", "townhouse"] = "single_storey"
    lotWidth: float = Field(default=22.0, gt=0)
    lotDepth: float = Field(default=30.0, gt=0)
    roofPitchDegrees: float = Field(default=21.0, ge=5, le=45)
    roofMaterialId: str = "roof-colorbond-monument"
    exteriorWallMaterialId: str = "brick-sydney-sandstock"


class FloorLevelDTO(BaseModel):
    id: str
    name: str
    levelIndex: int = Field(ge=0)
    elevation: float
    ceilingHeight: float = Field(default=2.85, ge=2.1, le=6.0)
    slabThickness: float = Field(default=0.16, ge=0.05, le=1.0)


class RoomDataDTO(BaseModel):
    id: str
    floorId: str
    name: str
    roomType: str
    polygon: list[Point2DDTO] = Field(min_length=3)
    floorMaterialId: str
    wallMaterialId: str
    ceilingMaterialId: str = "paint-crisp-white"
    isOutdoor: bool = False
    elevationOffset: float = 0.0
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    source: str | None = None


class WallDataDTO(BaseModel):
    id: str
    floorId: str
    start: Point2DDTO
    end: Point2DDTO
    thickness: float = Field(default=0.12, ge=0.05, le=1.0)
    height: float = Field(default=2.85, ge=0.5, le=6.0)
    isExterior: bool = False
    interiorMaterialId: str = "plaster-coastal-white"
    exteriorMaterialId: str = "brick-sydney-sandstock"
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    source: str | None = None


class DoorDataDTO(BaseModel):
    id: str
    floorId: str
    wallId: str
    positionAlongWall: float = Field(ge=0.02, le=0.98)
    width: float = Field(default=0.86, ge=0.5, le=6.0)
    height: float = Field(default=2.15, ge=1.8, le=3.0)
    doorType: str = "hinged"
    isOpen: bool = True
    swingDirection: Literal["left", "right"] = "left"
    materialId: str = "timber-coastal-oak"
    frameMaterialId: str = "paint-crisp-white"
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)


class WindowDataDTO(BaseModel):
    id: str
    floorId: str
    wallId: str
    positionAlongWall: float = Field(ge=0.05, le=0.95)
    width: float = Field(default=1.8, ge=0.4, le=6.0)
    height: float = Field(default=1.35, ge=0.4, le=2.6)
    sillHeight: float = Field(default=0.85, ge=0.0, le=2.2)
    panels: int = Field(default=2, ge=1, le=4)
    glassMaterialId: str = "glass-architectural-clear"
    frameMaterialId: str = "metal-monument-matte"
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)


class FurnitureItemDTO(BaseModel):
    id: str
    catalogId: str
    name: str
    category: str
    floorId: str
    roomId: str | None = None
    glbUrl: str | None = None
    dimensions: Vec3DTO
    position: Vec3DTO
    rotationY: float = 0.0
    scale: Vec3DTO = Field(default_factory=lambda: Vec3DTO(x=1, y=1, z=1))
    primaryMaterialId: str | None = None
    secondaryMaterialId: str | None = None
    priceAUD: float = Field(default=0.0, ge=0.0)


class MaterialOverrideDTO(BaseModel):
    id: str
    name: str
    category: str
    baseColorHex: str
    roughness: float = Field(ge=0.0, le=1.0)
    metalness: float = Field(ge=0.0, le=1.0)
    tileSizeMeters: float = Field(default=1.5, ge=0.05, le=10.0)


class LandscapeElementDTO(BaseModel):
    id: str
    type: str
    name: str
    polygon: list[Point2DDTO] | None = None
    position: Point2DDTO | None = None
    scale: float = Field(default=1.0, gt=0.0)
    rotationY: float = 0.0
    height: float | None = None
    materialId: str | None = None


class LightingConfigDTO(BaseModel):
    timeOfDay: Literal["morning", "noon", "afternoon", "evening"] = "afternoon"
    month: int = Field(default=11, ge=1, le=12)
    dayOfMonth: int = Field(default=25, ge=1, le=31)
    exposure: float = Field(default=1.08, ge=0.3, le=2.5)
    autoIndoorExposure: bool = True
    shadowsEnabled: bool = True
    environmentIntensity: float = Field(default=0.95, ge=0.1, le=3.0)
    interiorLightsOn: bool = True


class FloorplanOverlayDTO(BaseModel):
    floorplanId: str | None = None
    imageUrl: str | None = None
    pixelsPerMeter: float = Field(default=50.0, gt=0)
    opacity: float = Field(default=0.45, ge=0.0, le=1.0)
    offsetX: float = 0.0
    offsetZ: float = 0.0
    calibrated: bool = True


class SceneDataDTO(BaseModel):
    schemaVersion: Literal["1.0"] = "1.0"
    unit: Literal["m"] = "m"
    coordinateSystem: Literal["Y_UP"] = "Y_UP"
    activeStyleId: Literal[
        "modern_coastal", "sydney_contemporary", "melbourne_heritage", "outback_minimalist"
    ] = "modern_coastal"
    property: PropertyMetaDTO
    floors: list[FloorLevelDTO] = Field(min_length=1)
    rooms: list[RoomDataDTO]
    walls: list[WallDataDTO]
    doors: list[DoorDataDTO]
    windows: list[WindowDataDTO]
    furniture: list[FurnitureItemDTO]
    materials: list[MaterialOverrideDTO] = Field(default_factory=list)
    landscape: list[LandscapeElementDTO]
    lighting: LightingConfigDTO
    floorplanOverlay: FloorplanOverlayDTO | None = None


# ============================================================================
# REST Request / Response Schemas
# ============================================================================


class ProjectCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=1000)
    city: str = Field(default="Sydney", max_length=64)
    typology: Literal["detached", "single_storey", "double_storey", "townhouse"] = "single_storey"
    orientationDegrees: float = 0.0
    initialScene: SceneDataDTO | None = None


class ProjectPatchRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    city: str | None = Field(default=None, max_length=64)


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    city: str
    typology: str
    activeSceneId: str
    shareToken: str
    createdAt: datetime
    updatedAt: datetime


class SceneResponse(BaseModel):
    id: str
    projectId: str
    revision: int
    scene: SceneDataDTO
    updatedAt: datetime


class RecognizeFloorplanRequest(BaseModel):
    knownWallLengthMeters: float | None = Field(default=None, gt=0.3, le=60.0)


class FloorplanResponse(BaseModel):
    id: str
    projectId: str | None
    originalFilename: str
    mimeType: str
    fileSizeBytes: int
    status: str
    providerMode: str
    overallConfidence: float | None
    previewUrl: str
    recognition: dict[str, Any] | None
    createdAt: datetime


class DesignGenerateRequest(BaseModel):
    projectId: str
    scene: SceneDataDTO
    name: str = Field(default="Coastal Scheme", min_length=1, max_length=160)
    styleId: Literal[
        "modern_coastal", "sydney_contemporary", "melbourne_heritage", "outback_minimalist"
    ] = "modern_coastal"
    prompt: str | None = None


class DesignApplyCommandRequest(BaseModel):
    projectId: str | None = None
    scene: SceneDataDTO
    naturalLanguagePrompt: str = Field(min_length=2, max_length=600)


class DesignSchemeResponse(BaseModel):
    id: str
    projectId: str
    name: str
    styleId: str
    providerMode: str
    summary: str
    estimatedBudgetAUD: float
    sceneSnapshot: SceneDataDTO
    createdAt: datetime


class RenderCreateRequest(BaseModel):
    projectId: str
    sceneId: str
    quality: Literal["standard", "high", "cycles_export"] = "high"
    cameraPreset: str = "living_room"
    clientSnapshotDataUrl: str | None = None


class RenderJobResponse(BaseModel):
    id: str
    projectId: str
    sceneId: str
    quality: str
    cameraPreset: str
    status: str
    progressPct: int
    engineKind: str
    previewDataUrl: str | None
    cyclesScriptPreview: str | None
    createdAt: datetime
    completedAt: datetime | None
