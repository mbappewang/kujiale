import type { AssetManager } from '@kujiale/asset-manager';
import type { MaterialSystem } from '@kujiale/materials';
import type { LandscapeElementData, SceneData } from '@kujiale/scene-schema';
import { distance2D, polygonBounds, wallDirection, type Point2D } from '@kujiale/shared';
import * as THREE from 'three';

export interface LandscapeQualityOptions {
  vegetationDensityMultiplier: number;
  enableLod: boolean;
}

let cachedEucalyptusLeafTex: THREE.DataTexture | null = null;
let cachedWaterNormalTex: THREE.DataTexture | null = null;

/**
 * Synthesizes an alpha-tested RGBA botanical sprig of lanceolate Australian Eucalyptus leaves.
 */
function getEucalyptusLeafClusterTexture(): THREE.DataTexture {
  if (cachedEucalyptusLeafTex) return cachedEucalyptusLeafTex;
  const size = 256;
  const bytes = new Uint8Array(size * size * 4);

  // Branch stems + 18 angled lanceolate leaves around central twig
  const leaves: Array<{ cx: number; cy: number; angle: number; len: number; wid: number; tone: number }> = [];
  for (let i = 0; i < 18; i++) {
    const t = 0.14 + (i / 18) * 0.78;
    const side = i % 2 === 0 ? 1 : -1;
    const baseAngle = side * (0.45 + ((i * 7) % 5) * 0.12) - 0.15;
    const cx = 0.5 + Math.sin(t * 2.5) * 0.04 + side * 0.14;
    const cy = t;
    leaves.push({
      cx,
      cy,
      angle: baseAngle,
      len: 0.19 + ((i * 3) % 4) * 0.025,
      wid: 0.038 + ((i * 5) % 3) * 0.007,
      tone: ((i * 11) % 7) / 7,
    });
  }

  for (let py = 0; py < size; py++) {
    const v = py / size;
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const p4 = (py * size + px) * 4;

      // Central woody twig
      const stemX = 0.5 + Math.sin(v * 2.5) * 0.04;
      if (v > 0.05 && v < 0.92 && Math.abs(u - stemX) < 0.011 * (1.2 - v * 0.6)) {
        bytes[p4] = 112;
        bytes[p4 + 1] = 98;
        bytes[p4 + 2] = 82;
        bytes[p4 + 3] = 255;
        continue;
      }

      let hitLeaf = false;
      for (const lf of leaves) {
        const dx = u - lf.cx;
        const dy = v - lf.cy;
        const cos = Math.cos(-lf.angle);
        const sin = Math.sin(-lf.angle);
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;
        // Lanceolate leaf equation: tapered at both petiole and tip
        const normAlong = ly / lf.len + 0.5;
        if (normAlong >= 0 && normAlong <= 1) {
          const envelope = Math.sin(Math.pow(normAlong, 0.82) * Math.PI) * lf.wid;
          if (Math.abs(lx) <= envelope) {
            const midrib = Math.abs(lx) < 0.004 ? 14 : 0;
            const shade = 0.82 + lf.tone * 0.28 + normAlong * 0.12;
            bytes[p4] = Math.min(255, Math.round(82 * shade + midrib));
            bytes[p4 + 1] = Math.min(255, Math.round(114 * shade + midrib));
            bytes[p4 + 2] = Math.min(255, Math.round(78 * shade));
            bytes[p4 + 3] = 255;
            hitLeaf = true;
            break;
          }
        }
      }

      if (!hitLeaf) {
        bytes[p4] = 78;
        bytes[p4 + 1] = 108;
        bytes[p4 + 2] = 74;
        bytes[p4 + 3] = 0;
      }
    }
  }

  const tex = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  cachedEucalyptusLeafTex = tex;
  return tex;
}

