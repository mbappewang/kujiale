import {
  clamp,
  distance2D,
  lerpPoint2D,
  lineIntersection2D,
  pointInPolygon,
  wallDirection,
  wallNormal,
  type Point2D,
} from '@kujiale/shared';
import type { DoorData, PropertyMeta, RoomData, WallData, WindowData } from '@kujiale/scene-schema';
import type { MaterialSystem } from '@kujiale/materials';
import * as THREE from 'three';

export interface OpeningSpan {
  id: string;
  kind: 'door' | 'window';
  uStart: number;
  uEnd: number;
  yBottom: number;
  yTop: number;
}

interface WallCornerEndpoints {
  startLeft: Point2D;
  startRight: Point2D;
  endLeft: Point2D;
  endRight: Point2D;
}

function findConnectedWallsAtPoint(
  point: Point2D,
  selfId: string,
  allWalls: readonly WallData[],
): WallData[] {
  const eps = 0.04;
  return allWalls.filter(
    (w) =>
      w.id !== selfId &&
      (distance2D(w.start, point) <= eps || distance2D(w.end, point) <= eps),
  );
}

/**
 * Computes mitered corner vertices where walls meet so L-corners join cleanly without overlap or gaps.
 */
function computeMiteredCorners(
  wall: WallData,
  allWalls: readonly WallData[],
): WallCornerEndpoints {
  const dir = wallDirection(wall.start, wall.end);
  const leftN = wallNormal(wall.start, wall.end);
  const halfT = wall.thickness * 0.5;

  const baseStartLeft = { x: wall.start.x + leftN.x * halfT, z: wall.start.z + leftN.z * halfT };
  const baseStartRight = { x: wall.start.x - leftN.x * halfT, z: wall.start.z - leftN.z * halfT };
  const baseEndLeft = { x: wall.end.x + leftN.x * halfT, z: wall.end.z + leftN.z * halfT };
  const baseEndRight = { x: wall.end.x - leftN.x * halfT, z: wall.end.z - leftN.z * halfT };

  const maxMiterDist = wall.thickness * 1.65;

  const adjustCorner = (
    joint: Point2D,
    baseSidePt: Point2D,
    sideSign: 1 | -1,
  ): Point2D => {
    const neighbors = findConnectedWallsAtPoint(joint, wall.id, allWalls);
    if (neighbors.length !== 1) {
      // T-junctions or free ends: butt/flush cleanly to avoid intersecting 3-way spikes
      return baseSidePt;
    }
    const other = neighbors[0]!;
    const otherAtStart = distance2D(other.start, joint) <= 0.04;
    // Direction pointing away from joint along neighbor
    const otherOutDir = otherAtStart
      ? wallDirection(other.start, other.end)
      : wallDirection(other.end, other.start);
    const otherLeftFromJoint = { x: -otherOutDir.z, z: otherOutDir.x };
    const otherHalfT = other.thickness * 0.5;

    // Match left/right side around joint
    const candidateA = {
      x: joint.x - otherLeftFromJoint.x * otherHalfT * sideSign,
      z: joint.z - otherLeftFromJoint.z * otherHalfT * sideSign,
    };
    const hit = lineIntersection2D(baseSidePt, dir, candidateA, otherOutDir);
    if (hit && distance2D(hit, baseSidePt) <= maxMiterDist) {
      return hit;
    }
    return baseSidePt;
  };

  return {
    startLeft: adjustCorner(wall.start, baseStartLeft, 1),
    startRight: adjustCorner(wall.start, baseStartRight, -1),
    endLeft: adjustCorner(wall.end, baseEndLeft, 1),
    endRight: adjustCorner(wall.end, baseEndRight, -1),
  };
}

