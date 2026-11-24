import {
  circleVsSegmentPushback,
  clamp,
  distance2D,
  lerpPoint2D,
  pointInPolygon,
  polygonBounds,
  polygonCentroid,
  type Point2D,
  type Vec3,
} from '@kujiale/shared';
import type { SceneData } from '@kujiale/scene-schema';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type CameraNavigationMode = 'orbit' | 'first_person' | 'top_down';

export interface CollisionSegment2D {
  a: Point2D;
  b: Point2D;
  halfThickness: number;
}

/**
 * Extracts walkable collision segments from walls, carving passable gaps ONLY for open doors!
 */
export function buildWalkthroughColliders(
  scene: SceneData,
  activeFloorId = 'ground',
): CollisionSegment2D[] {
  const segments: CollisionSegment2D[] = [];

  for (const wall of scene.walls) {
    if (wall.floorId !== activeFloorId) continue;
    const len = distance2D(wall.start, wall.end);
    if (len < 0.05) continue;

    // Collect open doors on this wall
    const openSpans: Array<[number, number]> = [];
    for (const door of scene.doors) {
      if (door.wallId !== wall.id || !door.isOpen) continue;
      const centerU = door.positionAlongWall * len;
      const passHalfW = Math.max(0.32, door.width * 0.5 - 0.05);
      openSpans.push([
        clamp(centerU - passHalfW, 0, len),
        clamp(centerU + passHalfW, 0, len),
      ]);
    }
    openSpans.sort((x, y) => x[0] - y[0]);

    let cursor = 0;
    for (const [u0, u1] of openSpans) {
      if (u0 > cursor + 0.04) {
        segments.push({
          a: lerpPoint2D(wall.start, wall.end, cursor / len),
          b: lerpPoint2D(wall.start, wall.end, u0 / len),
          halfThickness: wall.thickness * 0.5,
        });
      }
      cursor = Math.max(cursor, u1);
    }
    if (cursor < len - 0.04) {
      segments.push({
        a: lerpPoint2D(wall.start, wall.end, cursor / len),
        b: wall.end,
        halfThickness: wall.thickness * 0.5,
      });
    }
  }

  // Perimeter fence & swimming pool safety barrier
  for (const el of scene.landscape) {
    if (el.type === 'fence' && el.polygon && el.polygon.length >= 2) {
      for (let i = 0; i < el.polygon.length - 1; i++) {
        segments.push({
          a: el.polygon[i]!,
          b: el.polygon[i + 1]!,
          halfThickness: 0.08,
        });
      }
    }
    if (el.type === 'swimming_pool' && el.polygon && el.polygon.length >= 3) {
      for (let i = 0; i < el.polygon.length; i++) {
        segments.push({
          a: el.polygon[i]!,
          b: el.polygon[(i + 1) % el.polygon.length]!,
          halfThickness: 0.25,
        });
      }
    }
  }

  return segments;
}

/**
 * Resolves smooth sliding player movement against walls, closed doors, fences, and solid furniture.
 */
export function resolveWalkthroughPosition(
  desiredXZ: Point2D,
  scene: SceneData,
  colliders: readonly CollisionSegment2D[],
  playerRadius = 0.28,
): Point2D {
  let pos = {
    x: clamp(desiredXZ.x, -10.2, 10.2),
    z: clamp(desiredXZ.z, -14.0, 14.5),
  };

  // Two relaxation passes prevent corner tunnelling
  for (let pass = 0; pass < 2; pass++) {
    for (const seg of colliders) {
      pos = circleVsSegmentPushback(pos, playerRadius, seg.a, seg.b, seg.halfThickness);
    }

    // Solid furniture radial/box avoidance (skipping flat floor rugs!)
    for (const item of scene.furniture) {
      if (item.dimensions.y <= 0.05) continue;
      const cos = Math.cos(-item.rotationY);
      const sin = Math.sin(-item.rotationY);
      const dx = pos.x - item.position.x;
      const dz = pos.z - item.position.z;
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;

      const hx = item.dimensions.x * 0.5 + playerRadius * 0.75;
      const hz = item.dimensions.z * 0.5 + playerRadius * 0.75;
      if (Math.abs(localX) < hx && Math.abs(localZ) < hz) {
        const penX = hx - Math.abs(localX);
        const penZ = hz - Math.abs(localZ);
        let resolvedLocalX = localX;
        let resolvedLocalZ = localZ;
        if (penX < penZ) {
          resolvedLocalX = localX >= 0 ? hx : -hx;
        } else {
          resolvedLocalZ = localZ >= 0 ? hz : -hz;
        }
        const invCos = Math.cos(item.rotationY);
        const invSin = Math.sin(item.rotationY);
        pos = {
          x: item.position.x + resolvedLocalX * invCos - resolvedLocalZ * invSin,
          z: item.position.z + resolvedLocalX * invSin + resolvedLocalZ * invCos,
        };
      }
    }
  }

  return pos;
}

