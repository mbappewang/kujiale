import type { AssetManager } from '@kujiale/asset-manager';
import type { MaterialSystem } from '@kujiale/materials';
import type { FurnitureItemData } from '@kujiale/scene-schema';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { getFurnitureCatalogEntry } from './catalog';

function addRoundedBox(
  parent: THREE.Group,
  w: number,
  h: number,
  d: number,
  radius: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  segs = 4,
): THREE.Mesh {
  const safeR = Math.min(radius, w * 0.45, h * 0.45, d * 0.45);
  const geo = new RoundedBoxGeometry(w, h, d, segs, safeR);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function addCyl(
  parent: THREE.Group,
  rTop: number,
  rBot: number,
  h: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  seg = 24,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/**
 * Creates a plump, pinched-seam sculpted feather pillow mesh (organic curvature, zero blocky edges).
 */
function buildSculptedPillow(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.SphereGeometry(0.5, 24, 18);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i) * 2; // [-1..1]
    const ny = pos.getY(i) * 2;
    const nz = pos.getZ(i) * 2;
    // Pillow puffiness profile: fuller near centre, pinched seam along equator
    const pinch = 1 - 0.22 * (nx * nx * nz * nz);
    const seamTaper = Math.sign(ny) * Math.pow(Math.abs(ny), 0.78);
    pos.setXYZ(i, nx * 0.5 * w * pinch, seamTaper * 0.5 * h, nz * 0.5 * d * pinch);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Creates a curved gooseneck architectural tap / bath spout using CatmullRomCurve3 + TubeGeometry.
 */
function buildGooseneckTap(height: number, reach: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, height * 0.78, 0),
    new THREE.Vector3(0, height, reach * 0.52),
    new THREE.Vector3(0, height * 0.76, reach),
  ]);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.013, 12, false), mat);
  tube.castShadow = true;
  g.add(tube);
  return g;
}

/**
 * Fits a loaded CC0 GLB model into target metric bounds while preserving natural artist aspect ratios
 * and upgrading its PBR environment reflections & fabric sheen.
 */
export function fitGlbPreservingProportions(
  glbGroup: THREE.Group,
  targetW: number,
  targetH: number,
  targetD: number,
  tintColorHex?: string,
): THREE.Group {
  const wrapper = new THREE.Group();
  const rawBox = new THREE.Box3().setFromObject(glbGroup);
  const rawSize = new THREE.Vector3();
  rawBox.getSize(rawSize);
  if (rawSize.x < 0.01 || rawSize.y < 0.01 || rawSize.z < 0.01) {
    wrapper.add(glbGroup);
    return wrapper;
  }

  const modelWiderInZ = rawSize.z > rawSize.x * 1.15;
  const targetWiderInX = targetW > targetD * 1.15;
  const modelWiderInX = rawSize.x > rawSize.z * 1.15;
  const targetWiderInZ = targetD > targetW * 1.15;
  if ((modelWiderInZ && targetWiderInX) || (modelWiderInX && targetWiderInZ)) {
    glbGroup.rotation.y = Math.PI * 0.5;
  }

  const orientedBox = new THREE.Box3().setFromObject(glbGroup);
  const orientedSize = new THREE.Vector3();
  orientedBox.getSize(orientedSize);

  const uniformScale = Math.min(
    targetW / orientedSize.x,
    targetH / orientedSize.y,
    targetD / orientedSize.z,
  );
  const sx = THREE.MathUtils.clamp(
    targetW / orientedSize.x,
    uniformScale * 0.88,
    uniformScale * 1.15,
  );
  const sy = THREE.MathUtils.clamp(
    targetH / orientedSize.y,
    uniformScale * 0.88,
    uniformScale * 1.15,
  );
  const sz = THREE.MathUtils.clamp(
    targetD / orientedSize.z,
    uniformScale * 0.88,
    uniformScale * 1.15,
  );
  glbGroup.scale.set(sx, sy, sz);

  const finalBox = new THREE.Box3().setFromObject(glbGroup);
  const finalCenter = new THREE.Vector3();
  finalBox.getCenter(finalCenter);
  glbGroup.position.set(-finalCenter.x, -finalBox.min.y, -finalCenter.z);

  glbGroup.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (m instanceof THREE.MeshStandardMaterial) {
          m.envMapIntensity = 1.15;
          if (tintColorHex) {
            m.color.lerp(new THREE.Color(tintColorHex), 0.38);
          }
          m.needsUpdate = true;
        }
      }
    }
  });

  wrapper.add(glbGroup);
  return wrapper;
}