function appendQuad(
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
  v0: [number, number, number],
  v1: [number, number, number],
  v2: [number, number, number],
  v3: [number, number, number],
  uv0: [number, number],
  uv1: [number, number],
  uv2: [number, number],
  uv3: [number, number],
): void {
  const baseIndex = positions.length / 3;
  const e1x = v1[0] - v0[0];
  const e1y = v1[1] - v0[1];
  const e1z = v1[2] - v0[2];
  const e2x = v3[0] - v0[0];
  const e2y = v3[1] - v0[1];
  const e2z = v3[2] - v0[2];

  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;

  positions.push(...v0, ...v1, ...v2, ...v3);
  for (let i = 0; i < 4; i++) {
    normals.push(nx, ny, nz);
  }
  uvs.push(...uv0, ...uv1, ...uv2, ...uv3);
  indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3);
}

interface FaceBuffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

function createEmptyBuffers(): FaceBuffers {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function toBufferGeometry(buf: FaceBuffers): THREE.BufferGeometry | null {
  if (buf.indices.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uvs, 2));
  geo.setIndex(buf.indices);
  geo.computeBoundingSphere();
  return geo;
}

export function collectWallOpenings(
  wall: WallData,
  wallLen: number,
  doors: readonly DoorData[],
  windows: readonly WindowData[],
): OpeningSpan[] {
  const spans: OpeningSpan[] = [];
  const margin = 0.06;

  for (const door of doors) {
    if (door.wallId !== wall.id) continue;
    const centerU = door.positionAlongWall * wallLen;
    const halfW = Math.min(door.width * 0.5, wallLen * 0.48);
    const uStart = clamp(centerU - halfW, margin, wallLen - margin);
    const uEnd = clamp(centerU + halfW, margin, wallLen - margin);
    if (uEnd - uStart > 0.2) {
      spans.push({
        id: door.id,
        kind: 'door',
        uStart,
        uEnd,
        yBottom: 0,
        yTop: Math.min(door.height, wall.height - 0.05),
      });
    }
  }

  for (const win of windows) {
    if (win.wallId !== wall.id) continue;
    const centerU = win.positionAlongWall * wallLen;
    const halfW = Math.min(win.width * 0.5, wallLen * 0.48);
    const uStart = clamp(centerU - halfW, margin, wallLen - margin);
    const uEnd = clamp(centerU + halfW, margin, wallLen - margin);
    const yBottom = clamp(win.sillHeight, 0.05, wall.height - 0.3);
    const yTop = clamp(win.sillHeight + win.height, yBottom + 0.25, wall.height - 0.05);
    if (uEnd - uStart > 0.2) {
      spans.push({
        id: win.id,
        kind: 'window',
        uStart,
        uEnd,
        yBottom,
        yTop,
      });
    }
  }

  spans.sort((a, b) => a.uStart - b.uStart);

  // Prevent accidental overlapping openings on the same wall
  const resolved: OpeningSpan[] = [];
  for (const s of spans) {
    const prev = resolved[resolved.length - 1];
    if (!prev || s.uStart >= prev.uEnd + 0.04) {
      resolved.push(s);
    }
  }
  return resolved;
}

function resolveSideMaterialAndRoom(
  samplePoint: Point2D,
  wall: WallData,
  rooms: readonly RoomData[],
  property: PropertyMeta,
): { materialId: string; roomId?: string; isExteriorFace: boolean } {
  const hitRoom = rooms.find((r) => !r.isOutdoor && pointInPolygon(samplePoint, r.polygon));
  if (hitRoom) {
    return {
      materialId: hitRoom.wallMaterialId || wall.interiorMaterialId,
      roomId: hitRoom.id,
      isExteriorFace: false,
    };
  }
  if (wall.isExterior) {
    return {
      materialId: property.exteriorWallMaterialId || wall.exteriorMaterialId,
      isExteriorFace: true,
    };
  }
  return {
    materialId: wall.interiorMaterialId,
    isExteriorFace: false,
  };
}

/**
 * Builds accurate segmented 3D wall geometry with mitered corners, door/window cutouts,
 * opening jambs/sills/lintels, and room-aware interior/exterior PBR material assignment.
 */
