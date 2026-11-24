import {
  clamp,
  distance2D,
  lerpPoint2D,
  obbCorners2D,
  obbOverlap2D,
  pointInPolygon,
  polygonBounds,
  projectPointOnSegment,
  type OrientedBox2D,
  type Point2D,
} from '@kujiale/shared';
import type { FurnitureItemData, SceneData } from '@kujiale/scene-schema';
import { getFurnitureCatalogEntry } from './catalog';

export interface FurnitureValidationIssue {
  code: 'OUT_OF_ROOM' | 'WALL_PENETRATION' | 'DOOR_BLOCKED' | 'FURNITURE_OVERLAP';
  message: string;
}

export interface FurnitureValidationResult {
  valid: boolean;
  issues: FurnitureValidationIssue[];
}

export function furnitureToObb2D(item: FurnitureItemData): OrientedBox2D {
  return {
    center: { x: item.position.x, z: item.position.z },
    halfWidth: (item.dimensions.x * item.scale.x) * 0.5,
    halfDepth: (item.dimensions.z * item.scale.z) * 0.5,
    rotationY: item.rotationY,
  };
}

function isFlatFloorRug(item: FurnitureItemData): boolean {
  const entry = getFurnitureCatalogEntry(item.catalogId);
  return Boolean(entry?.isWalkableUnderOrOver || item.dimensions.y <= 0.04);
}

/**
 * Validates that a furniture item stays within room boundaries, does not penetrate walls,
 * leaves doorway thresholds clear for passage, and does not overlap other solid furniture.
 */
export function validateFurniturePlacement(
  item: FurnitureItemData,
  scene: SceneData,
): FurnitureValidationResult {
  const issues: FurnitureValidationIssue[] = [];
  const obb = furnitureToObb2D(item);
  const corners = obbCorners2D(obb);

  // 1. Room boundary check (if assigned to a room)
  if (item.roomId) {
    const room = scene.rooms.find((r) => r.id === item.roomId);
    if (room) {
      // Allow 4cm tolerance for flush wall-mounted cabinetry/wardrobes
      const bounds = polygonBounds(room.polygon);
      const tol = 0.06;
      const outside = corners.some(
        (c) =>
          c.x < bounds.minX - tol ||
          c.x > bounds.maxX + tol ||
          c.z < bounds.minZ - tol ||
          c.z > bounds.maxZ + tol ||
          (!pointInPolygon(c, room.polygon) &&
            c.x < bounds.minX + tol &&
            !pointInPolygon(obb.center, room.polygon)),
      );
      if (outside) {
        issues.push({
          code: 'OUT_OF_ROOM',
          message: `${item.name} extends beyond ${room.name} boundaries.`,
        });
      }
    }
  }

  // 2. Wall penetration check (test OBB against thickened wall segments on same floor)
  const wallById = new Map(scene.walls.map((w) => [w.id, w]));
  for (const wall of scene.walls) {
    if (wall.floorId !== item.floorId) continue;
    const len = distance2D(wall.start, wall.end);
    if (len < 0.05) continue;
    const mid = lerpPoint2D(wall.start, wall.end, 0.5);
    const angle = -Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
    const wallObb: OrientedBox2D = {
      center: mid,
      halfWidth: len * 0.5,
      halfDepth: Math.max(0.02, wall.thickness * 0.5 - 0.03),
      rotationY: angle,
    };
    if (obbOverlap2D(obb, wallObb, -0.02)) {
      issues.push({
        code: 'WALL_PENETRATION',
        message: `${item.name} intersects wall ${wall.id}.`,
      });
      break;
    }
  }

  // 3. Doorway clearance check (minimum 0.62m clear passage around active interior/entry doors)
  if (!isFlatFloorRug(item)) {
    for (const door of scene.doors) {
      if (door.floorId !== item.floorId || door.doorType === 'garage_sectional') continue;
      const hostWall = wallById.get(door.wallId);
      if (!hostWall) continue;
      const doorCenter: Point2D = lerpPoint2D(
        hostWall.start,
        hostWall.end,
        door.positionAlongWall,
      );
      const doorClearBox: OrientedBox2D = {
        center: doorCenter,
        halfWidth: door.width * 0.38,
        halfDepth: 0.52,
        rotationY: -Math.atan2(
          hostWall.end.z - hostWall.start.z,
          hostWall.end.x - hostWall.start.x,
        ),
      };
      if (obbOverlap2D(obb, doorClearBox)) {
        issues.push({
          code: 'DOOR_BLOCKED',
          message: `${item.name} obstructs doorway clearance (${door.id}).`,
        });
        break;
      }
    }
  }

  // 4. Solid-furniture-vs-solid-furniture overlap check
  if (!isFlatFloorRug(item)) {
    for (const other of scene.furniture) {
      if (other.id === item.id || other.floorId !== item.floorId || isFlatFloorRug(other)) {
        continue;
      }
      const otherObb = furnitureToObb2D(other);
      if (obbOverlap2D(obb, otherObb, -0.04)) {
        issues.push({
          code: 'FURNITURE_OVERLAP',
          message: `${item.name} overlaps with ${other.name}.`,
        });
        break;
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Constrains a dragged furniture target XZ position so it stays cleanly inside its room
 * and clears adjacent walls without penetrating them.
 */
export function constrainFurniturePositionToRoom(
  item: FurnitureItemData,
  desiredXZ: Point2D,
  scene: SceneData,
): { position: Point2D; roomId?: string } {
  const obb = furnitureToObb2D({
    ...item,
    position: { x: desiredXZ.x, y: item.position.y, z: desiredXZ.z },
  });
  const effectiveRadius = Math.max(obb.halfWidth, obb.halfDepth);

  // Identify containing room (or fall back to current room)
  const hitRoom =
    scene.rooms.find((r) => pointInPolygon(desiredXZ, r.polygon)) ??
    scene.rooms.find((r) => r.id === item.roomId);

  let next = { ...desiredXZ };
  if (hitRoom) {
    const b = polygonBounds(hitRoom.polygon);
    const cos = Math.abs(Math.cos(item.rotationY));
    const sin = Math.abs(Math.sin(item.rotationY));
    const extX = obb.halfWidth * cos + obb.halfDepth * sin + 0.08;
    const extZ = obb.halfWidth * sin + obb.halfDepth * cos + 0.08;
    if (b.width > extX * 2) {
      next.x = clamp(next.x, b.minX + extX, b.maxX - extX);
    }
    if (b.depth > extZ * 2) {
      next.z = clamp(next.z, b.minZ + extZ, b.maxZ - extZ);
    }
  }

  // Push away from solid wall segments if closer than half-thickness + minor margin
  for (const wall of scene.walls) {
    if (wall.floorId !== item.floorId) continue;
    const proj = projectPointOnSegment(next, wall.start, wall.end);
    const minClear = wall.thickness * 0.5 + Math.min(obb.halfWidth, obb.halfDepth) + 0.03;
    if (proj.distance < minClear && proj.distance > 1e-5 && proj.distance < effectiveRadius) {
      const dx = (next.x - proj.point.x) / proj.distance;
      const dz = (next.z - proj.point.z) / proj.distance;
      next = {
        x: proj.point.x + dx * minClear,
        z: proj.point.z + dz * minClear,
      };
    }
  }

  return { position: next, roomId: hitRoom?.id ?? item.roomId };
}
