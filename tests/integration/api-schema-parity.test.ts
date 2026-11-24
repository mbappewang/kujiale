import { createSydneyCoastalDemoScene, SceneDataSchema } from '@kujiale/scene-schema';
import { describe, expect, it } from 'vitest';

describe('Frontend/Backend Scene JSON Contract Parity', () => {
  it('ensures canonical scene JSON satisfies strict field and coordinate invariants', () => {
    const scene = createSydneyCoastalDemoScene();
    const raw = JSON.parse(JSON.stringify(scene)) as Record<string, unknown>;
    const parsed = SceneDataSchema.parse(raw);

    expect(parsed.schemaVersion).toBe('1.0');
    expect(parsed.unit).toBe('m');
    expect(parsed.coordinateSystem).toBe('Y_UP');
    expect(parsed.property.country).toBe('AU');
    expect(parsed.floors.length).toBeGreaterThanOrEqual(1);
    expect(parsed.rooms.every((r) => r.polygon.length >= 3)).toBe(true);
    expect(parsed.walls.every((w) => w.thickness >= 0.05 && w.height >= 0.5)).toBe(true);
  });
});
