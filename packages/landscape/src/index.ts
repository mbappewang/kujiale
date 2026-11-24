import { distance2D, pointInPolygon, polygonBounds, wallDirection, type Point2D } from '@kujiale/shared';
import type { LandscapeElementData, RoomData, SceneData } from '@kujiale/scene-schema';
import type { MaterialSystem } from '@kujiale/materials';
import * as THREE from 'three';

export interface LandscapeQualityOptions {
  vegetationDensityMultiplier: number; // 0.25 (Low) .. 1.0 (High/Ultra)
  enableLod: boolean;
}

function buildFlatGroundPolygon(
  polygon: readonly Point2D[],
  yTop: number,
  thickness: number,
  material: THREE.Material,
): THREE.Mesh | null {
  if (polygon.length < 3) return null;
  const bounds = polygonBounds(polygon);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(bounds.width, thickness, bounds.depth),
    material,
  );
  // Apply world-space metre UVs to top/bottom faces of BoxGeometry
  const uv = mesh.geometry.getAttribute('uv');
  const pos = mesh.geometry.getAttribute('position');
  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cz = (bounds.minZ + bounds.maxZ) * 0.5;
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + cx;
    const wy = pos.getY(i);
    const wz = pos.getZ(i) + cz;
    if (Math.abs(wy) >= thickness * 0.49) {
      uv.setXY(i, wx, wz);
    } else {
      uv.setXY(i, wx + wz, wy);
    }
  }
  uv.needsUpdate = true;
  mesh.position.set(cx, yTop - thickness * 0.5, cz);
  mesh.receiveShadow = true;
  return mesh;
}

function buildPergola(
  el: LandscapeElementData,
  materials: MaterialSystem,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `pergola-${el.id}`;
  if (!el.polygon || el.polygon.length < 3) return group;

  const bounds = polygonBounds(el.polygon);
  const height = el.height ?? 2.75;
  const timberMat = materials.getMaterial(el.materialId ?? 'timber-spotted-gum', { worldSpaceUv: false });
  const bracketMat = materials.getMaterial('metal-monument-matte', { worldSpaceUv: false });

  // Outer corner posts (on North patio edge; South side attaches cleanly to house fascia)
  const postSize = 0.13;
  for (const px of [bounds.minX + 0.12, (bounds.minX + bounds.maxX) * 0.5, bounds.maxX - 0.12]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(postSize, height, postSize), timberMat);
    post.position.set(px, height * 0.5 + 0.1, bounds.minZ + 0.14);
    post.castShadow = true;
    post.receiveShadow = true;
    group.add(post);

    const stirrup = new THREE.Mesh(new THREE.BoxGeometry(postSize + 0.03, 0.12, postSize + 0.03), bracketMat);
    stirrup.position.set(px, 0.16, bounds.minZ + 0.14);
    group.add(stirrup);
  }

  // Perimeter beams
  const beamH = 0.18;
  const frontBeam = new THREE.Mesh(new THREE.BoxGeometry(bounds.width, beamH, 0.1), timberMat);
  frontBeam.position.set((bounds.minX + bounds.maxX) * 0.5, height + 0.1, bounds.minZ + 0.14);
  frontBeam.castShadow = true;
  group.add(frontBeam);

  for (const sideX of [bounds.minX + 0.08, bounds.maxX - 0.08]) {
    const sideBeam = new THREE.Mesh(new THREE.BoxGeometry(0.09, beamH, bounds.depth), timberMat);
    sideBeam.position.set(sideX, height + 0.1, (bounds.minZ + bounds.maxZ) * 0.5);
    sideBeam.castShadow = true;
    group.add(sideBeam);
  }

  // Architectural sun-shading timber louvers (cast iconic striped Australian alfresco shadows!)
  const louverCount = Math.max(8, Math.floor(bounds.depth / 0.28));
  for (let i = 0; i < louverCount; i++) {
    const z = bounds.minZ + 0.25 + (i / louverCount) * (bounds.depth - 0.4);
    const batten = new THREE.Mesh(
      new THREE.BoxGeometry(bounds.width - 0.16, 0.09, 0.045),
      timberMat,
    );
    batten.position.set((bounds.minX + bounds.maxX) * 0.5, height + 0.18, z);
    batten.rotation.x = 0.22;
    batten.castShadow = true;
    batten.receiveShadow = true;
    group.add(batten);
  }

  return group;
}