function getPoolWaterNormalTexture(): THREE.DataTexture {
  if (cachedWaterNormalTex) return cachedWaterNormalTex;
  const size = 128;
  const bytes = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = (y / size) * Math.PI * 2;
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const nx = Math.cos(u * 4 + Math.sin(v * 3)) * 0.18 + Math.cos(u * 9 - v * 7) * 0.09;
      const ny = Math.sin(v * 5 + Math.cos(u * 3)) * 0.18 + Math.sin(v * 8 + u * 6) * 0.09;
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      const p4 = (y * size + x) * 4;
      bytes[p4] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      bytes[p4 + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      bytes[p4 + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      bytes[p4 + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 4);
  tex.needsUpdate = true;
  cachedWaterNormalTex = tex;
  return tex;
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

  const postSize = 0.135;
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

  const beamH = 0.19;
  const frontBeam = new THREE.Mesh(new THREE.BoxGeometry(bounds.width, beamH, 0.11), timberMat);
  frontBeam.position.set((bounds.minX + bounds.maxX) * 0.5, height + 0.1, bounds.minZ + 0.14);
  frontBeam.castShadow = true;
  group.add(frontBeam);

  for (const sideX of [bounds.minX + 0.08, bounds.maxX - 0.08]) {
    const sideBeam = new THREE.Mesh(new THREE.BoxGeometry(0.095, beamH, bounds.depth), timberMat);
    sideBeam.position.set(sideX, height + 0.1, (bounds.minZ + bounds.maxZ) * 0.5);
    sideBeam.castShadow = true;
    group.add(sideBeam);
  }

  const louverCount = Math.max(8, Math.floor(bounds.depth / 0.27));
  for (let i = 0; i < louverCount; i++) {
    const z = bounds.minZ + 0.25 + (i / louverCount) * (bounds.depth - 0.4);
    const batten = new THREE.Mesh(
      new THREE.BoxGeometry(bounds.width - 0.16, 0.095, 0.045),
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

  const copingW = 0.4;
  const copingH = 0.085;
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
  for (const c of [northCoping, southCoping, westCoping, eastCoping]) {
    c.receiveShadow = true;
    c.castShadow = true;
  }
  group.add(northCoping, southCoping, westCoping, eastCoping);

  const basinMat = new THREE.MeshStandardMaterial({
    color: 0x166d86,
    roughness: 0.28,
    metalness: 0.05,
  });
  const basin = new THREE.Mesh(new THREE.BoxGeometry(bounds.width, 0.04, bounds.depth), basinMat);
  basin.position.set(cx, -0.22, cz);
  basin.receiveShadow = true;
  group.add(basin);

  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x4ad2ea,
    normalMap: getPoolWaterNormalTexture(),
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.04,
    metalness: 0.04,
    transmission: 0.78,
    transparent: true,
    opacity: 0.85,
    ior: 1.333,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    envMapIntensity: 2.2,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(bounds.width, bounds.depth), waterMat);
  water.rotation.x = -Math.PI * 0.5;
  water.position.set(cx, 0.045, cz);
  group.add(water);

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
  const panelMat = materials.getMaterial('roof-colorbond-monument', { worldSpaceUv: true });
  const postMat = materials.getMaterial('metal-monument-matte', { worldSpaceUv: false });

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

    // Top capping rail
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.055, 0.075), postMat);
    rail.position.set((a.x + b.x) * 0.5, h + 0.02, (a.z + b.z) * 0.5);
    rail.rotation.y = yaw;
    group.add(rail);

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

/**
 * Builds an authentic multi-branching Australian Ghost Gum / Eucalyptus tree using curved
 * CatmullRom trunk/bough tubes + alpha-tested botanical eucalyptus leaf-sprig cards!
 */
function buildBotanicalEucalyptusTree(
  el: LandscapeElementData,
  enableLod: boolean,
): THREE.Object3D {
  const pos = el.position ?? { x: 0, z: 0 };
  const scale = el.scale ?? 1.0;

  const barkMat = new THREE.MeshStandardMaterial({
    color: 0xd4cdc0,
    roughness: 0.82,
  });
  const leafTex = getEucalyptusLeafClusterTexture();
  const leafMat = new THREE.MeshStandardMaterial({
    map: leafTex,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 0.72,
    metalness: 0.0,
  });

  const createTreeDetail = (foliageCards: number): THREE.Group => {
    const g = new THREE.Group();

    // Organic curved main trunk + 3 diverging boughs
    const branches: Array<{ pts: Array<[number, number, number]>; r: number }> = [
      {
        pts: [
          [0, 0, 0],
          [0.08, 1.3, -0.05],
          [-0.06, 2.6, 0.08],
          [0.12, 3.85, 0.04],
        ],
        r: 0.14,
      },
      {
        pts: [
          [0.02, 2.1, 0.02],
          [-0.55, 2.9, 0.35],
          [-1.05, 3.55, 0.58],
        ],
        r: 0.075,
      },
      {
        pts: [
          [-0.02, 2.35, 0.05],
          [0.62, 3.1, -0.38],
          [1.12, 3.7, -0.62],
        ],
        r: 0.072,
      },
      {
        pts: [
          [0.05, 2.75, 0.04],
          [0.15, 3.5, 0.65],
          [0.25, 4.15, 1.02],
        ],
        r: 0.065,
      },
    ];

    for (const br of branches) {
      const curve = new THREE.CatmullRomCurve3(
        br.pts.map(([x, y, z]) => new THREE.Vector3(x * scale, y * scale, z * scale)),
      );
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, br.r * scale, 8, false), barkMat);
      tube.castShadow = true;
      tube.receiveShadow = true;
      g.add(tube);
    }

    // Multi-layered crossed eucalyptus leaf-sprig cards around the bough tips
    const cardGeo = new THREE.PlaneGeometry(1.15 * scale, 1.15 * scale);
    const crownCenters: Array<[number, number, number, number]> = [
      [0.1, 4.1, 0.05, 1.1],
      [-1.05, 3.65, 0.58, 0.95],
      [1.12, 3.8, -0.6, 0.95],
      [0.25, 4.25, 0.98, 0.88],
      [-0.35, 4.55, -0.35, 0.85],
    ];

    for (let i = 0; i < foliageCards; i++) {
      const [cx, cy, cz, spread] = crownCenters[i % crownCenters.length]!;
      const goldenAngle = i * 2.39996;
      const rad = ((i % 7) / 7) * spread * 0.72;
      const ox = Math.cos(goldenAngle) * rad;
      const oz = Math.sin(goldenAngle) * rad;
      const oy = (((i * 3) % 5) / 5 - 0.45) * spread * 0.65;

      const card = new THREE.Mesh(cardGeo, leafMat);
      card.position.set((cx + ox) * scale, (cy + oy) * scale, (cz + oz) * scale);
      card.rotation.set(
        ((i * 5) % 7) * 0.22 - 0.55,
        goldenAngle,
        ((i * 3) % 5) * 0.18 - 0.35,
      );
      card.castShadow = true;
      card.receiveShadow = true;
      g.add(card);
    }

    return g;
  };

  if (!enableLod) {
    const full = createTreeDetail(50);
    full.position.set(pos.x, 0, pos.z);
    full.rotation.y = el.rotationY ?? 0;
    return full;
  }

  const lod = new THREE.LOD();
  lod.addLevel(createTreeDetail(52), 0);
  lod.addLevel(createTreeDetail(24), 28);
  lod.position.set(pos.x, 0, pos.z);
  lod.rotation.y = el.rotationY ?? 0;
  return lod;
}

