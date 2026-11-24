import {
  clamp,
  deepClone,
  distance2D,
  formatAreaSqm,
  formatMetres,
  lerpPoint2D,
  pointInPolygon,
  polygonAreaSqm,
  polygonBounds,
  polygonCentroid,
  projectPointOnSegment,
  wallDirection,
  wallNormal,
  type LengthDisplayUnit,
  type Point2D,
} from '@kujiale/shared';
import type { DoorData, RoomData, SceneData, WallData, WindowData } from '@kujiale/scene-schema';

export type EditorToolMode =
  | 'select'
  | 'draw_wall'
  | 'add_door'
  | 'add_window'
  | 'calibrate_scale';

export interface EditorSelection2D {
  kind: 'wall' | 'door' | 'window' | 'room';
  id: string;
}

export interface ScaleCalibrationSample {
  pointA: Point2D;
  pointB: Point2D;
  currentDistanceMeters: number;
}

export interface FloorplanEditorCallbacks {
  onSceneChange?: (nextScene: SceneData, commitHistory: boolean) => void;
  onSelect?: (selection: EditorSelection2D | null) => void;
  onCalibrationMeasured?: (sample: ScaleCalibrationSample) => void;
}

/**
 * Pure helper functions for 2D architectural mutations (unit-testable without DOM!).
 */
export function moveSharedWallVertex(
  scene: SceneData,
  anchorPoint: Point2D,
  newPoint: Point2D,
  snapGridMeters = 0.05,
): SceneData {
  const next = deepClone(scene);
  const snapped: Point2D = {
    x: Math.round(newPoint.x / snapGridMeters) * snapGridMeters,
    z: Math.round(newPoint.z / snapGridMeters) * snapGridMeters,
  };
  const tol = 0.06;

  for (const wall of next.walls) {
    if (distance2D(wall.start, anchorPoint) <= tol) {
      wall.start = { ...snapped };
    } else if (distance2D(wall.end, anchorPoint) <= tol) {
      wall.end = { ...snapped };
    }
  }

  // Also move matching room polygon vertices so floor slabs stay seamlessly aligned with dragged walls!
  for (const room of next.rooms) {
    for (let i = 0; i < room.polygon.length; i++) {
      if (distance2D(room.polygon[i]!, anchorPoint) <= tol) {
        room.polygon[i] = { ...snapped };
      }
    }
  }

  return next;
}