/**
 * Builds photorealistic CC0 GLB-backed furniture & sculpted bevelled architectural joinery.
 */
export function buildFurnitureItemGroup(
  item: FurnitureItemData,
  materials: MaterialSystem,
  assetManager?: AssetManager,
  abortSignal?: AbortSignal,
): THREE.Group {
  const root = new THREE.Group();
  root.name = `furniture-${item.id}`;
  root.position.set(item.position.x, item.position.y, item.position.z);
  root.rotation.y = item.rotationY;
  root.scale.set(item.scale.x, item.scale.y, item.scale.z);

  const entry = getFurnitureCatalogEntry(item.catalogId);
  const pMatId = item.primaryMaterialId ?? entry?.defaultPrimaryMaterialId ?? 'timber-coastal-oak';
  const sMatId = item.secondaryMaterialId ?? entry?.defaultSecondaryMaterialId ?? 'fabric-coastal-linen';

  const pMat = materials.getMaterial(pMatId, { worldSpaceUv: false });
  const sMat = materials.getMaterial(sMatId, { worldSpaceUv: false });
  const whiteLinenMat = materials.getMaterial('paint-crisp-white', { worldSpaceUv: false });
  const metalMat = materials.getMaterial('metal-brushed-nickel', { worldSpaceUv: false });
  const darkMetalMat = materials.getMaterial('metal-monument-matte', { worldSpaceUv: false });

  const { x: W, y: H, z: D } = item.dimensions;
  const proceduralContent = new THREE.Group();
  proceduralContent.name = 'ProceduralFurnitureParts';

  const tagSubtree = (target: THREE.Object3D) => {
    target.traverse((obj) => {
      obj.userData = {
        entityType: 'furniture',
        entityId: item.id,
        catalogId: item.catalogId,
        roomId: item.roomId,
      };
    });
  };

  if (item.catalogId.startsWith('sofa-')) {
    // Sculpted soft-radius fallback while /models/sofa_03.glb streams in
    addRoundedBox(proceduralContent, W - 0.08, 0.1, D - 0.08, 0.025, 0, 0.11, 0, sMat);
    const armW = 0.2;
    addRoundedBox(proceduralContent, armW, H * 0.65, D - 0.04, 0.075, -W * 0.5 + armW * 0.5, H * 0.36, 0, pMat, 6);
    addRoundedBox(proceduralContent, armW, H * 0.65, D - 0.04, 0.075, W * 0.5 - armW * 0.5, H * 0.36, 0, pMat, 6);
    addRoundedBox(proceduralContent, W - armW * 2, H * 0.72, 0.24, 0.08, 0, H * 0.48, -D * 0.5 + 0.14, pMat, 6);
    const seats = 3;
    const seatW = (W - armW * 2) / seats;
    for (let i = 0; i < seats; i++) {
      const sx = -(W - armW * 2) * 0.5 + seatW * (i + 0.5);
      addRoundedBox(proceduralContent, seatW - 0.015, 0.22, D - 0.24, 0.075, sx, 0.26, 0.08, pMat, 6);
      const backPillow = buildSculptedPillow(seatW - 0.03, 0.42, 0.22, pMat);
      backPillow.position.set(sx, 0.55, -D * 0.5 + 0.29);
      backPillow.rotation.x = -0.16;
      proceduralContent.add(backPillow);
    }
  } else if (item.catalogId.startsWith('armchair-')) {
    addRoundedBox(proceduralContent, W - 0.12, 0.22, D - 0.12, 0.07, 0, 0.3, 0.04, pMat, 6);
    const back = buildSculptedPillow(W - 0.1, 0.48, 0.22, pMat);
    back.position.set(0, 0.58, -D * 0.5 + 0.16);
    back.rotation.x = -0.2;
    proceduralContent.add(back);
  } else if (item.catalogId === 'decor-jute-rug') {
    const rug = addRoundedBox(proceduralContent, W, H, D, 0.006, 0, H * 0.5, 0, pMat, 2);
    rug.castShadow = false;
  } else if (item.catalogId === 'storage-lowline-media') {
    addRoundedBox(proceduralContent, W, H - 0.14, D, 0.018, 0, (H - 0.14) * 0.5 + 0.14, 0, pMat);
    // Wall-mounted ultra-slim OLED TV with glossy screen panel (kept above console even after GLB swap!)
    const tvGroup = new THREE.Group();
    const bezel = addRoundedBox(tvGroup, 1.52, 0.86, 0.024, 0.008, 0, H + 0.58, -D * 0.32, darkMetalMat, 2);
    bezel.castShadow = true;
    const screenMat = new THREE.MeshPhysicalMaterial({
      color: 0x0b0e13,
      roughness: 0.06,
      metalness: 0.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.8,
    });
    addRoundedBox(tvGroup, 1.48, 0.82, 0.006, 0.002, 0, H + 0.58, -D * 0.32 + 0.013, screenMat, 1);
    root.add(tvGroup);
  } else if (item.catalogId.startsWith('table-dining-')) {
    // Bevelled dining table fallback + 6 async sculpted dining_chair_02.glb chairs!
    addRoundedBox(proceduralContent, W, 0.048, D, 0.014, 0, H - 0.024, 0, pMat);
    for (const lx of [-W * 0.42, W * 0.42]) {
      for (const lz of [-D * 0.38, D * 0.38]) {
        addCyl(proceduralContent, 0.032, 0.02, H - 0.048, lx, (H - 0.048) * 0.5, lz, pMat, 16);
      }
    }
    if (assetManager) {
      assetManager
        .loadGlbModel('/models/dining_chair_02.glb', abortSignal)
        .then((chairTemplate) => {
          if (abortSignal?.aborted || !root.parent) return;
          for (const cx of [-W * 0.31, 0, W * 0.31]) {
            for (const side of [-1, 1]) {
              const chairInstance = fitGlbPreservingProportions(
                chairTemplate.clone(true),
                0.48,
                0.88,
                0.54,
              );
              chairInstance.position.set(cx, 0, side * (D * 0.5 + 0.24));
              chairInstance.rotation.y = side === -1 ? 0 : Math.PI;
              tagSubtree(chairInstance);
              root.add(chairInstance);
            }
          }
        })
        .catch(() => {});
    }
  } else if (item.catalogId === 'kitchen-island-bench') {
    // Architectural waterfall Carrara stone island with fluted oak battens, undermount sink & 3 sculpted bar_chair_round_01.glb stools!
    addRoundedBox(proceduralContent, W - 0.12, H - 0.05, D * 0.66, 0.01, 0, (H - 0.05) * 0.5, -D * 0.12, sMat, 3);
    // Fluted vertical oak battens along front apron
    const battenCount = 24;
    for (let b = 0; b < battenCount; b++) {
      const bx = -(W - 0.22) * 0.5 + ((W - 0.22) / (battenCount - 1)) * b;
      addRoundedBox(
        proceduralContent,
        0.024,
        H - 0.14,
        0.018,
        0.006,
        bx,
        (H - 0.04) * 0.5 + 0.03,
        D * 0.21,
        sMat,
        2,
      );
    }
    // Chamfered waterfall stone benchtop + 2 waterfall side legs
    addRoundedBox(proceduralContent, W, 0.052, D, 0.008, 0, H - 0.026, 0, pMat, 3);
    addRoundedBox(proceduralContent, 0.052, H, D, 0.008, -W * 0.5 + 0.026, H * 0.5, 0, pMat, 3);
    addRoundedBox(proceduralContent, 0.052, H, D, 0.008, W * 0.5 - 0.026, H * 0.5, 0, pMat, 3);
    // Undermount stainless sink recess + curved gooseneck tap
    addRoundedBox(proceduralContent, 0.62, 0.012, 0.4, 0.02, 0.32, H + 0.002, -0.1, metalMat, 3);
    const tap = buildGooseneckTap(0.34, 0.2, metalMat);
    tap.position.set(0.32, H, -0.32);
    proceduralContent.add(tap);

    if (assetManager) {
      assetManager
        .loadGlbModel('/models/bar_chair_round_01.glb', abortSignal)
        .then((stoolTemplate) => {
          if (abortSignal?.aborted || !root.parent) return;
          for (const sx of [-0.62, 0, 0.62]) {
            const stool = fitGlbPreservingProportions(stoolTemplate.clone(true), 0.44, 0.68, 0.44);
            stool.position.set(sx, 0, D * 0.44);
            tagSubtree(stool);
            root.add(stool);
          }
        })
        .catch(() => {});
    }
  } else if (item.catalogId === 'kitchen-wall-joinery') {
    // Shadowline architectural cabinetry run + stone benchtop + stone splashback + glass cooktop + integrated oven
    addRoundedBox(proceduralContent, W, 0.08, D - 0.08, 0.005, 0, 0.04, -0.04, darkMetalMat, 2);
    const doors = 4;
    const doorW = (W - 0.04) / doors;
    for (let i = 0; i < doors; i++) {
      const dx = -W * 0.5 + 0.02 + doorW * (i + 0.5);
      addRoundedBox(proceduralContent, doorW - 0.008, 0.78, D - 0.02, 0.008, dx, 0.47, 0, pMat, 3);
      addRoundedBox(proceduralContent, doorW - 0.008, 0.72, 0.38, 0.008, dx, H - 0.36, -D * 0.5 + 0.19, pMat, 3);
    }
    // Stone benchtop + full-height veined marble splashback
    addRoundedBox(proceduralContent, W + 0.01, 0.042, D + 0.02, 0.006, 0, 0.885, 0.01, sMat, 3);
    addRoundedBox(proceduralContent, W - 0.02, 0.62, 0.02, 0.004, 0, 1.21, -D * 0.5 + 0.02, sMat, 2);
    // Glass induction cooktop & integrated under-bench oven
    const glassBlack = new THREE.MeshPhysicalMaterial({
      color: 0x111317,
      roughness: 0.08,
      metalness: 0.15,
      clearcoat: 1.0,
    });
    addRoundedBox(proceduralContent, 0.78, 0.014, 0.48, 0.01, 0, 0.912, 0.03, glassBlack, 2);
    addRoundedBox(proceduralContent, 0.59, 0.58, 0.03, 0.01, 0, 0.48, D * 0.5 - 0.005, glassBlack, 2);
  } else if (item.catalogId.startsWith('bed-')) {
    // Luxury Australian upholstered bed: rounded timber plinth, channeled headboard cushions, plush mattress, draped linen duvet & 4 sculpted feather pillows!
    addRoundedBox(proceduralContent, W, 0.24, D, 0.035, 0, 0.16, 0, sMat, 4);
    for (const lx of [-W * 0.45, W * 0.45]) {
      for (const lz of [-D * 0.45, D * 0.45]) {
        addCyl(proceduralContent, 0.026, 0.018, 0.08, lx, 0.04, lz, sMat, 14);
      }
    }
    // Channeled upholstered headboard (5 soft vertical bolster panels)
    const panels = 5;
    const panW = (W + 0.08) / panels;
    for (let p = 0; p < panels; p++) {
      const px = -(W + 0.08) * 0.5 + panW * (p + 0.5);
      addRoundedBox(proceduralContent, panW - 0.012, H, 0.13, 0.048, px, H * 0.5, -D * 0.5 + 0.065, pMat, 5);
    }
    // Plush mattress + organically draped linen duvet cover
    addRoundedBox(proceduralContent, W - 0.06, 0.24, D - 0.14, 0.055, 0, 0.38, 0.04, whiteLinenMat, 5);
    const duvet = addRoundedBox(
      proceduralContent,
      W + 0.02,
      0.16,
      D * 0.66,
      0.065,
      0,
      0.48,
      D * 0.16,
      pMat,
      6,
    );
    // Subtle organic wave folds along duvet surface
    const dPos = duvet.geometry.getAttribute('position');
    for (let i = 0; i < dPos.count; i++) {
      const vx = dPos.getX(i);
      const vy = dPos.getY(i);
      const vz = dPos.getZ(i);
      if (vy > 0) {
        const ripple = Math.sin(vz * 9.5 + vx * 2.5) * 0.012;
        dPos.setY(i, vy + ripple);
      }
    }
    duvet.geometry.computeVertexNormals();

    // 4 plump sculpted pillows (2 euro pillows + 2 sleeping pillows)
    for (const side of [-1, 1]) {
      const euro = buildSculptedPillow(W * 0.4, 0.34, 0.2, pMat);
      euro.position.set(side * W * 0.23, 0.62, -D * 0.5 + 0.24);
      euro.rotation.x = -0.26;
      const sleep = buildSculptedPillow(W * 0.38, 0.18, 0.34, whiteLinenMat);
      sleep.position.set(side * W * 0.23, 0.56, -D * 0.5 + 0.44);
      sleep.rotation.x = 0.08;
      proceduralContent.add(euro, sleep);
    }

    // Twin sculpted CC0 bedside tables flanking the bed
    if (assetManager) {
      assetManager
        .loadGlbModel('/models/side_table_01.glb', abortSignal)
        .then((sideTbl) => {
          if (abortSignal?.aborted || !root.parent) return;
          for (const side of [-1, 1]) {
            const tbl = fitGlbPreservingProportions(sideTbl.clone(true), 0.48, 0.52, 0.45);
            tbl.position.set(side * (W * 0.5 + 0.32), 0, -D * 0.5 + 0.28);
            tagSubtree(tbl);
            root.add(tbl);
          }
        })
        .catch(() => {});
    }
  } else if (item.catalogId === 'bath-freestanding-oval') {
    // True hollowed smooth sculptural oval vessel tub built via LatheGeometry!
    const profile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.41, 0.0),
      new THREE.Vector2(0.47, 0.14),
      new THREE.Vector2(0.5, H - 0.03),
      new THREE.Vector2(0.485, H),
      new THREE.Vector2(0.465, H - 0.02),
      new THREE.Vector2(0.41, 0.11),
      new THREE.Vector2(0.0, 0.09),
    ];
    const latheGeo = new THREE.LatheGeometry(profile, 44);
    const tubMesh = new THREE.Mesh(latheGeo, pMat);
    tubMesh.scale.set(W, 1, D);
    tubMesh.castShadow = true;
    tubMesh.receiveShadow = true;
    proceduralContent.add(tubMesh);

    // Brushed nickel pop-up waste + floor-standing gooseneck bath filler
    addCyl(proceduralContent, 0.038, 0.038, 0.015, 0, 0.098, 0, metalMat, 20);
    addCyl(proceduralContent, 0.02, 0.024, H + 0.06, 0, (H + 0.06) * 0.5, -D * 0.5 - 0.07, metalMat, 16);
    const bathSpout = buildGooseneckTap(0.22, 0.18, metalMat);
    bathSpout.position.set(0, H + 0.04, -D * 0.5 - 0.07);
    proceduralContent.add(bathSpout);
  } else if (item.catalogId === 'bath-vanity-double') {
    addRoundedBox(proceduralContent, W, 0.48, D, 0.022, 0, 0.56, 0, pMat, 4);
    addRoundedBox(proceduralContent, W + 0.02, 0.038, D + 0.02, 0.008, 0, 0.82, 0, sMat, 3);
    // Hollowed sculptural vessel basins + backlit vanity mirrors
    const basinProfile = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.17, 0),
      new THREE.Vector2(0.2, 0.12),
      new THREE.Vector2(0.19, 0.13),
      new THREE.Vector2(0.16, 0.02),
      new THREE.Vector2(0, 0.02),
    ];
    const basinGeo = new THREE.LatheGeometry(basinProfile, 32);
    const mirrorGlass = new THREE.MeshPhysicalMaterial({
      color: 0xf4f7f9,
      roughness: 0.02,
      metalness: 0.96,
      envMapIntensity: 2.0,
    });
    for (const bx of [-W * 0.27, W * 0.27]) {
      const basin = new THREE.Mesh(basinGeo, sMat);
      basin.position.set(bx, 0.84, 0.02);
      basin.castShadow = true;
      proceduralContent.add(basin);

      const tap = buildGooseneckTap(0.22, 0.13, metalMat);
      tap.position.set(bx, 0.84, -0.16);
      proceduralContent.add(tap);

      const mirror = addCyl(proceduralContent, 0.37, 0.37, 0.018, bx, 1.48, -D * 0.5 + 0.02, mirrorGlass, 36);
      mirror.rotation.x = Math.PI * 0.5;
    }
  } else if (item.catalogId === 'table-study-desk') {
    addRoundedBox(proceduralContent, W, 0.042, D, 0.012, 0, H - 0.021, 0, pMat, 4);
    addRoundedBox(proceduralContent, 0.045, H - 0.04, D - 0.1, 0.008, -W * 0.45, (H - 0.04) * 0.5, 0, darkMetalMat, 2);
    addRoundedBox(proceduralContent, 0.045, H - 0.04, D - 0.1, 0.008, W * 0.45, (H - 0.04) * 0.5, 0, darkMetalMat, 2);
    if (assetManager) {
      assetManager
        .loadGlbModel('/models/modern_arm_chair_01.glb', abortSignal)
        .then((chairGlb) => {
          if (abortSignal?.aborted || !root.parent) return;
          const chair = fitGlbPreservingProportions(chairGlb, 0.64, 0.84, 0.64);
          chair.position.set(0, 0, D * 0.55);
          chair.rotation.y = Math.PI;
          tagSubtree(chair);
          root.add(chair);
        })
        .catch(() => {});
    }
  } else {
    // Built-in wardrobes & joinery with shadowline door reveals & brushed handles
    const panels = Math.max(2, Math.round(W / 0.55));
    const pw = (W - 0.02) / panels;
    addRoundedBox(proceduralContent, W, H, D - 0.03, 0.01, 0, H * 0.5, -0.015, pMat, 2);
    for (let i = 0; i < panels; i++) {
      const px = -W * 0.5 + 0.01 + pw * (i + 0.5);
      addRoundedBox(proceduralContent, pw - 0.006, H - 0.06, 0.024, 0.006, px, H * 0.5 + 0.01, D * 0.5 - 0.012, pMat, 3);
      addRoundedBox(proceduralContent, 0.014, 0.28, 0.022, 0.004, px + (i % 2 === 0 ? pw * 0.38 : -pw * 0.38), 1.08, D * 0.5 + 0.01, sMat, 2);
    }
  }

  root.add(proceduralContent);
  tagSubtree(root);

  // Upgrade primary furniture piece with real sculpted CC0 GLB asset!
  const effectiveGlbUrl = item.glbUrl ?? entry?.glbUrl;
  if (effectiveGlbUrl && assetManager && !item.catalogId.startsWith('table-dining-')) {
    assetManager
      .loadGlbModel(effectiveGlbUrl, abortSignal)
      .then((glbGroup) => {
        if (abortSignal?.aborted || !root.parent) return;
        const customTint =
          item.primaryMaterialId && item.primaryMaterialId !== entry?.defaultPrimaryMaterialId
            ? materials.getSpec(item.primaryMaterialId).baseColorHex
            : undefined;
        const fitted = fitGlbPreservingProportions(glbGroup, W, H, D, customTint);
        tagSubtree(fitted);
        root.remove(proceduralContent);
        proceduralContent.traverse((c) => {
          if (c instanceof THREE.Mesh) c.geometry.dispose();
        });
        root.add(fitted);
      })
      .catch(() => {});
  } else if (effectiveGlbUrl && assetManager && item.catalogId.startsWith('table-dining-')) {
    // For dining suites, swap only the table procedural meshes while keeping the 6 async dining chairs!
    assetManager
      .loadGlbModel(effectiveGlbUrl, abortSignal)
      .then((tableGlb) => {
        if (abortSignal?.aborted || !root.parent) return;
        const fittedTable = fitGlbPreservingProportions(tableGlb, W, H, D);
        tagSubtree(fittedTable);
        root.remove(proceduralContent);
        proceduralContent.traverse((c) => {
          if (c instanceof THREE.Mesh) c.geometry.dispose();
        });
        root.add(fittedTable);
      })
      .catch(() => {});
  }

  return root;
}