function buildSwimmingPool(
  el: LandscapeElementData,
  materials: MaterialSystem,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `pool-${el.id}`;
  if (!el.polygon || el.polygon.length < 3) return group;

  const bounds = polygonBounds(el.polygon);
  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cz = (bounds.minZ + bounds.maxZ) * 0.5;

  const copingMat = materials.getMaterial(el.materialId ?? 'marble-travertine', { worldSpaceUv: true });
  const glassMat = materials.getMaterial('glass-architectural-clear');
  const spigotMat = materials.getMaterial('metal-brushed-nickel', { worldSpaceUv: false });

  // Travertine coping border (4 edges around water)
  const copingW = 0.38;
  const copingH = 0.08;
  const northCoping = new THREE.Mesh(
    new THREE.BoxGeometry(bounds.width + copingW * 2, copingH, copingW),
    copingMat,
  );
  northCoping.position.set(cx, copingH * 0.5, bounds.minZ - copingW * 0.5);
  const southCoping = new THREE.Mesh(
    new THREE.BoxGeometry(bounds.width + copingW * 2, copingH, copingW),
    copingMat,
  );
  southCoping.position.set(cx, copingH * 0.5, bounds.maxZ + copingW * 0.5);
  const westCoping = new THREE.Mesh(new THREE.BoxGeometry(copingW, copingH, bounds.depth), copingMat);
  westCoping.position.set(bounds.minX - copingW * 0.5, copingH * 0.5, cz);
  const eastCoping = new THREE.Mesh(new THREE.BoxGeometry(copingW, copingH, bounds.depth), copingMat);
  eastCoping.position.set(bounds.maxX + copingW * 0.5, copingH * 0.5, cz);
  group.add(northCoping, southCoping, westCoping, eastCoping);

  // Turquoise sunlit Australian pool basin + shimmering physical water surface
  const basinMat = new THREE.MeshStandardMaterial({
    color: 0x1b7c96,
    roughness: 0.35,
    metalness: 0.05,
  });
  const basin = new THREE.Mesh(new THREE.BoxGeometry(bounds.width, 0.04, bounds.depth), basinMat);
  basin.position.set(cx, -0.18, cz);
  basin.receiveShadow = true;
  group.add(basin);

  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x3ec6df,
    roughness: 0.06,
    metalness: 0.05,
    transmission: 0.72,
    transparent: true,
    opacity: 0.82,
    ior: 1.333,
    envMapIntensity: 1.65,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(bounds.width, bounds.depth), waterMat);
  water.rotation.x = -Math.PI * 0.5;
  water.position.set(cx, 0.04, cz);
  group.add(water);

  // Australian compliant frameless glass pool fence along West & South house-facing edges
  const fenceH = 1.2;
  const southGlass = new THREE.Mesh(
    new THREE.BoxGeometry(bounds.width + 0.6, fenceH, 0.016),
    glassMat,
  );
  southGlass.position.set(cx, fenceH * 0.5 + 0.06, bounds.maxZ + 0.45);
  const westGlass = new THREE.Mesh(
    new THREE.BoxGeometry(0.016, fenceH, bounds.depth + 0.6),
    glassMat,
  );
  westGlass.position.set(bounds.minX - 0.45, fenceH * 0.5 + 0.06, cz);
  group.add(southGlass, westGlass);

  // Stainless steel mini-post spigots
  for (let sx = bounds.minX; sx <= bounds.maxX; sx += 1.35) {
    const spigot = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.045), spigotMat);
    spigot.position.set(sx, 0.12, bounds.maxZ + 0.45);
    group.add(spigot);
  }

  return group;
}

function buildBoundaryFence(
  el: LandscapeElementData,
  materials: MaterialSystem,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `fence-${el.id}`;
  const pts = el.polygon;
  if (!pts || pts.length < 2) return group;

  const h = el.height ?? 1.85;
  const panelMat = materials.getMaterial(el.materialId ?? 'metal-monument-matte', { worldSpaceUv: true });
  const postMat = materials.getMaterial('metal-monument-matte', { worldSpaceUv: false });

  // Open polyline along pts[0]->pts[1]->...->pts[n-1] (leaves front street frontage open!)
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = distance2D(a, b);
    if (len < 0.2) continue;
    const dir = wallDirection(a, b);
    const yaw = -Math.atan2(dir.z, dir.x);

    const panel = new THREE.Mesh(new THREE.BoxGeometry(len, h, 0.05), panelMat);
    panel.position.set((a.x + b.x) * 0.5, h * 0.5, (a.z + b.z) * 0.5);
    panel.rotation.y = yaw;
    panel.castShadow = true;
    panel.receiveShadow = true;
    group.add(panel);

    const postCount = Math.max(2, Math.ceil(len / 2.4));
    for (let p = 0; p <= postCount; p++) {
      const t = p / postCount;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.085, h + 0.06, 0.085), postMat);
      post.position.set(a.x + (b.x - a.x) * t, (h + 0.06) * 0.5, a.z + (b.z - a.z) * t);
      post.castShadow = true;
      group.add(post);
    }
  }

  return group;
}

