from __future__ import annotations

import struct
import zlib
from fastapi.testclient import TestClient
import pytest

from app.database import Base, get_db
from app.main import app
from app.storage import LocalPrivateStorage, StorageSecurityError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def _make_minimal_png(width: int = 800, height: int = 600) -> bytes:
    """Builds a valid binary PNG floor plan image in memory for upload & recognition tests."""
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    raw_scanline = b"\x00" + b"\xf5\xf3\xed" * width
    compressed = zlib.compress(raw_scanline * height, level=1)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")


@pytest.fixture()
def client(tmp_path):
    test_db_url = f"sqlite:///{tmp_path / 'test_aussiehome.db'}"
    test_engine = create_engine(test_db_url, connect_args={"check_same_thread": False}, future=True)
    TestingSession = sessionmaker(bind=test_engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=test_engine)

    def _override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_health_and_demo_project_seed(client: TestClient):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["locale"] == "en-AU"
    assert body["units"] == "m"
    assert body["aiProviderMode"] in ("assisted_demo", "gemini")

    projects = client.get("/api/v1/projects").json()
    assert len(projects) >= 1
    demo = projects[0]
    assert demo["city"] == "Sydney"

    scene_res = client.get(f"/api/v1/scenes/{demo['activeSceneId']}")
    assert scene_res.status_code == 200
    scene_payload = scene_res.json()
    assert scene_payload["scene"]["schemaVersion"] == "1.0"
    assert scene_payload["scene"]["unit"] == "m"
    assert len(scene_payload["scene"]["rooms"]) >= 10


def test_project_create_scene_save_and_reload(client: TestClient):
    create_res = client.post(
        "/api/v1/projects",
        json={
            "name": "Melbourne Bayside Renovation",
            "description": "Single-storey family home renovation",
            "city": "Melbourne",
            "typology": "single_storey",
            "orientationDegrees": 15.0,
        },
    )
    assert create_res.status_code == 201
    proj = create_res.json()
    assert proj["city"] == "Melbourne"

    patch_res = client.patch(
        f"/api/v1/projects/{proj['id']}",
        json={"name": "Melbourne Bayside Pavilion"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["name"] == "Melbourne Bayside Pavilion"

    scene_get = client.get(f"/api/v1/scenes/{proj['activeSceneId']}").json()
    scene_data = scene_get["scene"]
    scene_data["rooms"][0]["floorMaterialId"] = "timber-blackbutt-deck"

    put_res = client.put(f"/api/v1/scenes/{proj['activeSceneId']}", json=scene_data)
    assert put_res.status_code == 200
    assert put_res.json()["revision"] == 2
    assert put_res.json()["scene"]["rooms"][0]["floorMaterialId"] == "timber-blackbutt-deck"


def test_floorplan_upload_security_and_end_to_end_recognition(client: TestClient):
    # 1. Reject invalid / executable file disguised as .png
    bad_res = client.post(
        "/api/v1/floorplans/upload",
        files={"file": ("exploit.png", b"#!/bin/sh\necho pwned", "image/png")},
    )
    assert bad_res.status_code == 400

    # 2. Verify storage path traversal guard directly
    storage = LocalPrivateStorage()
    with pytest.raises(StorageSecurityError):
        storage.read_floorplan("../../etc/passwd")

    # 3. Upload valid PNG blueprint with known dimensions (960x720) -> Recognize -> Verify structured ScenePatch
    png_bytes = _make_minimal_png(960, 720)
    up_res = client.post(
        "/api/v1/floorplans/upload",
        files={"file": ("sydney-4bed.png", png_bytes, "image/png")},
    )
    assert up_res.status_code == 201
    fp = up_res.json()
    assert fp["mimeType"] == "image/png"

    rec_res = client.post(
        f"/api/v1/floorplans/{fp['id']}/recognize",
        json={"knownWallLengthMeters": 13.5},
    )
    assert rec_res.status_code == 200
    rec_body = rec_res.json()
    assert rec_body["status"] == "completed"
    assert rec_body["recognition"]["detectedImageWidthPx"] == 960
    assert rec_body["recognition"]["detectedImageHeightPx"] == 720
    assert len(rec_body["recognition"]["scenePatch"]["rooms"]) >= 6
    assert len(rec_body["recognition"]["scenePatch"]["walls"]) >= 8

    # Retrieve private preview file
    file_res = client.get(fp["previewUrl"])
    assert file_res.status_code == 200
    assert file_res.headers["content-type"] == "image/png"


def test_ai_design_schemes_natural_language_and_render_job(client: TestClient):
    projects = client.get("/api/v1/projects").json()
    proj = projects[0]
    scene_data = client.get(f"/api/v1/scenes/{proj['activeSceneId']}").json()["scene"]

    # Natural language renovation command
    nl_res = client.post(
        "/api/v1/designs/apply-command",
        json={
            "projectId": proj["id"],
            "scene": scene_data,
            "naturalLanguagePrompt": "Make my living room look like a modern Australian coastal home with travertine floors at sunset",
        },
    )
    assert nl_res.status_code == 200
    nl_body = nl_res.json()
    assert nl_body["detectedStyle"] == "modern_coastal"
    assert len(nl_body["commands"]) >= 2

    # Save two distinct design schemes and list for comparison
    for name, style in [("Scheme A — Byron Coastal", "modern_coastal"), ("Scheme B — Sydney Urban", "sydney_contemporary")]:
        gen_res = client.post(
            "/api/v1/designs/generate",
            json={
                "projectId": proj["id"],
                "scene": scene_data,
                "name": name,
                "styleId": style,
            },
        )
        assert gen_res.status_code == 201

    schemes = client.get(f"/api/v1/projects/{proj['id']}/designs").json()
    assert len(schemes) >= 2

    # Submit async render job and poll completion
    render_post = client.post(
        "/api/v1/renders",
        json={
            "projectId": proj["id"],
            "sceneId": proj["activeSceneId"],
            "quality": "cycles_export",
            "cameraPreset": "living_room",
        },
    )
    assert render_post.status_code == 202
    job_id = render_post.json()["id"]

    render_get = client.get(f"/api/v1/renders/{job_id}")
    assert render_get.status_code == 200
    assert render_get.json()["status"] == "completed"
    assert "CYCLES" in render_get.json()["cyclesScriptPreview"]