/**
 * Computes exact ground/slab/deck/stair elevation at (x, z) for natural stepping indoors & outdoors.
 */
export function sampleWalkableGroundElevation(xz: Point2D, scene: SceneData): number {
  const floorById = new Map(scene.floors.map((f) => [f.id, f]));
  for (const room of scene.rooms) {
    if (pointInPolygon(xz, room.polygon)) {
      const floor = floorById.get(room.floorId);
      const baseElev = (floor?.elevation ?? 0.16) + room.elevationOffset;
      if (room.roomType === 'staircase' && floor) {
        const b = polygonBounds(room.polygon);
        const t = clamp((xz.z - b.minZ) / Math.max(0.5, b.depth), 0, 1);
        return baseElev + t * (floor.ceilingHeight + floor.slabThickness);
      }
      return baseElev;
    }
  }
  for (const el of scene.landscape) {
    if ((el.type === 'driveway' || el.type === 'footpath') && el.polygon) {
      if (pointInPolygon(xz, el.polygon)) return 0.025;
    }
  }
  return 0.0; // Lawn elevation
}

export class WalkthroughController {
  public readonly camera: THREE.PerspectiveCamera;
  public readonly orbitControls: OrbitControls;

  private mode: CameraNavigationMode = 'orbit';
  private domElement: HTMLElement | null = null;
  private sceneData: SceneData | null = null;
  private colliders: CollisionSegment2D[] = [];

  private readonly keysPressed = new Set<string>();
  private yaw = 0; // radians around Y (0 looks towards -Z North)
  private pitch = -0.06; // radians up/down
  private walkSpeed = 3.4; // m/s
  private readonly eyeHeight = 1.66; // m

  // Mobile virtual joystick & touch-look inputs
  private joystickMoveX = 0; // [-1..1] strafe
  private joystickMoveY = 0; // [-1..1] forward (+1 = forward)
  private isPointerDraggingLook = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  private readonly boundKeyDown: (e: KeyboardEvent) => void;
  private readonly boundKeyUp: (e: KeyboardEvent) => void;
  private readonly boundPointerDown: (e: PointerEvent) => void;
  private readonly boundPointerMove: (e: PointerEvent) => void;
  private readonly boundPointerUp: () => void;

