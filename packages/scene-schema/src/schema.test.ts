import { describe, expect, it } from 'vitest';
import {
  computeSceneMetrics,
  createSydneyCoastalDemoScene,
  deserializeScene,
  DesignCommandSchema,
  safeValidateSceneData,
  serializeScene,
} from './index';

describe('SceneSchema & Sydney Coastal Demo', () => {
  it('validates the canonical Sydney Coastal residence and falls within 200-250 m² target', () => {
    const scene = createSydneyCoastalDemoScene();
    const validation = safeValidateSceneData(scene);
    expect(validation.success).toBe(true);

    const metrics = computeSceneMetrics(scene);
    expect(metrics.totalBuildingAreaSqm).toBeGreaterThanOrEqual(200);
    expect(metrics.totalBuildingAreaSqm).toBeLessThanOrEqual(250);
    expect(metrics.roomCount).toBe(12);
    expect(metrics.wallCount).toBeGreaterThanOrEqual(15);
    expect(metrics.furnitureCount).toBeGreaterThanOrEqual(12);
  });

  it('round-trips scene serialization and migrates legacy version metadata', () => {
    const scene = createSydneyCoastalDemoScene();
    const json = serializeScene(scene);
    const restored = deserializeScene(json);
    expect(restored.property.city).toBe('Sydney');
    expect(restored.unit).toBe('m');
    expect(restored.coordinateSystem).toBe('Y_UP');

    const legacyRaw = JSON.parse(json) as Record<string, unknown>;
    legacyRaw.schemaVersion = '0.9';
    const migrated = deserializeScene(JSON.stringify(legacyRaw));
    expect(migrated.schemaVersion).toBe('1.0');
  });

  it('ensures every door and window references an existing wall', () => {
    const scene = createSydneyCoastalDemoScene();
    const wallIds = new Set(scene.walls.map((w) => w.id));
    for (const door of scene.doors) {
      expect(wallIds.has(door.wallId)).toBe(true);
    }
    for (const win of scene.windows) {
      expect(wallIds.has(win.wallId)).toBe(true);
    }
  });

  it('validates structured AI design commands and rejects malformed payloads', () => {
    const valid = DesignCommandSchema.safeParse({
      type: 'update_room_material',
      roomId: 'room-living',
      target: 'floor',
      materialId: 'timber-blackbutt-deck',
    });
    expect(valid.success).toBe(true);

    const invalid = DesignCommandSchema.safeParse({
      type: 'execute_raw_threejs_script',
      code: 'scene.clear()',
    });
    expect(invalid.success).toBe(false);
  });
});
