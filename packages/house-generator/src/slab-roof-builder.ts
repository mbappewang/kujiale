import { degToRad, polygonBounds, polygonCentroid, type Point2D } from '@kujiale/shared';
import type { FloorLevel, PropertyMeta, RoomData, WallData } from '@kujiale/scene-schema';
import type { MaterialSystem } from '@kujiale/materials';
import * as THREE from 'three';

/**
 * Builds an extruded horizontal polygon slab in XZ plane with exact world-space metre UVs (u=x, v=z).
 */
function createHorizontalPolygonGeometry(
  polygon: readonly Point2D[],
  yTop: number,
  thickness: number,
): THREE.BufferGeometry | null {
  if (polygon.length < 3) return null;

  // Triangulate 2D contour in (x, z)
  const contour = polygon.map((p) => new THREE.Vector2(p.x, p.z));
  // Ensure consistent counter-clockwise 2D contour for ShapeUtils.triangulateShape
  let signedArea = 0;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i]!;
    const b = contour[(i + 1) % contour.length]!;
    signedArea += a.x * b.y - b.x * a.y;
  }
  if (signedArea < 0) {
    contour.reverse();
  }

  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  if (triangles.length === 0) return null;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const yBottom = yTop - thickness;

  // Top surface (+Y normal: in right-handed XYZ, CCW in (X, -Z) -> reverse triangle order from 2D XY)
  for (const pt of contour) {
    positions.push(pt.x, yTop, pt.y);
    normals.push(0, 1, 0);
    uvs.push(pt.x, pt.y);
  }
  for (const tri of triangles) {
    // In 2D XY, (v0, v1, v2) has +Z cross product; mapped to (x, 0, z), (e1 x e2).y = -(x1*z2 - z1*x2), so reverse!
    indices.push(tri[0]!, tri[2]!, tri[1]!);
  }

  // Bottom surface (-Y normal, for ceilings viewed from below!)
  const botOffset = contour.length;
  for (const pt of contour) {
    positions.push(pt.x, yBottom, pt.y);
    normals.push(0, -1, 0);
    uvs.push(pt.x, pt.y);
  }
  for (const tri of triangles) {
    indices.push(botOffset + tri[0]!, botOffset + tri[1]!, botOffset + tri[2]!);
  }

  // Perimeter slab edge skirt
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i]!;
    const b = contour[(i + 1) % contour.length]!;
    const dx = b.x - a.x;
    const dz = b.y - a.y;
    const segLen = Math.hypot(dx, dz) || 1;
    // Outward normal for CCW contour in (x, z) where signedArea > 0 is (+dz, -dx)
    const nx = dz / segLen;
    const nz = -dx / segLen;

    const base = positions.length / 3;
    positions.push(a.x, yBottom, a.y, b.x, yBottom, b.y, b.x, yTop, b.y, a.x, yTop, a.y);
    for (let k = 0; k < 4; k++) normals.push(nx, 0, nz);
    uvs.push(0, 0, segLen, 0, segLen, thickness, 0, thickness);
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

export function buildRoomSlabsAndCeilings(
  room: RoomData,
  floor: FloorLevel,
  materials: MaterialSystem,
): { floorMesh: THREE.Mesh | null; ceilingGroup: THREE.Group | null } {
  const yFloorTop = floor.elevation + room.elevationOffset;
  const slabThickness = room.isOutdoor ? 0.14 : floor.slabThickness;
  const floorGeo = createHorizontalPolygonGeometry(room.polygon, yFloorTop, slabThickness);

  let floorMesh: THREE.Mesh | null = null;
  if (floorGeo) {
    floorMesh = new THREE.Mesh(
      floorGeo,
      materials.getMaterial(room.floorMaterialId, { worldSpaceUv: true }),
    );
    floorMesh.name = `floor-${room.id}`;
    floorMesh.receiveShadow = true;
    floorMesh.castShadow = room.isOutdoor;
    floorMesh.userData = {
      entityType: 'room',
      entityId: room.id,
      roomId: room.id,
      surfaceRole: 'floor',
      materialId: room.floorMaterialId,
    };
  }

  // Outdoor patios covered by a louvered pergola skip solid plaster ceiling
  if (room.roomType === 'patio') {
    return { floorMesh, ceilingGroup: null };
  }

  const ceilingGroup = new THREE.Group();
  ceilingGroup.name = `ceiling-${room.id}`;
  const yCeilingBottom = floor.elevation + floor.ceilingHeight;
  const ceilGeo = createHorizontalPolygonGeometry(room.polygon, yCeilingBottom + 0.12, 0.12);
  if (ceilGeo) {
    const ceilMesh = new THREE.Mesh(
      ceilGeo,
      materials.getMaterial(room.ceilingMaterialId, { worldSpaceUv: true }),
    );
    ceilMesh.castShadow = true;
    ceilMesh.receiveShadow = true;
    ceilMesh.userData = {
      entityType: 'ceiling',
      entityId: room.id,
      roomId: room.id,
      surfaceRole: 'ceiling',
    };
    ceilingGroup.add(ceilMesh);

    // Subtle recessed architectural LED downlight trim in indoor rooms
    if (!room.isOutdoor) {
      const center = polygonCentroid(room.polygon);
      const bezel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, 0.015, 16),
        new THREE.MeshStandardMaterial({
          color: 0xfff8ea,
          emissive: 0xffeed0,
          emissiveIntensity: 0.9,
          roughness: 0.3,
        }),
      );
      bezel.position.set(center.x, yCeilingBottom - 0.005, center.z);
      ceilingGroup.add(bezel);
    }

    // Porch posts for covered front porch
    if (room.roomType === 'porch') {
      const bounds = polygonBounds(room.polygon);
      const postMat = materials.getMaterial('metal-monument-matte', { worldSpaceUv: false });
      const postH = yCeilingBottom - yFloorTop;
      for (const px of [bounds.minX + 0.14, bounds.maxX - 0.14]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, postH, 0.14), postMat);
        post.position.set(px, yFloorTop + postH * 0.5, bounds.maxZ - 0.14);
        post.castShadow = true;
        post.receiveShadow = true;
        floorMesh?.add(post);
      }
    }
  }

  return { floorMesh, ceilingGroup };
}

