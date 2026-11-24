#!/usr/bin/env python3
"""
Downloads 100% CC0 Public Domain photorealistic 3D models, scanned PBR texture sets,
and 32-bit HDRI skies from Poly Haven (https://polyhaven.com/license), and packs
multi-file glTF assets into single-request binary .glb files for AussieHome 3D.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from pathlib import Path
import struct
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "apps" / "web" / "public"
MODELS_DIR = PUBLIC_DIR / "models"
TEXTURES_DIR = PUBLIC_DIR / "textures"
HDRI_DIR = PUBLIC_DIR / "hdri"

UA = {"User-Agent": "AussieHome3D-CC0-AssetPipeline/1.0"}

MODELS_TO_FETCH = [
    "sofa_03",
    "Sofa_01",
    "mid_century_lounge_chair",
    "modern_arm_chair_01",
    "modern_coffee_table_01",
    "side_table_01",
    "modern_wooden_cabinet",
    "dining_table",
    "gallinera_table",
    "dining_chair_02",
    "bar_chair_round_01",
    "outdoor_table_chair_set_01",
    "potted_plant_02",
    "shrub_03",
    "fern_02",
]

TEXTURES_TO_FETCH = [
    "laminate_floor_02",
    "oak_wood_planks",
    "wood_floor_deck",
    "interior_tiles",
    "terrazzo_tiles",
    "marble_01",
    "brushed_concrete",
    "brick_wall_001",
    "brick_wall_13",
    "painted_plaster_wall",
    "rough_linen",
    "brown_leather",
    "leafy_grass",
    "corrugated_iron",
    "clay_roof_tiles",
]

HDRIS_TO_FETCH = {
    "sunsky_day.hdr": "kloofendal_48d_partly_cloudy_puresky",
    "sunsky_evening.hdr": "belfast_sunset_puresky",
}


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def fetch_json(url: str) -> dict:
    return json.loads(fetch_bytes(url).decode("utf-8"))


def pad4(data: bytes, pad_byte: bytes = b"\x00") -> bytes:
    rem = len(data) % 4
    return data if rem == 0 else data + pad_byte * (4 - rem)


def download_and_pack_model(model_id: str) -> tuple[str, int]:
    out_path = MODELS_DIR / f"{model_id}.glb"
    if out_path.exists() and out_path.stat().st_size > 20_000:
        return model_id, out_path.stat().st_size

    meta = fetch_json(f"https://api.polyhaven.com/files/{model_id}")
    gltf_entry = meta["gltf"]["1k"]["gltf"]
    gltf_json = json.loads(fetch_bytes(gltf_entry["url"]).decode("utf-8"))
    includes: dict[str, dict] = gltf_entry.get("include", {})

    # Download .bin + included texture images
    downloaded_includes: dict[str, bytes] = {}
    for rel_key, info in includes.items():
        downloaded_includes[rel_key] = fetch_bytes(info["url"])

    # Primary geometry buffer (always index 0 in Poly Haven glTF)
    buf0_uri = gltf_json["buffers"][0]["uri"]
    raw_bin = downloaded_includes[buf0_uri]
    bin_stream = bytearray(pad4(raw_bin, b"\x00"))

    buffer_views = gltf_json.setdefault("bufferViews", [])
    for img in gltf_json.get("images", []):
        uri = img.get("uri")
        if not uri or uri not in downloaded_includes:
            continue
        img_bytes = downloaded_includes[uri]
        bv_index = len(buffer_views)
        buffer_views.append(
            {
                "buffer": 0,
                "byteOffset": len(bin_stream),
                "byteLength": len(img_bytes),
            }
        )
        bin_stream.extend(pad4(img_bytes, b"\x00"))
        mime = "image/png" if uri.lower().endswith(".png") else "image/jpeg"
        img.pop("uri", None)
        img["bufferView"] = bv_index
        img["mimeType"] = mime

    gltf_json["buffers"] = [{"byteLength": len(bin_stream)}]
    gltf_json.setdefault("asset", {})["copyright"] = f"CC0 Public Domain via Poly Haven ({model_id})"

    json_bytes = pad4(json.dumps(gltf_json, separators=(",", ":")).encode("utf-8"), b" ")
    bin_bytes = bytes(bin_stream)

    total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    glb = bytearray()
    glb.extend(struct.pack("<III", 0x46546C67, 2, total_len))
    glb.extend(struct.pack("<II", len(json_bytes), 0x4E4F534A))
    glb.extend(json_bytes)
    glb.extend(struct.pack("<II", len(bin_bytes), 0x004E4942))
    glb.extend(bin_bytes)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(bytes(glb))
    return model_id, len(glb)


def _pick_jpg_or_png(channel_dict: dict, res: str = "1k") -> str | None:
    res_block = channel_dict.get(res) or channel_dict.get("2k")
    if not res_block:
        return None
    for fmt in ("jpg", "png"):
        if fmt in res_block and "url" in res_block[fmt]:
            return res_block[fmt]["url"]
    return None


def download_texture_pack(tex_id: str) -> tuple[str, int]:
    pack_dir = TEXTURES_DIR / tex_id
    diff_path = pack_dir / "diff.jpg"
    nor_path = pack_dir / "nor_gl.jpg"
    arm_path = pack_dir / "arm.jpg"
    if diff_path.exists() and nor_path.exists() and arm_path.exists():
        total = diff_path.stat().st_size + nor_path.stat().st_size + arm_path.stat().st_size
        return tex_id, total

    pack_dir.mkdir(parents=True, exist_ok=True)
    meta = fetch_json(f"https://api.polyhaven.com/files/{tex_id}")

    diff_block = meta.get("Diffuse") or meta.get("col_1") or meta.get("col") or {}
    nor_block = meta.get("nor_gl") or {}
    arm_block = meta.get("arm") or meta.get("Rough") or {}

    diff_url = _pick_jpg_or_png(diff_block, "1k")
    nor_url = _pick_jpg_or_png(nor_block, "1k")
    arm_url = _pick_jpg_or_png(arm_block, "1k")

    total_bytes = 0
    if diff_url:
        b = fetch_bytes(diff_url)
        diff_path.write_bytes(b)
        total_bytes += len(b)
    if nor_url:
        b = fetch_bytes(nor_url)
        nor_path.write_bytes(b)
        total_bytes += len(b)
    if arm_url:
        b = fetch_bytes(arm_url)
        arm_path.write_bytes(b)
        total_bytes += len(b)
    return tex_id, total_bytes


def download_hdri(local_name: str, hdri_id: str) -> tuple[str, int]:
    HDRI_DIR.mkdir(parents=True, exist_ok=True)
    out_path = HDRI_DIR / local_name
    if out_path.exists() and out_path.stat().st_size > 100_000:
        return local_name, out_path.stat().st_size
    meta = fetch_json(f"https://api.polyhaven.com/files/{hdri_id}")
    hdr_url = meta["hdri"]["1k"]["hdr"]["url"]
    data = fetch_bytes(hdr_url)
    out_path.write_bytes(data)
    return local_name, len(data)


def main() -> None:
    print("=== Fetching CC0 Models, Scanned PBR Textures & 32-bit HDRIs from Poly Haven ===")
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {}
        for m in MODELS_TO_FETCH:
            futures[pool.submit(download_and_pack_model, m)] = f"model:{m}"
        for t in TEXTURES_TO_FETCH:
            futures[pool.submit(download_texture_pack, t)] = f"tex:{t}"
        for local_hdr, hdr_id in HDRIS_TO_FETCH.items():
            futures[pool.submit(download_hdri, local_hdr, hdr_id)] = f"hdri:{local_hdr}"

        for fut in as_completed(futures):
            tag = futures[fut]
            name, sz = fut.result()
            print(f"  [OK] {tag:34s} -> {sz / 1024:7.1f} KB")

    manifest_path = ROOT / "assets" / "LICENSE-ASSETS.md"
    manifest_path.write_text(
        "# Asset Commercial Licensing & Provenance Manifest\n\n"
        "All 3D furniture/flora `.glb` models, scanned 1K PBR textures (`diff`, `nor_gl`, `arm`), "
        "and 32-bit `.hdr` environment skies in `apps/web/public/{models,textures,hdri}` are sourced from "
        "**Poly Haven (https://polyhaven.com/license)** under **CC0 1.0 Universal Public Domain Dedication** "
        "(100% free for commercial and non-commercial use without restriction), alongside first-party "
        "procedurally authored blueprints (`sydney-coastal-4bed.png`).\n\n"
        f"## Bundled CC0 3D Models ({len(MODELS_TO_FETCH)})\n"
        + "".join(f"- `{m}.glb` (Poly Haven CC0)\n" for m in MODELS_TO_FETCH)
        + f"\n## Bundled CC0 Scanned PBR Texture Sets ({len(TEXTURES_TO_FETCH)})\n"
        + "".join(f"- `{t}` (`diff.jpg`, `nor_gl.jpg`, `arm.jpg` — Poly Haven CC0)\n" for t in TEXTURES_TO_FETCH)
        + "\n## Bundled CC0 32-bit Equirectangular HDRIs\n"
        + "".join(f"- `{k}` (`{v}` — Poly Haven CC0)\n" for k, v in HDRIS_TO_FETCH.items()),
        encoding="utf-8",
    )
    print("=== All CC0 Photorealistic Assets Ready ===")


if __name__ == "__main__":
    main()