function buildGardenFlora(
  shrubElements: readonly LandscapeElementData[],
  assetManager?: AssetManager,
  abortSignal?: AbortSignal,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'NativeFloraGroup';
  if (shrubElements.length === 0) return group;

  const leafMat = new THREE.MeshStandardMaterial({
    map: getEucalyptusLeafClusterTexture(),
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 0.78,
  });

  for (const shrub of shrubElements) {
    const holder = new THREE.Group();
    const pos = shrub.position ?? { x: 0, z: 0 };
    const sc = shrub.scale ?? 1;
    holder.position.set(pos.x, 0, pos.z);
    holder.rotation.y = shrub.rotationY ?? 0;

    // Immediate crossed botanical foliage cards fallback (zero ugly spheres!)
    const fallback = new THREE.Group();
    const cardGeo = new THREE.PlaneGeometry(0.75 * sc, 0.65 * sc);
    for (let k = 0; k < 7; k++) {
      const card = new THREE.Mesh(cardGeo, leafMat);
      card.position.set((k - 3) * 0.38, 0.32 * sc, ((k % 2) - 0.5) * 0.22);
      card.rotation.y = k * 0.9;
      card.rotation.x = 0.2;
      card.castShadow = true;
      fallback.add(card);
    }
    holder.add(fallback);
    group.add(holder);

    // Upgrade asynchronously with real CC0 botanical fern_02.glb & shrub_03.glb!
    if (assetManager) {
      Promise.all([
        assetManager.loadGlbModel('/models/fern_02.glb', abortSignal),
        assetManager.loadGlbModel('/models/shrub_03.glb', abortSignal),
      ])
        .then(([fernGlb, shrubGlb]) => {
          if (abortSignal?.aborted || !holder.parent) return;
          holder.remove(fallback);
          cardGeo.dispose();
          for (let k = 0; k < 5; k++) {
            const clone = (k % 2 === 0 ? fernGlb : shrubGlb).clone(true);
            const sFactor = k % 2 === 0 ? 0.9 * sc : 2.1 * sc;
            clone.scale.setScalar(sFactor);
            clone.position.set((k - 2) * 0.55, 0, ((k % 2) - 0.5) * 0.24);
            clone.rotation.y = k * 1.3;
            holder.add(clone);
          }
        })
        .catch(() => {});
    }
  }

  return group;
}

export function generateLandscape3D(
  sceneData: SceneData,
  materials: MaterialSystem,
  quality: LandscapeQualityOptions = { vegetationDensityMultiplier: 1.0, enableLod: true },
  assetManager?: AssetManager,
  abortSignal?: AbortSignal,
): THREE.Group {
  const root = new THREE.Group();
  root.name = 'LandscapeRoot';

  const surroundMat = new THREE.MeshStandardMaterial({
    color: 0x9aa48c,
    roughness: 0.96,
  });
  const surroundPlane = new THREE.Mesh(new THREE.CircleGeometry(94, 48), surroundMat);
  surroundPlane.rotation.x = -Math.PI * 0.5;
  surroundPlane.position.y = -0.06;
  surroundPlane.receiveShadow = true;
  root.add(surroundPlane);

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x464a4f, roughness: 0.88 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(90, 7.0), roadMat);
  road.rotation.x = -Math.PI * 0.5;
  road.position.set(0, -0.02, 18.5);
  road.receiveShadow = true;
  root.add(road);

  const shrubElements: LandscapeElementData[] = [];

  for (const el of sceneData.landscape) {
    switch (el.type) {
      case 'lawn': {
        if (el.polygon) {
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
        root.add(buildSwimmingPool(el, materials));
        break;
      }
      case 'fence': {
        root.add(buildBoundaryFence(el, materials));
        break;
      }
      case 'tree_eucalyptus': {
        root.add(buildBotanicalEucalyptusTree(el, quality.enableLod));
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

  root.add(buildGardenFlora(shrubElements, assetManager, abortSignal));

  return root;
}
