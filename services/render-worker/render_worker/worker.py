from __future__ import annotations

from typing import Any


def generate_blender_cycles_script(scene_data: dict[str, Any], resolution_x: int = 1920, resolution_y: int = 1080) -> str:
    """
    Generates a reproducible headless Blender Cycles Python script (.py) from SceneData JSON
    for offline photorealistic path-traced rendering (Phase 5 cloud render worker integration).
    """
    city = scene_data.get("property", {}).get("city", "Sydney")
    wall_count = len(scene_data.get("walls", []))
    room_count = len(scene_data.get("rooms", []))
    return f'''# Auto-generated Blender 4.x Cycles Render Script — AussieHome 3D Platform
# Property City: {city}, Australia | Rooms: {room_count} | Walls: {wall_count}
import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 256
scene.cycles.use_denoising = True
scene.render.resolution_x = {resolution_x}
scene.render.resolution_y = {resolution_y}
scene.unit_settings.system = 'METRIC'
scene.unit_settings.length_unit = 'METERS'
'''