function buildEucalyptusTreeLod(
  el: LandscapeElementData,
  enableLod: boolean,
): THREE.Object3D {
  const pos = el.position ?? { x: 0, z: 0 };
  const scale = el.scale ?? 1.0;

  const barkMat = new THREE.MeshStandardMaterial({
    color: 0xcbc4b8, // Smooth pale grey-cream Australian Ghost/Lemon-Scented Gum bark
    roughness: 0.78,
  });
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x5c7a58, // Authentic silvery-sage Australian eucalyptus foliage
    roughness: 0.85,
  });

  const createTreeDetail = (segments: number, canopyClusters: number): THREE.Group => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13 * scale, 0.22 * scale, 3.4 * scale, segments),
      barkMat,
    );
    trunk.position.y = 1.7 * scale;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    g.add(trunk);

    const offsets: Array<[number, number, number, number]> = [
      [0, 3.8, 0, 1.35],
      [-0.85, 3.35, 0.45, 1.0],
      [0.82, 3.45, -0.4, 1.05],
      [0.2, 4.45, 0.35, 0.95],
    ];
    for (let i = 0; i < Math.min(canopyClusters, offsets.length); i++) {
      const [ox, oy, oz, rad] = offsets[i]!;
      const crown = new THREE.Mesh(
        new THREE.IcosahedronGeometry(rad * scale, segments > 6 ? 1 : 0),
        canopyMat,
      );
      crown.scale.set(1.15, 0.78, 1.15);
      crown.position.set(ox * scale, oy * scale, oz * scale);
      crown.castShadow = true;
      crown.receiveShadow = true;
      g.add(crown);
    }
    return g;
  };

  if (!enableLod) {
    const high = createTreeDetail(8, 4);
    high.position.set(pos.x, 0, pos.z);
    high.rotation.y = el.rotationY ?? 0;
    return high;
  }

  const lod = new THREE.LOD();
  lod.addLevel(createTreeDetail(10, 4), 0);
  lod.addLevel(createTreeDetail(5, 2), 26);
  lod.position.set(pos.x, 0, pos.z);
  lod.rotation.y = el.rotationY ?? 0;
  return lod;
}

/**
 * Generates an InstancedMesh of native Australian grass tufts & Kangaroo Paw shrubs
 * across open lawn zones (strictly 1 GPU draw call for hundreds of tufts!).
 */
function buildInstancedLawnTufts(
  lawnBounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  excludedPolygons: ReadonlyArray<readonly Point2D[]>,
  shrubElements: readonly LandscapeElementData[],
  densityMultiplier: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'InstancedFloraGroup';

  const maxCount = Math.max(24, Math.floor(220 * densityMultiplier));
  const tuftGeo = new THREE.ConeGeometry(0.11, 0.24, 5);
  tuftGeo.translate(0, 0.12, 0);
  const tuftMat = new THREE.MeshStandardMaterial({
    color: 0x54783d,
    roughness: 0.88,
  });

  const validTransforms: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();

  // Deterministic Halton-like scatter across yard, skipping house footprint, driveway, footpath & pool
  for (let i = 0; i < maxCount * 2 && validTransforms.length < maxCount; i++) {
    const hx = ((i * 0.61803398875) % 1);
    const hz = ((i * 0.38196601125 + 0.17) % 1);
    const px = lawnBounds.minX + 0.8 + hx * (lawnBounds.maxX - lawnBounds.minX - 1.6);
    const pz = lawnBounds.minZ + 0.8 + hz * (lawnBounds.maxZ - lawnBounds.minZ - 1.6);
    const pt = { x: px, z: pz };

    const insideExcluded = excludedPolygons.some((poly) => pointInPolygon(pt, poly));
    if (insideExcluded) continue;

    const s = 0.65 + ((i * 17) % 7) * 0.1;
    dummy.position.set(px, 0, pz);
    dummy.rotation.set(0, (i * 1.7) % (Math.PI * 2), 0);
    dummy.scale.set(s, s * 0.7, s);
    dummy.updateMatrix();
    validTransforms.push(dummy.matrix.clone());
  }

  if (validTransforms.length > 0) {
    const instancedTufts = new THREE.InstancedMesh(tuftGeo, tuftMat, validTransforms.length);
    instancedTufts.name = 'InstancedLawnTufts';
    instancedTufts.frustumCulled = true;
    instancedTufts.receiveShadow = true;
    for (let idx = 0; idx < validTransforms.length; idx++) {
      instancedTufts.setMatrixAt(idx, validTransforms[idx]!);
    }
    instancedTufts.instanceMatrix.needsUpdate = true;
    group.add(instancedTufts);
  }

  // Instanced native Lomandra & Kangaroo Paw border shrubs
  if (shrubElements.length > 0) {
    const clustersPerShrub = 5;
    const totalShrubClusters = shrubElements.length * clustersPerShrub;
    const shrubGeo = new THREE.DodecahedronGeometry(0.36, 0);
    shrubGeo.translate(0, 0.26, 0);
    const shrubMat = new THREE.MeshStandardMaterial({
      color: 0x4b6e3c,
      roughness: 0.85,
    });
    const instancedShrubs = new THREE.InstancedMesh(shrubGeo, shrubMat, totalShrubClusters);
    instancedShrubs.name = 'InstancedNativeShrubs';
    instancedShrubs.castShadow = true;
    instancedShrubs.receiveShadow = true;

    let cursor = 0;
    for (const shrub of shrubElements) {
      const basePos = shrub.position ?? { x: 0, z: 0 };
      const sc = shrub.scale ?? 1;
      for (let k = 0; k < clustersPerShrub; k++) {
        const offsetX = (k - (clustersPerShrub - 1) * 0.5) * 0.58;
        const offsetZ = ((k % 2) - 0.5) * 0.25;
        dummy.position.set(basePos.x + offsetX, 0, basePos.z + offsetZ);
        dummy.rotation.set(0, k * 1.1 + shrub.rotationY, 0);
        dummy.scale.set(sc * (0.85 + (k % 3) * 0.15), sc * 0.8, sc);
        dummy.updateMatrix();
        instancedShrubs.setMatrixAt(cursor++, dummy.matrix);
      }
    }
    instancedShrubs.instanceMatrix.needsUpdate = true;
    group.add(instancedShrubs);
  }

  return group;
}