  constructor(aspect = 16 / 9, domElement?: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(52, aspect, 0.08, 220);
    this.camera.position.set(-10.8, 10.6, -16.4);

    this.domElement = domElement ?? null;

    this.orbitControls = new OrbitControls(this.camera, domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.07;
    this.orbitControls.maxPolarAngle = Math.PI * 0.485;
    this.orbitControls.minDistance = 2.0;
    this.orbitControls.maxDistance = 55.0;
    this.orbitControls.target.set(0.2, 1.2, -1.8);
    this.orbitControls.update();

    this.boundKeyDown = (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      this.keysPressed.add(e.code);
    };
    this.boundKeyUp = (e) => {
      this.keysPressed.delete(e.code);
    };
    this.boundPointerDown = (e) => {
      if (this.mode !== 'first_person') return;
      if (e.button === 0) {
        this.isPointerDraggingLook = true;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
      }
    };
    this.boundPointerMove = (e) => {
      if (this.mode !== 'first_person') return;
      const isLocked =
        typeof document !== 'undefined' &&
        this.domElement !== null &&
        document.pointerLockElement === this.domElement;

      if (isLocked) {
        this.applyLookDelta(e.movementX, e.movementY, 0.0022);
      } else if (this.isPointerDraggingLook) {
        const dx = e.clientX - this.lastPointerX;
        const dy = e.clientY - this.lastPointerY;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        this.applyLookDelta(-dx, -dy, 0.0032);
      }
    };
    this.boundPointerUp = () => {
      this.isPointerDraggingLook = false;
    };

    if (typeof window !== 'undefined' && domElement) {
      window.addEventListener('keydown', this.boundKeyDown);
      window.addEventListener('keyup', this.boundKeyUp);
      domElement.addEventListener('pointerdown', this.boundPointerDown);
      window.addEventListener('pointermove', this.boundPointerMove);
      window.addEventListener('pointerup', this.boundPointerUp);
    }
  }

  public syncSceneData(scene: SceneData): void {
    this.sceneData = scene;
    const activeFloor = scene.floors[0]?.id ?? 'ground';
    this.colliders = buildWalkthroughColliders(scene, activeFloor);
  }

  public getMode(): CameraNavigationMode {
    return this.mode;
  }

  public setWalkSpeed(metersPerSecond: number): void {
    this.walkSpeed = clamp(metersPerSecond, 1.0, 8.0);
  }

  public getWalkSpeed(): number {
    return this.walkSpeed;
  }

  public setVirtualJoystick(moveX: number, moveY: number): void {
    this.joystickMoveX = clamp(moveX, -1, 1);
    this.joystickMoveY = clamp(moveY, -1, 1);
  }

  public applyLookDelta(deltaX: number, deltaY: number, sensitivity = 0.003): void {
    this.yaw -= deltaX * sensitivity;
    this.pitch = clamp(this.pitch - deltaY * sensitivity, -Math.PI * 0.44, Math.PI * 0.44);
  }

  public requestPointerLock(): void {
    if (this.mode === 'first_person' && this.domElement?.requestPointerLock) {
      this.domElement.requestPointerLock();
    }
  }

  public setMode(nextMode: CameraNavigationMode): void {
    this.mode = nextMode;
    this.keysPressed.clear();
    this.isPointerDraggingLook = false;

    if (
      nextMode !== 'first_person' &&
      typeof document !== 'undefined' &&
      document.pointerLockElement
    ) {
      document.exitPointerLock?.();
    }

    if (nextMode === 'orbit') {
      this.camera.fov = 52;
      this.camera.updateProjectionMatrix();
      this.orbitControls.enabled = true;
      this.orbitControls.enableRotate = true;
      this.orbitControls.maxPolarAngle = Math.PI * 0.485;
      if (this.camera.position.y < 3.5) {
        this.camera.position.set(-13.5, 10.5, -16.0);
        this.orbitControls.target.set(0, 1.3, -1.5);
      }
      this.orbitControls.update();
    } else if (nextMode === 'top_down') {
      this.camera.fov = 44;
      this.camera.updateProjectionMatrix();
      this.orbitControls.enabled = true;
      this.orbitControls.enableRotate = false;
      this.camera.position.set(0.2, 26.5, 0.6);
      this.orbitControls.target.set(0.2, 0, 0.5);
      this.orbitControls.update();
    } else if (nextMode === 'first_person') {
      this.orbitControls.enabled = false;
      this.camera.fov = 66; // Natural human architectural walkthrough FOV
      this.camera.updateProjectionMatrix();
      // Start at Front Footpath looking North or inside Living Room if currently high up
      if (this.camera.position.y > 3.2) {
        this.teleportToPreset('living_room');
      } else {
        const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
        this.yaw = euler.y;
        this.pitch = clamp(euler.x, -0.45, 0.45);
      }
    }
  }

  /**
   * Teleports camera cleanly to named indoor/outdoor Australian residential zones.
   */
  public teleportToPreset(
    zone:
      | 'front_yard'
      | 'living_room'
      | 'kitchen'
      | 'master_bedroom'
      | 'bathroom'
      | 'patio'
      | 'backyard_pool'
      | string,
  ): void {
    const presets: Record<string, { pos: Vec3; yaw: number; orbitPos: Vec3; target: Vec3 }> = {
      front_yard: {
        pos: { x: 0.2, y: 1.66, z: 11.8 },
        yaw: 0, // Faces North towards Front Entry Door (Z = 8.0)
        orbitPos: { x: -8.5, y: 8.2, z: 18.5 },
        target: { x: 0.2, y: 1.4, z: 4.0 },
      },
      living_room: {
        pos: { x: -5.55, y: 1.68, z: -5.05 },
        yaw: -2.32, // Interior photography angle showcasing sculpted Sofa, Coffee Table, Console & Kitchen Island!
        orbitPos: { x: -11.5, y: 9.0, z: -13.5 },
        target: { x: -3.5, y: 1.2, z: -3.8 },
      },
      kitchen: {
        pos: { x: -1.1, y: 1.82, z: -0.9 },
        yaw: -2.25,
        orbitPos: { x: -8.5, y: 8.5, z: 6.5 },
        target: { x: -2.4, y: 1.1, z: 0.4 },
      },
      master_bedroom: {
        pos: { x: 1.3, y: 1.82, z: -3.6 },
        yaw: -1.2,
        orbitPos: { x: 10.5, y: 8.5, z: -12.5 },
        target: { x: 3.4, y: 1.1, z: -4.2 },
      },
      bathroom: {
        pos: { x: 2.2, y: 1.82, z: -1.1 },
        yaw: -1.55,
        orbitPos: { x: 10.5, y: 8.0, z: -2.5 },
        target: { x: 4.2, y: 1.0, z: -1.1 },
      },
      patio: {
        pos: { x: -3.6, y: 1.78, z: -6.8 },
        yaw: 0.0, // Looks out over Alfresco Deck, Pergola & Backyard!
        orbitPos: { x: -11.5, y: 6.8, z: -15.5 },
        target: { x: -3.6, y: 1.3, z: -6.5 },
      },
      backyard_pool: {
        pos: { x: 0.4, y: 1.66, z: -12.2 },
        yaw: 3.05, // Looks South back at the North-facing Australian house facade, Alfresco & Pool!
        orbitPos: { x: 8.5, y: 7.5, z: -17.0 },
        target: { x: 0.5, y: 1.4, z: -6.0 },
      },
    };

    // Also allow passing any room.id directly!
    let chosen = presets[zone];
    if (!chosen && this.sceneData) {
      const room = this.sceneData.rooms.find((r) => r.id === zone || r.roomType === zone);
      if (room) {
        const c = polygonCentroid(room.polygon);
        const yGround = sampleWalkableGroundElevation(c, this.sceneData);
        chosen = {
          pos: { x: c.x, y: yGround + this.eyeHeight, z: c.z },
          yaw: 0,
          orbitPos: { x: c.x - 7, y: 8.5, z: c.z - 8 },
          target: { x: c.x, y: 1.1, z: c.z },
        };
      }
    }
    if (!chosen) chosen = presets.living_room!;

    if (this.mode === 'first_person') {
      const resolved = this.sceneData
        ? resolveWalkthroughPosition(
            { x: chosen.pos.x, z: chosen.pos.z },
            this.sceneData,
            this.colliders,
          )
        : { x: chosen.pos.x, z: chosen.pos.z };
      const groundY = this.sceneData
        ? sampleWalkableGroundElevation(resolved, this.sceneData)
        : chosen.pos.y - this.eyeHeight;
      this.camera.position.set(resolved.x, groundY + this.eyeHeight, resolved.z);
      this.yaw = chosen.yaw;
      this.pitch = -0.05;
      this.syncFirstPersonQuaternion();
    } else if (this.mode === 'orbit') {
      this.camera.position.set(chosen.orbitPos.x, chosen.orbitPos.y, chosen.orbitPos.z);
      this.orbitControls.target.set(chosen.target.x, chosen.target.y, chosen.target.z);
      this.orbitControls.update();
    } else {
      this.camera.position.set(chosen.target.x, 22.0, chosen.target.z + 0.05);
      this.orbitControls.target.set(chosen.target.x, 0, chosen.target.z);
      this.orbitControls.update();
    }
  }

  private syncFirstPersonQuaternion(): void {
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  public update(deltaSeconds: number): void {
    const dt = Math.min(0.1, Math.max(0.001, deltaSeconds));
    if (this.mode !== 'first_person') {
      this.orbitControls.update();
      return;
    }

    let forwardInput = this.joystickMoveY;
    let strafeInput = this.joystickMoveX;

    if (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp')) forwardInput += 1;
    if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) forwardInput -= 1;
    if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) strafeInput += 1;
    if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) strafeInput -= 1;

    const sprint =
      this.keysPressed.has('ShiftLeft') || this.keysPressed.has('ShiftRight') ? 1.65 : 1.0;

    const inputLen = Math.hypot(forwardInput, strafeInput);
    if (inputLen > 1e-3) {
      const nf = forwardInput / Math.max(1, inputLen);
      const ns = strafeInput / Math.max(1, inputLen);
      const step = this.walkSpeed * sprint * dt;

      // In Three.js camera space, yaw=0 looks along -Z, +X is right
      const fwdX = -Math.sin(this.yaw);
      const fwdZ = -Math.cos(this.yaw);
      const rightX = Math.cos(this.yaw);
      const rightZ = -Math.sin(this.yaw);

      const desiredXZ: Point2D = {
        x: this.camera.position.x + (fwdX * nf + rightX * ns) * step,
        z: this.camera.position.z + (fwdZ * nf + rightZ * ns) * step,
      };

      const resolvedXZ = this.sceneData
        ? resolveWalkthroughPosition(desiredXZ, this.sceneData, this.colliders)
        : desiredXZ;

      const groundY = this.sceneData
        ? sampleWalkableGroundElevation(resolvedXZ, this.sceneData)
        : 0.16;
      const targetEyeY = groundY + this.eyeHeight;

      this.camera.position.x = resolvedXZ.x;
      this.camera.position.z = resolvedXZ.z;
      this.camera.position.y += (targetEyeY - this.camera.position.y) * Math.min(1, dt * 12);
    }

    this.syncFirstPersonQuaternion();
  }

  public setAspect(aspect: number): void {
    if (aspect > 0 && Number.isFinite(aspect)) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
  }

  public dispose(): void {
    if (typeof window !== 'undefined' && this.domElement) {
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
      this.domElement.removeEventListener('pointerdown', this.boundPointerDown);
      window.removeEventListener('pointermove', this.boundPointerMove);
      window.removeEventListener('pointerup', this.boundPointerUp);
      this.orbitControls.dispose();
    } else if (this.domElement) {
      this.orbitControls.dispose();
    }
  }
}