/**
 * Generates a true Australian hipped roof with overhanging eaves & fascia gutters
 * covering the main enclosed building footprint.
 */
export function buildAustralianHipRoof(
  walls: readonly WallData[],
  highestFloor: FloorLevel,
  property: PropertyMeta,
  materials: MaterialSystem,
): THREE.Group {
  const roofGroup = new THREE.Group();
  roofGroup.name = 'RoofAssembly';

  const extPoints: Point2D[] = [];
  for (const w of walls) {
    if (w.isExterior) {
      extPoints.push(w.start, w.end);
    }
  }
  if (extPoints.length < 3) return roofGroup;

  const bounds = polygonBounds(extPoints);
  const eavesOverhang = 0.58;
  const minX = bounds.minX - eavesOverhang;
  const maxX = bounds.maxX + eavesOverhang;
  const minZ = bounds.minZ - eavesOverhang;
  const maxZ = bounds.maxZ + eavesOverhang;

  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const yBase = highestFloor.elevation + highestFloor.ceilingHeight + 0.12;
  const halfShortSpan = Math.min(spanX, spanZ) * 0.5;
  const pitchRad = degToRad(Math.max(12, Math.min(35, property.roofPitchDegrees)));
  const ridgeHeight = Math.min(3.4, halfShortSpan * Math.tan(pitchRad));
  const yRidge = yBase + ridgeHeight;

  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;

  // Ridge runs along the longer axis
  const ridgeAlongZ = spanZ >= spanX;
  const ridgeHalfLen = Math.max(0.4, Math.abs(spanZ - spanX) * 0.5);

  const rA: [number, number, number] = ridgeAlongZ
    ? [cx, yRidge, cz - ridgeHalfLen]
    : [cx - ridgeHalfLen, yRidge, cz];
  const rB: [number, number, number] = ridgeAlongZ
    ? [cx, yRidge, cz + ridgeHalfLen]
    : [cx + ridgeHalfLen, yRidge, cz];

  const cNW: [number, number, number] = [minX, yBase, minZ];
  const cNE: [number, number, number] = [maxX, yBase, minZ];
  const cSE: [number, number, number] = [maxX, yBase, maxZ];
  const cSW: [number, number, number] = [minX, yBase, maxZ];

  const positions: number[] = [];
  const uvs: number[] = [];

  const pushTri = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
  ) => {
    positions.push(...p0, ...p1, ...p2);
    // Project roof UVs cleanly along horizontal run & slope height
    uvs.push(p0[0] + p0[2], p0[1] * 2.2, p1[0] + p1[2], p1[1] * 2.2, p2[0] + p2[2], p2[1] * 2.2);
  };

  if (ridgeAlongZ) {
    // North hip triangle (cNE -> cNW -> rA -> outward normal -Z/+Y)
    pushTri(cNE, cNW, rA);
    // South hip triangle (cSW -> cSE -> rB -> outward normal +Z/+Y)
    pushTri(cSW, cSE, rB);
    // West trapezoid (cNW -> cSW -> rB & cNW -> rB -> rA -> outward normal -X/+Y)
    pushTri(cNW, cSW, rB);
    pushTri(cNW, rB, rA);
    // East trapezoid (cSE -> cNE -> rA & cSE -> rA -> rB -> outward normal +X/+Y)
    pushTri(cSE, cNE, rA);
    pushTri(cSE, rA, rB);
  } else {
    // West hip triangle
    pushTri(cNW, cSW, rA);
    // East hip triangle
    pushTri(cSE, cNE, rB);
    // North trapezoid
    pushTri(cNE, cNW, rA);
    pushTri(cNE, rA, rB);
    // South trapezoid
    pushTri(cSW, cSE, rB);
    pushTri(cSW, rB, rA);
  }

  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  roofGeo.computeVertexNormals();

  const roofMesh = new THREE.Mesh(
    roofGeo,
    materials.getMaterial(property.roofMaterialId, { worldSpaceUv: true, doubleSide: true }),
  );
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  roofMesh.userData = {
    entityType: 'roof',
    entityId: 'main-roof',
    surfaceRole: 'roof',
    materialId: property.roofMaterialId,
  };
  roofGroup.add(roofMesh);

  // Eaves soffit + Monument fascia gutter perimeter
  const fasciaMat = materials.getMaterial('metal-monument-matte', { worldSpaceUv: false });
  const soffitMat = materials.getMaterial('paint-crisp-white', { worldSpaceUv: true });

  const soffitGeo = createHorizontalPolygonGeometry(
    [
      { x: minX, z: minZ },
      { x: maxX, z: minZ },
      { x: maxX, z: maxZ },
      { x: minX, z: maxZ },
    ],
    yBase,
    0.08,
  );
  if (soffitGeo) {
    const soffitMesh = new THREE.Mesh(soffitGeo, soffitMat);
    soffitMesh.castShadow = true;
    soffitMesh.receiveShadow = true;
    roofGroup.add(soffitMesh);
  }

  const gutterH = 0.16;
  const gutterThick = 0.06;
  const nBar = new THREE.Mesh(new THREE.BoxGeometry(spanX, gutterH, gutterThick), fasciaMat);
  nBar.position.set(cx, yBase - 0.02, minZ);
  const sBar = new THREE.Mesh(new THREE.BoxGeometry(spanX, gutterH, gutterThick), fasciaMat);
  sBar.position.set(cx, yBase - 0.02, maxZ);
  const wBar = new THREE.Mesh(new THREE.BoxGeometry(gutterThick, gutterH, spanZ), fasciaMat);
  wBar.position.set(minX, yBase - 0.02, cz);
  const eBar = new THREE.Mesh(new THREE.BoxGeometry(gutterThick, gutterH, spanZ), fasciaMat);
  eBar.position.set(maxX, yBase - 0.02, cz);
  roofGroup.add(nBar, sBar, wBar, eBar);

  return roofGroup;
}