export function addWallToScene(
  scene: SceneData,
  start: Point2D,
  end: Point2D,
  isExterior = false,
): SceneData {
  if (distance2D(start, end) < 0.25) return scene;
  const next = deepClone(scene);
  const floorId = next.floors[0]?.id ?? 'ground';
  const height = next.floors[0]?.ceilingHeight ?? 2.85;
  const newWall: WallData = {
    id: `wall-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    floorId,
    start: { x: Number(start.x.toFixed(2)), z: Number(start.z.toFixed(2)) },
    end: { x: Number(end.x.toFixed(2)), z: Number(end.z.toFixed(2)) },
    thickness: isExterior ? 0.24 : 0.12,
    height,
    isExterior,
    interiorMaterialId: 'plaster-coastal-white',
    exteriorMaterialId: next.property.exteriorWallMaterialId,
    source: 'manual',
  };
  next.walls.push(newWall);
  return next;
}

export function deleteEditorSelectionFromScene(
  scene: SceneData,
  selection: EditorSelection2D,
): SceneData {
  const next = deepClone(scene);
  if (selection.kind === 'wall') {
    next.walls = next.walls.filter((w) => w.id !== selection.id);
    next.doors = next.doors.filter((d) => d.wallId !== selection.id);
    next.windows = next.windows.filter((w) => w.wallId !== selection.id);
  } else if (selection.kind === 'door') {
    next.doors = next.doors.filter((d) => d.id !== selection.id);
  } else if (selection.kind === 'window') {
    next.windows = next.windows.filter((w) => w.id !== selection.id);
  }
  return next;
}

export function applyMeasuredScaleCalibration(
  scene: SceneData,
  measuredDistanceMeters: number,
  knownRealMeters: number,
): SceneData {
  if (measuredDistanceMeters <= 0.01 || knownRealMeters <= 0.05) return scene;
  const ratio = knownRealMeters / measuredDistanceMeters;
  const next = deepClone(scene);

  for (const wall of next.walls) {
    wall.start = { x: Number((wall.start.x * ratio).toFixed(3)), z: Number((wall.start.z * ratio).toFixed(3)) };
    wall.end = { x: Number((wall.end.x * ratio).toFixed(3)), z: Number((wall.end.z * ratio).toFixed(3)) };
  }
  for (const room of next.rooms) {
    room.polygon = room.polygon.map((p) => ({
      x: Number((p.x * ratio).toFixed(3)),
      z: Number((p.z * ratio).toFixed(3)),
    }));
  }
  for (const door of next.doors) {
    door.width = clamp(Number((door.width * ratio).toFixed(2)), 0.55, 5.5);
  }
  for (const win of next.windows) {
    win.width = clamp(Number((win.width * ratio).toFixed(2)), 0.45, 5.5);
  }
  for (const furn of next.furniture) {
    furn.position.x = Number((furn.position.x * ratio).toFixed(3));
    furn.position.z = Number((furn.position.z * ratio).toFixed(3));
  }
  if (next.floorplanOverlay) {
    next.floorplanOverlay.pixelsPerMeter = Number(
      (next.floorplanOverlay.pixelsPerMeter / ratio).toFixed(2),
    );
    next.floorplanOverlay.calibrated = true;
  }
  return next;
}

const ROOM_FILL_COLORS: Record<string, string> = {
  living_room: 'rgba(229, 219, 201, 0.55)',
  dining_room: 'rgba(224, 214, 195, 0.52)',
  kitchen: 'rgba(209, 223, 218, 0.55)',
  master_bedroom: 'rgba(218, 225, 235, 0.55)',
  bedroom: 'rgba(223, 229, 238, 0.52)',
  study: 'rgba(215, 226, 214, 0.52)',
  bathroom: 'rgba(201, 226, 234, 0.58)',
  laundry: 'rgba(214, 224, 228, 0.52)',
  hallway: 'rgba(235, 231, 222, 0.5)',
  garage: 'rgba(218, 220, 223, 0.55)',
  patio: 'rgba(198, 173, 142, 0.42)',
  porch: 'rgba(216, 208, 194, 0.45)',
};

export class FloorplanEditor2D {
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly callbacks: FloorplanEditorCallbacks;

  private sceneData: SceneData;
  private toolMode: EditorToolMode = 'select';
  private displayUnit: LengthDisplayUnit = 'm';
  private selection: EditorSelection2D | null = null;

  // Viewport transform: screenPx = centerPx + worldMeters * zoomPxPerMeter
  private zoomPxPerMeter = 36;
  private panCenterWorld: Point2D = { x: 0.2, z: 0.5 };
  private bgImage: HTMLImageElement | null = null;
  private loadedBgUrl = '';

  // Interactive gesture state
  private isPanning = false;
  private lastPointerScreen: { x: number; y: number } = { x: 0, y: 0 };
  private draggingVertexAnchor: Point2D | null = null;
  private draggingOpening: { kind: 'door' | 'window'; id: string; wallId: string } | null = null;
  private preDragSnapshot: SceneData | null = null;
  private drawWallStart: Point2D | null = null;
  private hoverWorld: Point2D | null = null;
  private calibrationStart: Point2D | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private readonly boundWheel: (e: WheelEvent) => void;
  private readonly boundPointerDown: (e: PointerEvent) => void;
  private readonly boundPointerMove: (e: PointerEvent) => void;
  private readonly boundPointerUp: (e: PointerEvent) => void;

  constructor(
    container: HTMLElement,
    initialScene: SceneData,
    callbacks: FloorplanEditorCallbacks = {},
  ) {
    this.container = container;
    this.sceneData = deepClone(initialScene);
    this.callbacks = callbacks;

    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.touchAction = 'none';
    this.container.appendChild(this.canvas);

    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('2D Canvas context unavailable');
    this.ctx = context;

    this.boundWheel = (e) => this.handleWheel(e);
    this.boundPointerDown = (e) => this.handlePointerDown(e);
    this.boundPointerMove = (e) => this.handlePointerMove(e);
    this.boundPointerUp = (e) => this.handlePointerUp(e);

    this.canvas.addEventListener('wheel', this.boundWheel, { passive: false });
    this.canvas.addEventListener('pointerdown', this.boundPointerDown);
    this.canvas.addEventListener('pointermove', this.boundPointerMove);
    window.addEventListener('pointerup', this.boundPointerUp);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resizeAndRender());
      this.resizeObserver.observe(this.container);
    }

    this.syncBackgroundImage();
    this.resizeAndRender();
  }

  public setSceneData(scene: SceneData): void {
    this.sceneData = deepClone(scene);
    this.syncBackgroundImage();
    this.render();
  }

  public setToolMode(mode: EditorToolMode): void {
    this.toolMode = mode;
    this.drawWallStart = null;
    this.calibrationStart = null;
    this.canvas.style.cursor = mode === 'select' ? 'default' : 'crosshair';
    this.render();
  }

  public setDisplayUnit(unit: LengthDisplayUnit): void {
    this.displayUnit = unit;
    this.render();
  }

  public fitToView(): void {
    const rect = this.container.getBoundingClientRect();
    const minDim = Math.min(rect.width || 800, rect.height || 600);
    this.zoomPxPerMeter = clamp(minDim / 22, 16, 90);
    this.panCenterWorld = { x: 0.2, z: 0.2 };
    this.render();
  }

  private syncBackgroundImage(): void {
    const url = this.sceneData.floorplanOverlay?.imageUrl;
    if (!url) {
      this.bgImage = null;
      this.loadedBgUrl = '';
      return;
    }
    if (url === this.loadedBgUrl) return;
    this.loadedBgUrl = url;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.bgImage = img;
      this.render();
    };
    img.src = url;
  }

  private worldToScreen(pt: Point2D): { x: number; y: number } {
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 600;
    return {
      x: w * 0.5 + (pt.x - this.panCenterWorld.x) * this.zoomPxPerMeter,
      y: h * 0.5 + (pt.z - this.panCenterWorld.z) * this.zoomPxPerMeter,
    };
  }

  private screenToWorld(sx: number, sy: number): Point2D {
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 600;
    return {
      x: this.panCenterWorld.x + (sx - w * 0.5) / this.zoomPxPerMeter,
      z: this.panCenterWorld.z + (sy - h * 0.5) / this.zoomPxPerMeter,
    };
  }

  private snapWorldPoint(raw: Point2D): Point2D {
    // Snap to existing wall endpoints first (within 0.28m)
    for (const w of this.sceneData.walls) {
      if (distance2D(raw, w.start) < 0.28) return { ...w.start };
      if (distance2D(raw, w.end) < 0.28) return { ...w.end };
    }
    return {
      x: Math.round(raw.x / 0.1) * 0.1,
      z: Math.round(raw.z / 0.1) * 0.1,
    };
  }

  private resizeAndRender(): void {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(200, rect.width || 800);
    const h = Math.max(200, rect.height || 600);
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const beforeWorld = this.screenToWorld(sx, sy);

    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.zoomPxPerMeter = clamp(this.zoomPxPerMeter * factor, 12, 140);

    const afterWorld = this.screenToWorld(sx, sy);
    this.panCenterWorld.x += beforeWorld.x - afterWorld.x;
    this.panCenterWorld.z += beforeWorld.z - afterWorld.z;
    this.render();
  }

  private handlePointerDown(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    this.lastPointerScreen = { x: sx, y: sy };

    // Middle mouse or right-click or Alt+drag pans viewport
    if (e.button === 1 || e.button === 2 || e.altKey) {
      this.isPanning = true;
      return;
    }

    const world = this.screenToWorld(sx, sy);

    if (this.toolMode === 'calibrate_scale') {
      if (!this.calibrationStart) {
        this.calibrationStart = world;
      } else {
        const dist = distance2D(this.calibrationStart, world);
        if (dist > 0.1) {
          this.callbacks.onCalibrationMeasured?.({
            pointA: this.calibrationStart,
            pointB: world,
            currentDistanceMeters: Number(dist.toFixed(3)),
          });
        }
        this.calibrationStart = null;
      }
      this.render();
      return;
    }

    if (this.toolMode === 'draw_wall') {
      const snapped = this.snapWorldPoint(world);
      if (!this.drawWallStart) {
        this.drawWallStart = snapped;
      } else {
        const updated = addWallToScene(this.sceneData, this.drawWallStart, snapped, false);
        this.sceneData = updated;
        this.drawWallStart = snapped;
        this.callbacks.onSceneChange?.(deepClone(this.sceneData), true);
      }
      this.render();
      return;
    }

    if (this.toolMode === 'add_door' || this.toolMode === 'add_window') {
      const wallHit = this.findNearestWall(world, 0.35);
      if (wallHit) {
        const next = deepClone(this.sceneData);
        const floorId = wallHit.wall.floorId;
        const posT = clamp(wallHit.t, 0.12, 0.88);
        if (this.toolMode === 'add_door') {
          const newDoor: DoorData = {
            id: `door-${Date.now().toString(36)}`,
            floorId,
            wallId: wallHit.wall.id,
            positionAlongWall: Number(posT.toFixed(3)),
            width: 0.86,
            height: 2.15,
            doorType: 'hinged',
            isOpen: true,
            swingDirection: 'left',
            materialId: 'timber-coastal-oak',
            frameMaterialId: 'paint-crisp-white',
          };
          next.doors.push(newDoor);
          this.selection = { kind: 'door', id: newDoor.id };
        } else {
          const newWin: WindowData = {
            id: `win-${Date.now().toString(36)}`,
            floorId,
            wallId: wallHit.wall.id,
            positionAlongWall: Number(posT.toFixed(3)),
            width: 1.6,
            height: 1.35,
            sillHeight: 0.85,
            panels: 2,
            glassMaterialId: 'glass-architectural-clear',
            frameMaterialId: 'metal-monument-matte',
          };
          next.windows.push(newWin);
          this.selection = { kind: 'window', id: newWin.id };
        }
        this.sceneData = next;
        this.toolMode = 'select';
        this.callbacks.onSceneChange?.(deepClone(this.sceneData), true);
        this.callbacks.onSelect?.(this.selection);
        this.render();
      }
      return;
    }

    // Select mode:
    // 1. Check wall endpoint handle grab (within 10px)
    const grabRadiusMeters = 10 / this.zoomPxPerMeter;
    for (const w of this.sceneData.walls) {
      if (distance2D(world, w.start) <= grabRadiusMeters) {
        this.preDragSnapshot = deepClone(this.sceneData);
        this.draggingVertexAnchor = { ...w.start };
        this.selection = { kind: 'wall', id: w.id };
        this.callbacks.onSelect?.(this.selection);
        this.render();
        return;
      }
      if (distance2D(world, w.end) <= grabRadiusMeters) {
        this.preDragSnapshot = deepClone(this.sceneData);
        this.draggingVertexAnchor = { ...w.end };
        this.selection = { kind: 'wall', id: w.id };
        this.callbacks.onSelect?.(this.selection);
        this.render();
        return;
      }
    }

    // 2. Check door / window hit
    const openingHit = this.findOpeningAt(world);
    if (openingHit) {
      this.preDragSnapshot = deepClone(this.sceneData);
      this.draggingOpening = openingHit;
      this.selection = { kind: openingHit.kind, id: openingHit.id };
      this.callbacks.onSelect?.(this.selection);
      this.render();
      return;
    }

    // 3. Check wall segment hit
    const wallHit = this.findNearestWall(world, Math.max(0.22, 8 / this.zoomPxPerMeter));
    if (wallHit) {
      this.selection = { kind: 'wall', id: wallHit.wall.id };
      this.callbacks.onSelect?.(this.selection);
      this.render();
      return;
    }

    // 4. Check room polygon hit
    const roomHit = this.sceneData.rooms.find((r: RoomData) => pointInPolygon(world, r.polygon));
    if (roomHit) {
      this.selection = { kind: 'room', id: roomHit.id };
      this.callbacks.onSelect?.(this.selection);
      this.render();
      return;
    }

    // 5. Empty space drag pans viewport!
    this.selection = null;
    this.callbacks.onSelect?.(null);
    this.isPanning = true;
    this.render();
  }

  private handlePointerMove(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = this.screenToWorld(sx, sy);
    this.hoverWorld = world;

    if (this.isPanning) {
      const dx = sx - this.lastPointerScreen.x;
      const dy = sy - this.lastPointerScreen.y;
      this.lastPointerScreen = { x: sx, y: sy };
      this.panCenterWorld.x -= dx / this.zoomPxPerMeter;
      this.panCenterWorld.z -= dy / this.zoomPxPerMeter;
      this.render();
      return;
    }

    if (this.draggingVertexAnchor && this.preDragSnapshot) {
      const updated = moveSharedWallVertex(this.preDragSnapshot, this.draggingVertexAnchor, world, 0.05);
      this.sceneData = updated;
      this.callbacks.onSceneChange?.(deepClone(this.sceneData), false);
      this.render();
      return;
    }

    if (this.draggingOpening) {
      const hostWall = this.sceneData.walls.find((w) => w.id === this.draggingOpening?.wallId);
      if (hostWall) {
        const proj = projectPointOnSegment(world, hostWall.start, hostWall.end);
        const clampedT = Number(clamp(proj.t, 0.08, 0.92).toFixed(3));
        if (this.draggingOpening.kind === 'door') {
          const d = this.sceneData.doors.find((x) => x.id === this.draggingOpening?.id);
          if (d) d.positionAlongWall = clampedT;
        } else {
          const w = this.sceneData.windows.find((x) => x.id === this.draggingOpening?.id);
          if (w) w.positionAlongWall = clampedT;
        }
        this.callbacks.onSceneChange?.(deepClone(this.sceneData), false);
        this.render();
      }
      return;
    }

    if (this.drawWallStart || this.calibrationStart) {
      this.render();
    }
  }

  private handlePointerUp(_e: PointerEvent): void {
    this.isPanning = false;
    if (this.draggingVertexAnchor || this.draggingOpening) {
      this.draggingVertexAnchor = null;
      this.draggingOpening = null;
      this.preDragSnapshot = null;
      this.callbacks.onSceneChange?.(deepClone(this.sceneData), true);
      this.render();
    }
  }

  private findNearestWall(
    pt: Point2D,
    maxDistMeters: number,
  ): { wall: WallData; t: number; distance: number } | null {
    let best: { wall: WallData; t: number; distance: number } | null = null;
    for (const wall of this.sceneData.walls) {
      const proj = projectPointOnSegment(pt, wall.start, wall.end);
      if (proj.distance <= maxDistMeters && (!best || proj.distance < best.distance)) {
        best = { wall, t: proj.t, distance: proj.distance };
      }
    }
    return best;
  }

  private findOpeningAt(pt: Point2D): { kind: 'door' | 'window'; id: string; wallId: string } | null {
    const wallById = new Map(this.sceneData.walls.map((w) => [w.id, w]));
    for (const door of this.sceneData.doors) {
      const w = wallById.get(door.wallId);
      if (!w) continue;
      const center = lerpPoint2D(w.start, w.end, door.positionAlongWall);
      if (distance2D(pt, center) <= Math.max(0.35, door.width * 0.45)) {
        return { kind: 'door', id: door.id, wallId: w.id };
      }
    }
    for (const win of this.sceneData.windows) {
      const w = wallById.get(win.wallId);
      if (!w) continue;
      const center = lerpPoint2D(w.start, w.end, win.positionAlongWall);
      if (distance2D(pt, center) <= Math.max(0.35, win.width * 0.45)) {
        return { kind: 'window', id: win.id, wallId: w.id };
      }
    }
    return null;
  }

  public render(): void {
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 600;
    const ctx = this.ctx;

    // 1. Crisp Warm Architectural Vellum Paper Background + Metric Grid
    ctx.fillStyle = '#f8f6f1';
    ctx.fillRect(0, 0, w, h);

    this.drawMetricGrid(w, h);
    this.drawBackgroundOverlay();
    this.drawRooms();
    this.drawWallsAndDimensions();
    this.drawDoorsAndWindows();
    this.drawInteractiveOverlays();
    this.drawNorthCompass(w - 44, 44);
  }

  private drawMetricGrid(w: number, h: number): void {
    const ctx = this.ctx;
    const topLeft = this.screenToWorld(0, 0);
    const botRight = this.screenToWorld(w, h);

    const startX = Math.floor(topLeft.x);
    const endX = Math.ceil(botRight.x);
    const startZ = Math.floor(topLeft.z);
    const endZ = Math.ceil(botRight.z);

    ctx.lineWidth = 1;
    for (let x = startX; x <= endX; x++) {
      const sx = this.worldToScreen({ x, z: 0 }).x;
      ctx.strokeStyle = x % 5 === 0 ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.16)';
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
      ctx.stroke();
    }
    for (let z = startZ; z <= endZ; z++) {
      const sy = this.worldToScreen({ x: 0, z }).y;
      ctx.strokeStyle = z % 5 === 0 ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.16)';
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
      ctx.stroke();
    }
  }

  private drawBackgroundOverlay(): void {
    const ov = this.sceneData.floorplanOverlay;
    if (!this.bgImage || !ov) return;
    const ctx = this.ctx;
    const widthMeters = this.bgImage.naturalWidth / Math.max(1, ov.pixelsPerMeter);
    const heightMeters = this.bgImage.naturalHeight / Math.max(1, ov.pixelsPerMeter);
    const topLeftScreen = this.worldToScreen({
      x: ov.offsetX - widthMeters * 0.5,
      z: ov.offsetZ - heightMeters * 0.5,
    });
    ctx.save();
    ctx.globalAlpha = ov.opacity;
    ctx.drawImage(
      this.bgImage,
      topLeftScreen.x,
      topLeftScreen.y,
      widthMeters * this.zoomPxPerMeter,
      heightMeters * this.zoomPxPerMeter,
    );
    ctx.restore();
  }

  private drawRooms(): void {
    const ctx = this.ctx;
    for (const room of this.sceneData.rooms) {
      if (room.polygon.length < 3) continue;
      ctx.beginPath();
      room.polygon.forEach((p, idx) => {
        const s = this.worldToScreen(p);
        if (idx === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();

      const isSelected = this.selection?.kind === 'room' && this.selection.id === room.id;
      ctx.fillStyle = isSelected
        ? 'rgba(14, 165, 233, 0.24)'
        : (ROOM_FILL_COLORS[room.roomType] ?? 'rgba(226, 232, 240, 0.45)');
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Room label + metric area (m²), constrained cleanly inside room width
      const centroid = polygonCentroid(room.polygon);
      const bounds = polygonBounds(room.polygon);
      const centerPx = this.worldToScreen(centroid);
      const area = polygonAreaSqm(room.polygon);
      const maxLabelPx = Math.max(34, bounds.width * this.zoomPxPerMeter - 8);
      const titleFontPx = Math.round(clamp(this.zoomPxPerMeter * 0.32, 9, 12));
      const subFontPx = Math.round(clamp(this.zoomPxPerMeter * 0.28, 8, 11));

      ctx.fillStyle = '#1e293b';
      ctx.font = `600 ${titleFontPx}px Inter, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(room.name, centerPx.x, centerPx.y - 3, maxLabelPx);
      ctx.fillStyle = '#475569';
      ctx.font = `500 ${subFontPx}px Inter, -apple-system, sans-serif`;
      ctx.fillText(formatAreaSqm(area), centerPx.x, centerPx.y + subFontPx + 1, maxLabelPx);
    }
  }

  private drawWallsAndDimensions(): void {
    const ctx = this.ctx;
    const vertices = new Map<string, Point2D>();

    for (const wall of this.sceneData.walls) {
      const a = this.worldToScreen(wall.start);
      const b = this.worldToScreen(wall.end);
      const isSelected = this.selection?.kind === 'wall' && this.selection.id === wall.id;

      ctx.strokeStyle = isSelected ? '#0284c7' : wall.isExterior ? '#1e293b' : '#475569';
      ctx.lineWidth = Math.max(3, wall.thickness * this.zoomPxPerMeter);
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      vertices.set(`${wall.start.x.toFixed(2)},${wall.start.z.toFixed(2)}`, wall.start);
      vertices.set(`${wall.end.x.toFixed(2)},${wall.end.z.toFixed(2)}`, wall.end);

      // Metric dimension label on exterior & selected walls
      const len = distance2D(wall.start, wall.end);
      if ((wall.isExterior || isSelected) && len >= 1.0 && this.zoomPxPerMeter >= 22) {
        const mid = lerpPoint2D(wall.start, wall.end, 0.5);
        const n = wallNormal(wall.start, wall.end);
        const labelWorld = { x: mid.x + n.x * 0.45, z: mid.z + n.z * 0.45 };
        const lp = this.worldToScreen(labelWorld);
        const text = formatMetres(len, this.displayUnit);

        ctx.save();
        ctx.font = '600 10px ui-monospace, SFMono-Regular, monospace';
        const tw = ctx.measureText(text).width + 8;
        ctx.fillStyle = isSelected ? '#e0f2fe' : 'rgba(255,255,255,0.88)';
        ctx.fillRect(lp.x - tw * 0.5, lp.y - 8, tw, 16);
        ctx.fillStyle = isSelected ? '#0369a1' : '#334155';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, lp.x, lp.y);
        ctx.restore();
      }
    }

    // Draw draggable vertex handles
    for (const pt of vertices.values()) {
      const sp = this.worldToScreen(pt);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawDoorsAndWindows(): void {
    const ctx = this.ctx;
    const wallById = new Map(this.sceneData.walls.map((w) => [w.id, w]));

    for (const door of this.sceneData.doors) {
      const wall = wallById.get(door.wallId);
      if (!wall) continue;
      const center = lerpPoint2D(wall.start, wall.end, door.positionAlongWall);
      const dir = wallDirection(wall.start, wall.end);
      const halfW = door.width * 0.5;
      const p0 = this.worldToScreen({ x: center.x - dir.x * halfW, z: center.z - dir.z * halfW });
      const p1 = this.worldToScreen({ x: center.x + dir.x * halfW, z: center.z + dir.z * halfW });
      const isSelected = this.selection?.kind === 'door' && this.selection.id === door.id;

      // Clear wall segment behind door opening
      ctx.strokeStyle = '#f8f6f1';
      ctx.lineWidth = Math.max(5, (wall.thickness + 0.04) * this.zoomPxPerMeter);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();

      // Architectural door leaf & swing arc
      ctx.strokeStyle = isSelected ? '#0284c7' : '#b45309';
      ctx.lineWidth = 2;
      if (door.doorType === 'sliding_glass') {
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (door.doorType !== 'opening') {
        const radiusPx = door.width * this.zoomPxPerMeter;
        const baseAngle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(
          p0.x + Math.cos(baseAngle - Math.PI * 0.42) * radiusPx,
          p0.y + Math.sin(baseAngle - Math.PI * 0.42) * radiusPx,
        );
        ctx.stroke();

        ctx.strokeStyle = 'rgba(180, 83, 9, 0.38)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p0.x, p0.y, radiusPx, baseAngle - Math.PI * 0.42, baseAngle);
        ctx.stroke();
      }
    }

    for (const win of this.sceneData.windows) {
      const wall = wallById.get(win.wallId);
      if (!wall) continue;
      const center = lerpPoint2D(wall.start, wall.end, win.positionAlongWall);
      const dir = wallDirection(wall.start, wall.end);
      const halfW = win.width * 0.5;
      const p0 = this.worldToScreen({ x: center.x - dir.x * halfW, z: center.z - dir.z * halfW });
      const p1 = this.worldToScreen({ x: center.x + dir.x * halfW, z: center.z + dir.z * halfW });
      const isSelected = this.selection?.kind === 'window' && this.selection.id === win.id;

      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = Math.max(4, wall.thickness * this.zoomPxPerMeter);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();

      ctx.strokeStyle = isSelected ? '#0284c7' : '#0ea5e9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }

  private drawInteractiveOverlays(): void {
    const ctx = this.ctx;
    if (this.drawWallStart && this.hoverWorld) {
      const snapped = this.snapWorldPoint(this.hoverWorld);
      const a = this.worldToScreen(this.drawWallStart);
      const b = this.worldToScreen(snapped);
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (this.calibrationStart && this.hoverWorld) {
      const a = this.worldToScreen(this.calibrationStart);
      const b = this.worldToScreen(this.hoverWorld);
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  private drawNorthCompass(cx: number, cy: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.rotate((-this.sceneData.property.orientationDegrees * Math.PI) / 180);
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(5, 4);
    ctx.lineTo(-5, 4);
    ctx.closePath();
    ctx.fill();

    ctx.font = '700 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, 15);
    ctx.restore();
  }

  public dispose(): void {
    this.canvas.removeEventListener('wheel', this.boundWheel);
    this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
    this.canvas.removeEventListener('pointermove', this.boundPointerMove);
    window.removeEventListener('pointerup', this.boundPointerUp);
    this.resizeObserver?.disconnect();
    this.canvas.remove();
  }
}
