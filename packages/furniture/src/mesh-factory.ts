import type { FurnitureItemData } from '@kujiale/scene-schema';
import type { MaterialSystem } from '@kujiale/materials';
import type { AssetManager } from '@kujiale/asset-manager';
import * as THREE from 'three';
import { getFurnitureCatalogEntry } from './catalog';

function addBox(
  parent: THREE.Group,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
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
  seg = 20,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/**
 * Builds rich, multi-part, metric-accurate PBR 3D furniture assemblies,
 * and seamlessly upgrades with local GLB model geometry when available.
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
  const metalMat = materials.getMaterial('metal-brushed-nickel', { worldSpaceUv: false });
  const darkMetalMat = materials.getMaterial('metal-monument-matte', { worldSpaceUv: false });

  const { x: W, y: H, z: D } = item.dimensions;
  const proceduralContent = new THREE.Group();
  proceduralContent.name = 'ProceduralFurnitureParts';

  if (item.catalogId.startsWith('sofa-')) {
    // Timber base plinth + 4 legs + seat cushions + backrest + armrests + scatter pillows
    addBox(proceduralContent, W - 0.06, 0.08, D - 0.06, 0, 0.11, 0, sMat);
    for (const lx of [-W * 0.44, W * 0.44]) {
      for (const lz of [-D * 0.4, D * 0.4]) {
        addCyl(proceduralContent, 0.025, 0.018, 0.09, lx, 0.045, lz, sMat, 12);
      }
    }
    const armW = 0.17;
    addBox(proceduralContent, armW, H * 0.68, D - 0.04, -W * 0.5 + armW * 0.5, H * 0.34 + 0.08, 0, pMat);
    addBox(proceduralContent, armW, H * 0.68, D - 0.04, W * 0.5 - armW * 0.5, H * 0.34 + 0.08, 0, pMat);
    addBox(proceduralContent, W - armW * 2, H - 0.15, 0.22, 0, (H - 0.15) * 0.5 + 0.15, -D * 0.5 + 0.12, pMat);

    const seats = 3;
    const seatW = (W - armW * 2 - 0.04) / seats;
    for (let i = 0; i < seats; i++) {
      const sx = -(W - armW * 2) * 0.5 + seatW * (i + 0.5) + 0.01;
      addBox(proceduralContent, seatW - 0.02, 0.19, D - 0.26, sx, 0.24, 0.08, pMat);
      addBox(proceduralContent, seatW - 0.03, 0.36, 0.16, sx, 0.52, -D * 0.5 + 0.28, pMat);
    }
  } else if (item.catalogId === 'armchair-boucle') {
    for (const lx of [-W * 0.38, W * 0.38]) {
      for (const lz of [-D * 0.36, D * 0.36]) {
        addCyl(proceduralContent, 0.024, 0.016, 0.18, lx, 0.09, lz, sMat, 12);
      }
    }
    addBox(proceduralContent, W - 0.14, 0.2, D - 0.12, 0, 0.28, 0.04, pMat);
    addBox(proceduralContent, W, 0.44, 0.18, 0, 0.54, -D * 0.5 + 0.1, pMat);
    addBox(proceduralContent, 0.13, 0.34, D - 0.08, -W * 0.5 + 0.065, 0.42, 0, pMat);
    addBox(proceduralContent, 0.13, 0.34, D - 0.08, W * 0.5 - 0.065, 0.42, 0, pMat);
  } else if (item.catalogId === 'table-coastal-coffee' || item.catalogId === 'table-travertine-plinth') {
    const topMesh = addCyl(proceduralContent, 0.5, 0.5, 0.045, 0, H - 0.022, 0, pMat, 32);
    topMesh.scale.set(W, 1, D);
    addCyl(proceduralContent, 0.16, 0.2, H - 0.045, -W * 0.26, (H - 0.045) * 0.5, 0, sMat, 20);
    addCyl(proceduralContent, 0.16, 0.2, H - 0.045, W * 0.26, (H - 0.045) * 0.5, 0, sMat, 20);
  } else if (item.catalogId === 'storage-lowline-media') {
    addBox(proceduralContent, W, H - 0.14, D, 0, (H - 0.14) * 0.5 + 0.14, 0, pMat);
    for (const lx of [-W * 0.44, 0, W * 0.44]) {
      for (const lz of [-D * 0.38, D * 0.38]) {
        addCyl(proceduralContent, 0.018, 0.014, 0.14, lx, 0.07, lz, sMat, 10);
      }
    }
    // Framed architectural OLED TV screen above unit
    addBox(proceduralContent, 1.42, 0.82, 0.03, 0, H + 0.54, -D * 0.22, darkMetalMat);
  } else if (item.catalogId === 'decor-jute-rug') {
    const rug = addBox(proceduralContent, W, H, D, 0, H * 0.5, 0, pMat);
    rug.castShadow = false;
  } else if (item.catalogId.startsWith('table-dining-') || item.catalogId === 'outdoor-alfresco-lounge') {
    // Table top + 4 tapered legs + 6 dining chairs neatly tucked around perimeter
    addBox(proceduralContent, W, 0.045, D, 0, H - 0.022, 0, pMat);
    for (const lx of [-W * 0.44, W * 0.44]) {
      for (const lz of [-D * 0.4, D * 0.4]) {
        addCyl(proceduralContent, 0.032, 0.022, H - 0.045, lx, (H - 0.045) * 0.5, lz, pMat, 12);
      }
    }
    for (const cx of [-W * 0.3, 0, W * 0.3]) {
      for (const side of [-1, 1]) {
        const cz = side * (D * 0.5 + 0.16);
        addBox(proceduralContent, 0.44, 0.045, 0.44, cx, 0.45, cz, sMat);
        addBox(proceduralContent, 0.44, 0.38, 0.04, cx, 0.66, cz + side * 0.2, pMat);
        for (const clx of [-0.18, 0.18]) {
          for (const clz of [-0.18, 0.18]) {
            addCyl(proceduralContent, 0.016, 0.012, 0.44, cx + clx, 0.22, cz + clz, pMat, 8);
          }
        }
      }
    }
  } else if (item.catalogId === 'kitchen-island-bench') {
    // Stone waterfall benchtop + timber cabinetry + undermount sink + gooseneck tap + 3 bar stools
    addBox(proceduralContent, W - 0.1, H - 0.05, D * 0.72, 0, (H - 0.05) * 0.5, -D * 0.1, sMat);
    addBox(proceduralContent, W, 0.055, D, 0, H - 0.027, 0, pMat);
    addBox(proceduralContent, 0.055, H, D, -W * 0.5 + 0.027, H * 0.5, 0, pMat);
    addBox(proceduralContent, 0.055, H, D, W * 0.5 - 0.027, H * 0.5, 0, pMat);
    // Gooseneck mixer tap
    addCyl(proceduralContent, 0.016, 0.02, 0.32, 0.35, H + 0.15, -0.1, metalMat, 12);
    // 3 breakfast bar stools
    for (const sx of [-0.62, 0, 0.62]) {
      addCyl(proceduralContent, 0.17, 0.17, 0.045, sx, 0.66, D * 0.42, sMat, 18);
      addCyl(proceduralContent, 0.025, 0.04, 0.65, sx, 0.325, D * 0.42, darkMetalMat, 12);
    }
  } else if (item.catalogId === 'kitchen-wall-joinery') {
    // Base cabinets + stone splashback & benchtop + overhead cupboards + induction cooktop
    addBox(proceduralContent, W, 0.88, D, 0, 0.44, 0, pMat);
    addBox(proceduralContent, W, 0.04, D + 0.02, 0, 0.9, 0, sMat);
    addBox(proceduralContent, W, 0.72, 0.38, 0, H - 0.36, -D * 0.5 + 0.19, pMat);
    addBox(proceduralContent, 0.78, 0.015, 0.48, 0, 0.925, 0.02, darkMetalMat);
  } else if (item.catalogId.startsWith('bed-')) {
    // Timber bed frame + upholstered headboard + plush mattress + folded coastal duvet + 4 pillows
    addBox(proceduralContent, W, 0.26, D, 0, 0.16, 0, sMat);
    addBox(proceduralContent, W + 0.08, H, 0.12, 0, H * 0.5, -D * 0.5 + 0.06, pMat);
    const whiteMat = materials.getMaterial('paint-crisp-white', { worldSpaceUv: false });
    addBox(proceduralContent, W - 0.08, 0.24, D - 0.16, 0, 0.4, 0.04, whiteMat);
    addBox(proceduralContent, W - 0.04, 0.12, D * 0.62, 0, 0.54, D * 0.16, pMat);
    for (const px of [-W * 0.24, W * 0.24]) {
      addBox(proceduralContent, W * 0.38, 0.14, 0.36, px, 0.58, -D * 0.5 + 0.34, whiteMat);
    }
  } else if (item.catalogId === 'bath-freestanding-oval') {
    const tub = addCyl(proceduralContent, 0.5, 0.42, H, 0, H * 0.5, 0, pMat, 32);
    tub.scale.set(W, 1, D);
    addCyl(proceduralContent, 0.02, 0.025, H + 0.28, 0, (H + 0.28) * 0.5, -D * 0.5 - 0.08, sMat, 12);
  } else if (item.catalogId === 'bath-vanity-double') {
    addBox(proceduralContent, W, 0.5, D, 0, 0.56, 0, pMat);
    addBox(proceduralContent, W + 0.02, 0.04, D + 0.02, 0, 0.83, 0, sMat);
    for (const bx of [-W * 0.26, W * 0.26]) {
      addCyl(proceduralContent, 0.19, 0.15, 0.11, bx, 0.9, 0, sMat, 24);
      // Round backlit vanity mirror above each basin
      const mirror = addCyl(proceduralContent, 0.36, 0.36, 0.02, bx, 1.48, -D * 0.5 + 0.02, metalMat, 28);
      mirror.rotation.x = Math.PI * 0.5;
    }
  } else if (item.catalogId === 'table-study-desk') {
    addBox(proceduralContent, W, 0.04, D, 0, H - 0.02, 0, pMat);
    addBox(proceduralContent, 0.05, H - 0.04, D - 0.08, -W * 0.46, (H - 0.04) * 0.5, 0, darkMetalMat);
    addBox(proceduralContent, 0.05, H - 0.04, D - 0.08, W * 0.46, (H - 0.04) * 0.5, 0, darkMetalMat);
    // Task chair
    addBox(proceduralContent, 0.48, 0.06, 0.46, 0, 0.46, D * 0.55, sMat);
    addBox(proceduralContent, 0.46, 0.42, 0.05, 0, 0.68, D * 0.55 + 0.21, sMat);
    addCyl(proceduralContent, 0.03, 0.22, 0.44, 0, 0.22, D * 0.55, darkMetalMat, 12);
  } else {
    // Storage wardrobes, laundry cabinets & generic joinery
    addBox(proceduralContent, W, H, D, 0, H * 0.5, 0, pMat);
    addBox(proceduralContent, 0.02, H * 0.35, 0.03, -0.05, H * 0.5, D * 0.5 + 0.015, sMat);
    addBox(proceduralContent, 0.02, H * 0.35, 0.03, 0.05, H * 0.5, D * 0.5 + 0.015, sMat);
  }

  root.add(proceduralContent);

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
  tagSubtree(root);

  // If a local GLB asset URL is configured and AssetManager is supplied, asynchronously load & swap cleanly!
  if (item.glbUrl && assetManager) {
    assetManager
      .loadGlbModel(item.glbUrl, abortSignal)
      .then((glbGroup) => {
        if (abortSignal?.aborted || !root.parent) return;
        // Fit/verify metric bounds of loaded GLB to match item.dimensions
        const box = new THREE.Box3().setFromObject(glbGroup);
        const size = new THREE.Vector3();
        box.getSize(size);
        if (size.x > 0.01 && size.y > 0.01 && size.z > 0.01) {
          glbGroup.scale.set(W / size.x, H / size.y, D / size.z);
          const fittedBox = new THREE.Box3().setFromObject(glbGroup);
          const center = new THREE.Vector3();
          fittedBox.getCenter(center);
          glbGroup.position.set(-center.x, -fittedBox.min.y, -center.z);
        }
        tagSubtree(glbGroup);
        root.remove(proceduralContent);
        proceduralContent.traverse((c) => {
          if (c instanceof THREE.Mesh) c.geometry.dispose();
        });
        root.add(glbGroup);
      })
      .catch(() => {
        // Keep parametric PBR fallback smoothly if optional GLB is absent in headless tests
      });
  }

  return root;
}