export function generateLandscape3D(
  sceneData: SceneData,
  materials: MaterialSystem,
  quality: LandscapeQualityOptions = { vegetationDensityMultiplier: 1.0, enableLod: true },
): THREE.Group {
  const root = new THREE.Group();
  root.name = 'LandscapeRoot';

  // Suburban Australian neighbourhood ground horizon disc (blends cleanly with atmospheric fog)
  const surroundMat = new THREE.MeshStandardMaterial({
    color: 0xaab09e,
    roughness: 0.96,
  });
  const surroundPlane = new THREE.Mesh(new THREE.CircleGeometry(94, 48), surroundMat);
  surroundPlane.rotation.x = -Math.PI * 0.5;
  surroundPlane.position.y = -0.06;
  surroundPlane.receiveShadow = true;
  root.add(surroundPlane);

  // Street frontage road & nature strip at +Z (South street side)
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x4b4f54, roughness: 0.88 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(90, 7.0), roadMat);
  road.rotation.x = -Math.PI * 0.5;
  road.position.set(0, -0.02, 18.5);
  road.receiveShadow = true;
  root.add(road);

  const excludedForGrass: Array<readonly Point2D[]> = sceneData.rooms.map((r: RoomData) => r.polygon);
  let lawnBounds = { minX: -11, maxX: 11, minZ: -15, maxZ: 15 };
  const shrubElements: LandscapeElementData[] = [];

  for (const el of sceneData.landscape) {
    switch (el.type) {
      case 'lawn': {
        if (el.polygon) {
          lawnBounds = polygonBounds(el.polygon);
          const mesh = buildFlatGroundPolygon(
            el.polygon,
            0.0,
            0.06,
            materials.getMaterial(el.materialId ?? 'grass-buffalo-lawn', { worldSpaceUv: true }),
          );
          if (mesh) {
            mesh.name = `lawn-${el.id}`;
            root.add(mesh);
          }
        }
        break;
      }
      case 'driveway':
      case 'footpath': {
        if (el.polygon) {
          excludedForGrass.push(el.polygon);
          const yTop = el.type === 'driveway' ? 0.025 : 0.03;
          const mesh = buildFlatGroundPolygon(
            el.polygon,
            yTop,
            0.06,
            materials.getMaterial(
              el.materialId ??
                (el.type === 'driveway' ? 'concrete-driveway-aggregate' : 'marble-travertine'),
              { worldSpaceUv: true },
            ),
          );
          if (mesh) {
            mesh.name = `${el.type}-${el.id}`;
            root.add(mesh);
          }
        }
        break;
      }
      case 'pergola': {
        root.add(buildPergola(el, materials));
        break;
      }
      case 'swimming_pool': {
        if (el.polygon) excludedForGrass.push(el.polygon);
        root.add(buildSwimmingPool(el, materials));
        break;
      }
      case 'fence': {
        root.add(buildBoundaryFence(el, materials));
        break;
      }
      case 'tree_eucalyptus': {
        root.add(buildEucalyptusTreeLod(el, quality.enableLod));
        break;
      }
      case 'shrub_native': {
        shrubElements.push(el);
        break;
      }
      default:
        break;
    }
  }

  root.add(
    buildInstancedLawnTufts(
      lawnBounds,
      excludedForGrass,
      shrubElements,
      quality.vegetationDensityMultiplier,
    ),
  );

  return root;
}
