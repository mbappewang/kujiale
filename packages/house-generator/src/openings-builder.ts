import { distance2D, lerpPoint2D, wallDirection } from '@kujiale/shared';
import type { DoorData, WallData, WindowData } from '@kujiale/scene-schema';
import type { MaterialSystem } from '@kujiale/materials';
import * as THREE from 'three';

function orientOnWall(group: THREE.Group, wall: WallData, positionAlongWall: number, baseY: number): void {
  const pos = lerpPoint2D(wall.start, wall.end, positionAlongWall);
  const dir = wallDirection(wall.start, wall.end);
  const yaw = -Math.atan2(dir.z, dir.x);
  group.position.set(pos.x, baseY, pos.z);
  group.rotation.y = yaw;
}

export function buildDoorAssembly(
  door: DoorData,
  wall: WallData,
  baseElevation: number,
  materials: MaterialSystem,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `door-${door.id}`;
  group.userData = { entityType: 'door', entityId: door.id };

  const wallLen = distance2D(wall.start, wall.end);
  if (wallLen < 0.2) return group;

  orientOnWall(group, wall, door.positionAlongWall, baseElevation);

  const w = Math.min(door.width, wallLen - 0.12);
  const h = Math.min(door.height, wall.height - 0.05);
  const depth = wall.thickness + 0.03;
  const frameThick = 0.045;

  const frameMat = materials.getMaterial(door.frameMaterialId, { worldSpaceUv: false });
  const leafMat = materials.getMaterial(door.materialId, { worldSpaceUv: false });
  const handleMat = materials.getMaterial('metal-brushed-nickel', { worldSpaceUv: false });
  const glassMat = materials.getMaterial('glass-architectural-clear');

  // Jambs & Head Architrave Frame
  const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(frameThick, h, depth), frameMat);
  leftJamb.position.set(-w * 0.5 + frameThick * 0.5, h * 0.5, 0);
  const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(frameThick, h, depth), frameMat);
  rightJamb.position.set(w * 0.5 - frameThick * 0.5, h * 0.5, 0);
  const headJamb = new THREE.Mesh(new THREE.BoxGeometry(w, frameThick, depth), frameMat);
  headJamb.position.set(0, h - frameThick * 0.5, 0);
  group.add(leftJamb, rightJamb, headJamb);

  if (door.doorType === 'opening') {
    group.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.castShadow = true;
        c.receiveShadow = true;
        c.userData = { entityType: 'door', entityId: door.id };
      }
    });
    return group;
  }

  const innerW = w - frameThick * 2;
  const innerH = h - frameThick;

  if (door.doorType === 'sliding_glass') {
    // 3-panel Australian stacker glass door (when open, panels stack cleanly to the side!)
    const panelCount = 3;
    const panelW = innerW / panelCount + 0.03;
    const railThick = 0.04;

    for (let i = 0; i < panelCount; i++) {
      const panelGroup = new THREE.Group();
      const closedX = -innerW * 0.5 + panelW * 0.5 + i * ((innerW - panelW) / Math.max(1, panelCount - 1));
      const openX = -innerW * 0.5 + panelW * 0.5 + i * 0.03;
      const xPos = door.isOpen ? openX : closedX;
      const zOffset = (i - 1) * 0.032;

      const topRail = new THREE.Mesh(new THREE.BoxGeometry(panelW, railThick, 0.03), frameMat);
      topRail.position.set(0, innerH - railThick * 0.5, 0);
      const botRail = new THREE.Mesh(new THREE.BoxGeometry(panelW, railThick, 0.03), frameMat);
      botRail.position.set(0, railThick * 0.5, 0);
      const leftStile = new THREE.Mesh(new THREE.BoxGeometry(railThick, innerH, 0.03), frameMat);
      leftStile.position.set(-panelW * 0.5 + railThick * 0.5, innerH * 0.5, 0);
      const rightStile = new THREE.Mesh(new THREE.BoxGeometry(railThick, innerH, 0.03), frameMat);
      rightStile.position.set(panelW * 0.5 - railThick * 0.5, innerH * 0.5, 0);

      const pane = new THREE.Mesh(
        new THREE.BoxGeometry(panelW - railThick * 2, innerH - railThick * 2, 0.01),
        glassMat,
      );
      pane.position.set(0, innerH * 0.5, 0);

      panelGroup.add(topRail, botRail, leftStile, rightStile, pane);
      panelGroup.position.set(xPos, 0, zOffset);
      group.add(panelGroup);
    }
  } else if (door.doorType === 'garage_sectional') {
    if (!door.isOpen) {
      const sections = 4;
      const secH = innerH / sections - 0.008;
      for (let s = 0; s < sections; s++) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(innerW, secH, 0.055), leafMat);
        panel.position.set(0, s * (innerH / sections) + secH * 0.5 + 0.004, 0);
        group.add(panel);
      }
    }
  } else {
    // Hinged single or double entry architectural door with lever handles
    const pivot = new THREE.Group();
    const hingeLeft = door.swingDirection === 'left';
    pivot.position.set(hingeLeft ? -innerW * 0.5 : innerW * 0.5, 0, 0);

    const leafThickness = 0.044;
    const leafMesh = new THREE.Mesh(new THREE.BoxGeometry(innerW, innerH, leafThickness), leafMat);
    leafMesh.position.set(hingeLeft ? innerW * 0.5 : -innerW * 0.5, innerH * 0.5, 0);
    pivot.add(leafMesh);

    // Architectural lever handles on both sides
    const handleX = hingeLeft ? innerW - 0.09 : -(innerW - 0.09);
    const leverGeo = new THREE.BoxGeometry(0.12, 0.022, 0.09);
    const lever = new THREE.Mesh(leverGeo, handleMat);
    lever.position.set(handleX, 1.02, 0);
    pivot.add(lever);

    if (door.isOpen) {
      pivot.rotation.y = hingeLeft ? Math.PI * 0.44 : -Math.PI * 0.44;
    }
    group.add(pivot);
  }

  group.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.castShadow = c.material !== glassMat;
      c.receiveShadow = true;
      c.userData = { entityType: 'door', entityId: door.id };
    }
  });

  return group;
}