export function buildWallGroup(
  wall: WallData,
  baseElevation: number,
  slabThickness: number,
  allWalls: readonly WallData[],
  rooms: readonly RoomData[],
  doors: readonly DoorData[],
  windows: readonly WindowData[],
  property: PropertyMeta,
  materials: MaterialSystem,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `wall-${wall.id}`;

  const wallLen = distance2D(wall.start, wall.end);
  if (wallLen < 0.05) return group;

  const corners = computeMiteredCorners(wall, allWalls);
  const leftN = wallNormal(wall.start, wall.end);
  const mid = lerpPoint2D(wall.start, wall.end, 0.5);
  const probeOffset = wall.thickness * 0.5 + 0.18;

  const leftSideInfo = resolveSideMaterialAndRoom(
    { x: mid.x + leftN.x * probeOffset, z: mid.z + leftN.z * probeOffset },
    wall,
    rooms,
    property,
  );
  const rightSideInfo = resolveSideMaterialAndRoom(
    { x: mid.x - leftN.x * probeOffset, z: mid.z - leftN.z * probeOffset },
    wall,
    rooms,
    property,
  );

  // Exterior walls extend down by slabThickness so exterior brickwork reaches ground Y=0 seamlessly
  const yFloor = wall.isExterior ? baseElevation - slabThickness : baseElevation;
  const yCeil = baseElevation + wall.height;

  const openings = collectWallOpenings(wall, wallLen, doors, windows);

  const leftBuf = createEmptyBuffers();
  const rightBuf = createEmptyBuffers();
  const trimBuf = createEmptyBuffers(); // Jambs, lintel soffits, sills, wall top caps

  const pointLeftAt = (u: number): Point2D =>
    lerpPoint2D(corners.startLeft, corners.endLeft, u / wallLen);
  const pointRightAt = (u: number): Point2D =>
    lerpPoint2D(corners.startRight, corners.endRight, u / wallLen);

  const addPrismBlock = (
    u0: number,
    u1: number,
    y0: number,
    y1: number,
    capStart: boolean,
    capEnd: boolean,
    capBottom: boolean,
    capTop: boolean,
  ) => {
    if (u1 - u0 < 1e-3 || y1 - y0 < 1e-3) return;
    const pFL = pointLeftAt(u0);
    const pBL = pointLeftAt(u1);
    const pFR = pointRightAt(u0);
    const pBR = pointRightAt(u1);

    // +Left face
    appendQuad(
      leftBuf.positions,
      leftBuf.normals,
      leftBuf.uvs,
      leftBuf.indices,
      [pFL.x, y0, pFL.z],
      [pBL.x, y0, pBL.z],
      [pBL.x, y1, pBL.z],
      [pFL.x, y1, pFL.z],
      [u0, y0],
      [u1, y0],
      [u1, y1],
      [u0, y1],
    );

    // -Left (Right) face
    appendQuad(
      rightBuf.positions,
      rightBuf.normals,
      rightBuf.uvs,
      rightBuf.indices,
      [pBR.x, y0, pBR.z],
      [pFR.x, y0, pFR.z],
      [pFR.x, y1, pFR.z],
      [pBR.x, y1, pBR.z],
      [wallLen - u1, y0],
      [wallLen - u0, y0],
      [wallLen - u0, y1],
      [wallLen - u1, y1],
    );

    if (capTop) {
      appendQuad(
        trimBuf.positions,
        trimBuf.normals,
        trimBuf.uvs,
        trimBuf.indices,
        [pFL.x, y1, pFL.z],
        [pBL.x, y1, pBL.z],
        [pBR.x, y1, pBR.z],
        [pFR.x, y1, pFR.z],
        [u0, 0],
        [u1, 0],
        [u1, wall.thickness],
        [u0, wall.thickness],
      );
    }

    if (capBottom) {
      appendQuad(
        trimBuf.positions,
        trimBuf.normals,
        trimBuf.uvs,
        trimBuf.indices,
        [pFR.x, y0, pFR.z],
        [pBR.x, y0, pBR.z],
        [pBL.x, y0, pBL.z],
        [pFL.x, y0, pFL.z],
        [u0, 0],
        [u1, 0],
        [u1, wall.thickness],
        [u0, wall.thickness],
      );
    }

    if (capStart) {
      appendQuad(
        trimBuf.positions,
        trimBuf.normals,
        trimBuf.uvs,
        trimBuf.indices,
        [pFR.x, y0, pFR.z],
        [pFL.x, y0, pFL.z],
        [pFL.x, y1, pFL.z],
        [pFR.x, y1, pFR.z],
        [0, y0],
        [wall.thickness, y0],
        [wall.thickness, y1],
        [0, y1],
      );
    }

    if (capEnd) {
      appendQuad(
        trimBuf.positions,
        trimBuf.normals,
        trimBuf.uvs,
        trimBuf.indices,
        [pBL.x, y0, pBL.z],
        [pBR.x, y0, pBR.z],
        [pBR.x, y1, pBR.z],
        [pBL.x, y1, pBL.z],
        [0, y0],
        [wall.thickness, y0],
        [wall.thickness, y1],
        [0, y1],
      );
    }
  };

  let cursorU = 0;
  for (const op of openings) {
    if (op.uStart > cursorU + 0.005) {
      addPrismBlock(cursorU, op.uStart, yFloor, yCeil, cursorU === 0, true, false, true);
    }
    const opBottomWorld = baseElevation + op.yBottom;
    const opTopWorld = baseElevation + op.yTop;

    // Below window sill (or below raised threshold)
    if (opBottomWorld > yFloor + 0.01) {
      addPrismBlock(op.uStart, op.uEnd, yFloor, opBottomWorld, false, false, false, true);
    }
    // Lintel above door/window
    if (yCeil > opTopWorld + 0.01) {
      addPrismBlock(op.uStart, op.uEnd, opTopWorld, yCeil, false, false, true, true);
    }
    cursorU = op.uEnd;
  }

  if (cursorU < wallLen - 0.005) {
    addPrismBlock(cursorU, wallLen, yFloor, yCeil, cursorU === 0, true, false, true);
  }

  const leftGeo = toBufferGeometry(leftBuf);
  if (leftGeo) {
    const leftMesh = new THREE.Mesh(
      leftGeo,
      materials.getMaterial(leftSideInfo.materialId, { worldSpaceUv: true }),
    );
    leftMesh.castShadow = true;
    leftMesh.receiveShadow = true;
    leftMesh.userData = {
      entityType: 'wall',
      entityId: wall.id,
      roomId: leftSideInfo.roomId,
      surfaceRole: leftSideInfo.isExteriorFace ? 'exterior_wall' : 'wall',
      materialId: leftSideInfo.materialId,
    };
    group.add(leftMesh);
  }

  const rightGeo = toBufferGeometry(rightBuf);
  if (rightGeo) {
    const rightMesh = new THREE.Mesh(
      rightGeo,
      materials.getMaterial(rightSideInfo.materialId, { worldSpaceUv: true }),
    );
    rightMesh.castShadow = true;
    rightMesh.receiveShadow = true;
    rightMesh.userData = {
      entityType: 'wall',
      entityId: wall.id,
      roomId: rightSideInfo.roomId,
      surfaceRole: rightSideInfo.isExteriorFace ? 'exterior_wall' : 'wall',
      materialId: rightSideInfo.materialId,
    };
    group.add(rightMesh);
  }

  const trimGeo = toBufferGeometry(trimBuf);
  if (trimGeo) {
    const trimMatId = wall.isExterior ? 'plaster-coastal-white' : leftSideInfo.materialId;
    const trimMesh = new THREE.Mesh(
      trimGeo,
      materials.getMaterial(trimMatId, { worldSpaceUv: true }),
    );
    trimMesh.castShadow = true;
    trimMesh.receiveShadow = true;
    trimMesh.userData = {
      entityType: 'wall',
      entityId: wall.id,
      surfaceRole: 'wall',
      materialId: trimMatId,
    };
    group.add(trimMesh);
  }

  return group;
}