/**
 * Procedural staircase builder for double-storey residences or dedicated staircase zones.
 */
export function buildStaircaseAssembly(
  room: RoomData,
  floor: FloorLevel,
  materials: MaterialSystem,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `staircase-${room.id}`;

  const bounds = polygonBounds(room.polygon);
  const totalRise = floor.ceilingHeight + floor.slabThickness;
  const stepCount = Math.max(12, Math.round(totalRise / 0.175));
  const stepRise = totalRise / stepCount;
  const runLength = Math.max(2.4, bounds.depth - 0.6);
  const stepRun = runLength / stepCount;
  const stairWidth = Math.min(1.1, Math.max(0.85, bounds.width * 0.5));

  const treadMat = materials.getMaterial('timber-spotted-gum', { worldSpaceUv: false });
  const stringerMat = materials.getMaterial('metal-monument-matte', { worldSpaceUv: false });
  const glassMat = materials.getMaterial('glass-architectural-clear');

  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const startZ = bounds.minZ + 0.3;

  for (let i = 0; i < stepCount; i++) {
    const tread = new THREE.Mesh(
      new THREE.BoxGeometry(stairWidth, 0.045, stepRun + 0.025),
      treadMat,
    );
    tread.position.set(
      centerX,
      floor.elevation + (i + 1) * stepRise,
      startZ + i * stepRun + stepRun * 0.5,
    );
    tread.castShadow = true;
    tread.receiveShadow = true;
    group.add(tread);
  }

  const diagLen = Math.hypot(runLength, totalRise);
  const pitchAngle = Math.atan2(totalRise, runLength);
  for (const side of [-1, 1]) {
    const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, diagLen), stringerMat);
    stringer.position.set(
      centerX + side * (stairWidth * 0.5 + 0.025),
      floor.elevation + totalRise * 0.5 - 0.08,
      startZ + runLength * 0.5,
    );
    stringer.rotation.x = -pitchAngle;
    group.add(stringer);
  }

  const balustrade = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.95, diagLen), glassMat);
  balustrade.position.set(
    centerX + stairWidth * 0.5 + 0.03,
    floor.elevation + totalRise * 0.5 + 0.48,
    startZ + runLength * 0.5,
  );
  balustrade.rotation.x = -pitchAngle;
  group.add(balustrade);

  return group;
}
