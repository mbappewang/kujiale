import { deepClone, polygonAreaSqm } from '@kujiale/shared';
import { SCHEMA_VERSION, SceneDataSchema, type SceneData } from './schema';

export interface SceneMetrics {
  indoorAreaSqm: number;
  outdoorCoveredAreaSqm: number;
  totalBuildingAreaSqm: number;
  roomCount: number;
  wallCount: number;
  doorCount: number;
  windowCount: number;
  furnitureCount: number;
  estimatedFurnitureBudgetAUD: number;
}

export function validateSceneData(input: unknown): SceneData {
  return SceneDataSchema.parse(input);
}

export function safeValidateSceneData(input: unknown): {
  success: boolean;
  data?: SceneData;
  errors?: string[];
} {
  const result = SceneDataSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}

export function migrateSceneData(raw: Record<string, unknown>): SceneData {
  const cloned = deepClone(raw);
  if (!cloned.schemaVersion || cloned.schemaVersion === '0.9') {
    cloned.schemaVersion = SCHEMA_VERSION;
    cloned.unit = 'm';
    cloned.coordinateSystem = 'Y_UP';
  }
  return validateSceneData(cloned);
}

export function serializeScene(scene: SceneData): string {
  const validated = validateSceneData(scene);
  return JSON.stringify(validated, null, 2);
}

export function deserializeScene(jsonText: string): SceneData {
  const parsed: unknown = JSON.parse(jsonText);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid scene JSON root');
  }
  return migrateSceneData(parsed as Record<string, unknown>);
}

export function computeSceneMetrics(scene: SceneData): SceneMetrics {
  let indoorAreaSqm = 0;
  let outdoorCoveredAreaSqm = 0;
  for (const room of scene.rooms) {
    const area = polygonAreaSqm(room.polygon);
    if (room.isOutdoor) {
      outdoorCoveredAreaSqm += area;
    } else {
      indoorAreaSqm += area;
    }
  }
  const estimatedFurnitureBudgetAUD = scene.furniture.reduce(
    (sum, item) => sum + (item.priceAUD || 0),
    0,
  );
  return {
    indoorAreaSqm: Number(indoorAreaSqm.toFixed(2)),
    outdoorCoveredAreaSqm: Number(outdoorCoveredAreaSqm.toFixed(2)),
    totalBuildingAreaSqm: Number((indoorAreaSqm + outdoorCoveredAreaSqm).toFixed(2)),
    roomCount: scene.rooms.length,
    wallCount: scene.walls.length,
    doorCount: scene.doors.length,
    windowCount: scene.windows.length,
    furnitureCount: scene.furniture.length,
    estimatedFurnitureBudgetAUD: Math.round(estimatedFurnitureBudgetAUD),
  };
}