export function buildWindowAssembly(
  win: WindowData,
  wall: WallData,
  baseElevation: number,
  materials: MaterialSystem,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `window-${win.id}`;
  group.userData = { entityType: 'window', entityId: win.id };

  const wallLen = distance2D(wall.start, wall.end);
  if (wallLen < 0.25) return group;

  orientOnWall(group, wall, win.positionAlongWall, baseElevation + win.sillHeight);

  const w = Math.min(win.width, wallLen - 0.12);
  const h = Math.min(win.height, wall.height - win.sillHeight - 0.05);
  const frameDepth = wall.thickness + 0.02;
  const frameThick = 0.048;

  const frameMat = materials.getMaterial(win.frameMaterialId, { worldSpaceUv: false });
  const glassMat = materials.getMaterial(win.glassMaterialId);
  const sillMat = materials.getMaterial('marble-travertine', { worldSpaceUv: false });

  // Outer frame + projecting architectural window sill
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(w, frameThick, frameDepth), frameMat);
  topBar.position.set(0, h - frameThick * 0.5, 0);
  const botBar = new THREE.Mesh(new THREE.BoxGeometry(w, frameThick, frameDepth), frameMat);
  botBar.position.set(0, frameThick * 0.5, 0);
  const leftBar = new THREE.Mesh(new THREE.BoxGeometry(frameThick, h, frameDepth), frameMat);
  leftBar.position.set(-w * 0.5 + frameThick * 0.5, h * 0.5, 0);
  const rightBar = new THREE.Mesh(new THREE.BoxGeometry(frameThick, h, frameDepth), frameMat);
  rightBar.position.set(w * 0.5 - frameThick * 0.5, h * 0.5, 0);

  const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.035, frameDepth + 0.07), sillMat);
  sill.position.set(0, -0.015, 0);

  group.add(topBar, botBar, leftBar, rightBar, sill);

  // Mullions
  const panels = Math.max(1, win.panels);
  const innerW = w - frameThick * 2;
  const innerH = h - frameThick * 2;
  for (let i = 1; i < panels; i++) {
    const mx = -innerW * 0.5 + (innerW / panels) * i;
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.032, innerH, frameDepth * 0.7), frameMat);
    mullion.position.set(mx, h * 0.5, 0);
    group.add(mullion);
  }

  // Glazing pane (does NOT cast opaque shadow so real Australian sunlight pours into the room!)
  const glassPane = new THREE.Mesh(new THREE.BoxGeometry(innerW, innerH, 0.014), glassMat);
  glassPane.position.set(0, h * 0.5, 0);
  glassPane.castShadow = false;
  glassPane.receiveShadow = false;
  group.add(glassPane);

  group.traverse((c) => {
    if (c instanceof THREE.Mesh && c !== glassPane) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
    c.userData = { entityType: 'window', entityId: win.id };
  });

  return group;
}
