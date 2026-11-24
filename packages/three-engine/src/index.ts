import { AssetManager } from '@kujiale/asset-manager';
import {
  buildFurnitureItemGroup,
  constrainFurniturePositionToRoom,
} from '@kujiale/furniture';
import { generateHouse3D, type GeneratedHouseHierarchy } from '@kujiale/house-generator';
import { generateLandscape3D } from '@kujiale/landscape';
import { LightingSystem, type SolarPositionResult } from '@kujiale/lighting';
import { MaterialSystem, type TextureQualityTier } from '@kujiale/materials';
import { deepClone, type Point2D } from '@kujiale/shared';
import type { SceneData } from '@kujiale/scene-schema';
import { WalkthroughController, type CameraNavigationMode } from '@kujiale/walkthrough';
import * as THREE from 'three';

export type QualityProfileName = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityProfileSpec {
  name: QualityProfileName;
  maxPixelRatio: number;
  shadowMapSize: number;
  shadowsEnabled: boolean;
  textureTier: TextureQualityTier;
  vegetationDensity: number;
  antialias: boolean;
}

export const QUALITY_PROFILES: Record<QualityProfileName, QualityProfileSpec> = {
  low: {
    name: 'low',
    maxPixelRatio: 1.0,
    shadowMapSize: 1024,
    shadowsEnabled: false,
    textureTier: 'low',
    vegetationDensity: 0.28,
    antialias: false,
  },
  medium: {
    name: 'medium',
    maxPixelRatio: 1.5,
    shadowMapSize: 1536,
    shadowsEnabled: true,
    textureTier: 'medium',
    vegetationDensity: 0.6,
    antialias: true,
  },
  high: {
    name: 'high',
    maxPixelRatio: 2.0,
    shadowMapSize: 2048,
    shadowsEnabled: true,
    textureTier: 'high',
    vegetationDensity: 1.0,
    antialias: true,
  },
  ultra: {
    name: 'ultra',
    maxPixelRatio: 2.5,
    shadowMapSize: 4096,
    shadowsEnabled: true,
    textureTier: 'ultra',
    vegetationDensity: 1.0,
    antialias: true,
  },
};

export interface SelectedEntityInfo {
  entityType: 'room' | 'wall' | 'door' | 'window' | 'furniture' | 'roof';
  entityId: string;
  roomId?: string;
  surfaceRole?: 'floor' | 'wall' | 'exterior_wall' | 'ceiling' | 'roof';
  materialId?: string;
}

export interface EnginePerformanceMetrics {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  geometriesInGpu: number;
  texturesInGpu: number;
  qualityProfile: QualityProfileName;
  rendererBackend: 'webgl2';
}

export interface HouseSceneEngineCallbacks {
  onSelect?: (selection: SelectedEntityInfo | null) => void;
  onFurnitureTransformEnd?: (
    furnitureId: string,
    newPosition: { x: number; y: number; z: number },
    roomId?: string,
  ) => void;
  onDoorToggle?: (doorId: string) => void;
  onMetrics?: (metrics: EnginePerformanceMetrics) => void;
}

/**
 * Renderer Adapter interface isolating WebGL2 details so future WebGPURenderer
 * integration does not alter scene graph or business logic.
 */
export interface RendererAdapter {
  readonly backend: 'webgl2';
  readonly domElement: HTMLCanvasElement;
  readonly rawRenderer: THREE.WebGLRenderer;
  setSize(width: number, height: number, maxPixelRatio: number): void;
  setExposure(exposure: number): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
}

export class WebGL2RendererAdapter implements RendererAdapter {
  public readonly backend = 'webgl2' as const;
  public readonly rawRenderer: THREE.WebGLRenderer;

  constructor(container: HTMLElement, antialias = true) {
    this.rawRenderer = new THREE.WebGLRenderer({
      antialias,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true, // Enables reliable HD architectural snapshot export
    });
    this.rawRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this.rawRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.rawRenderer.toneMappingExposure = 1.08;
    this.rawRenderer.shadowMap.enabled = true;
    this.rawRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.rawRenderer.domElement);
  }

  public get domElement(): HTMLCanvasElement {
    return this.rawRenderer.domElement;
  }

  public setSize(width: number, height: number, maxPixelRatio: number): void {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.rawRenderer.setPixelRatio(Math.min(dpr, maxPixelRatio));
    this.rawRenderer.setSize(Math.max(1, width), Math.max(1, height), true);
  }

  public setExposure(exposure: number): void {
    this.rawRenderer.toneMappingExposure = exposure;
  }

  public render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.rawRenderer.render(scene, camera);
  }

  public dispose(): void {
    this.rawRenderer.dispose();
    this.rawRenderer.domElement.remove();
  }
}

export class HouseSceneEngine {
  public readonly scene = new THREE.Scene();
  public readonly materials: MaterialSystem;
  public readonly lighting: LightingSystem;
  public readonly walkthrough: WalkthroughController;
  public readonly assetManager: AssetManager;

  private readonly container: HTMLElement | null;
  private readonly rendererAdapter: RendererAdapter | null;
  private readonly callbacks: HouseSceneEngineCallbacks;

  private qualityProfile: QualityProfileSpec;
  private currentSceneData: SceneData | null = null;
  private houseHierarchy: GeneratedHouseHierarchy | null = null;
  private landscapeRoot: THREE.Group | null = null;
  private furnitureRoot: THREE.Group | null = null;
  private furnitureGroupById = new Map<string, THREE.Group>();
  private loadAbortController: AbortController | null = null;

  private roofCutaway = false;
  private selectedEntity: SelectedEntityInfo | null = null;
  private selectionBoxHelper: THREE.BoxHelper | null = null;

  // Raycast & interactive furniture dragging state
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.16);
  private draggingFurnitureId: string | null = null;
  private dragOffsetXZ: Point2D = { x: 0, z: 0 };
  private pointerDownPos: { x: number; y: number } | null = null;
  private didDragFurniture = false;

  // Animation & telemetry loop
  private rafId: number | null = null;
  private isDisposed = false;
  private lastFrameTime = 0;
  private frameCounter = 0;
  private fpsWindowStart = 0;
  private latestMetrics: EnginePerformanceMetrics;
  private resizeObserver: ResizeObserver | null = null;

  private readonly onPointerDownBound: (e: PointerEvent) => void;
  private readonly onPointerMoveBound: (e: PointerEvent) => void;
  private readonly onPointerUpBound: (e: PointerEvent) => void;
  private readonly onDblClickBound: (e: MouseEvent) => void;

  constructor(options?: {
    container?: HTMLElement;
    quality?: QualityProfileName;
    callbacks?: HouseSceneEngineCallbacks;
  }) {
    const initialQuality = options?.quality ?? 'high';
    this.qualityProfile = QUALITY_PROFILES[initialQuality];
    this.callbacks = options?.callbacks ?? {};
    this.container = options?.container ?? null;

    this.materials = new MaterialSystem(this.qualityProfile.textureTier);
    this.lighting = new LightingSystem(this.qualityProfile.shadowMapSize);
    this.assetManager = new AssetManager();
    this.scene.fog = new THREE.FogExp2(0xe6dfd5, 0.0055);
    this.scene.add(this.lighting.root);

    if (this.container) {
      this.rendererAdapter = new WebGL2RendererAdapter(
        this.container,
        this.qualityProfile.antialias,
      );
      const rect = this.container.getBoundingClientRect();
      const w = Math.max(320, rect.width || 1280);
      const h = Math.max(240, rect.height || 720);
      this.rendererAdapter.setSize(w, h, this.qualityProfile.maxPixelRatio);
      this.walkthrough = new WalkthroughController(w / h, this.rendererAdapter.domElement);
    } else {
      // Headless unit test mode
      this.rendererAdapter = null;
      this.walkthrough = new WalkthroughController(16 / 9);
    }

    this.latestMetrics = {
      fps: 60,
      frameTimeMs: 16.6,
      drawCalls: 0,
      triangles: 0,
      geometriesInGpu: 0,
      texturesInGpu: 0,
      qualityProfile: initialQuality,
      rendererBackend: 'webgl2',
    };

    this.onPointerDownBound = (e) => this.handlePointerDown(e);
    this.onPointerMoveBound = (e) => this.handlePointerMove(e);
    this.onPointerUpBound = (e) => this.handlePointerUp(e);
    this.onDblClickBound = (e) => this.handleDoubleClick(e);

    if (this.rendererAdapter && this.container) {
      const canvas = this.rendererAdapter.domElement;
      canvas.addEventListener('pointerdown', this.onPointerDownBound);
      canvas.addEventListener('pointermove', this.onPointerMoveBound);
      window.addEventListener('pointerup', this.onPointerUpBound);
      canvas.addEventListener('dblclick', this.onDblClickBound);

      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const { width, height } = entry.contentRect;
            if (width > 10 && height > 10) {
              this.resize(width, height);
            }
          }
        });
        this.resizeObserver.observe(this.container);
      }
    }
  }

  public startRenderLoop(): void {
    if (this.rafId !== null || this.isDisposed || !this.rendererAdapter) return;
    this.lastFrameTime = performance.now();
    this.fpsWindowStart = this.lastFrameTime;
    this.frameCounter = 0;

    const tick = (now: number) => {
      if (this.isDisposed) return;
      this.rafId = requestAnimationFrame(tick);

      const dt = Math.min(0.1, (now - this.lastFrameTime) / 1000);
      this.lastFrameTime = now;

      this.walkthrough.update(dt);

      if (this.currentSceneData && this.rendererAdapter) {
        const exp = this.lighting.updateExposure(
          this.walkthrough.camera.position,
          this.currentSceneData.rooms,
          this.currentSceneData.lighting,
          dt,
        );
        this.rendererAdapter.setExposure(exp);
      }

      if (this.selectionBoxHelper) {
        this.selectionBoxHelper.update();
      }

      this.rendererAdapter?.render(this.scene, this.walkthrough.camera);

      this.frameCounter++;
      const elapsedWindow = now - this.fpsWindowStart;
      if (elapsedWindow >= 750 && this.rendererAdapter) {
        const fps = Math.round((this.frameCounter * 1000) / elapsedWindow);
        const info = this.rendererAdapter.rawRenderer.info;
        this.latestMetrics = {
          fps,
          frameTimeMs: Number((elapsedWindow / Math.max(1, this.frameCounter)).toFixed(1)),
          drawCalls: info.render.calls,
          triangles: info.render.triangles,
          geometriesInGpu: info.memory.geometries,
          texturesInGpu: info.memory.textures,
          qualityProfile: this.qualityProfile.name,
          rendererBackend: 'webgl2',
        };
        this.callbacks.onMetrics?.(this.latestMetrics);
        this.fpsWindowStart = now;
        this.frameCounter = 0;
      }
    };

    this.rafId = requestAnimationFrame(tick);
  }

  public stopRenderLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public resize(width: number, height: number): void {
    this.walkthrough.setAspect(width / height);
    this.rendererAdapter?.setSize(width, height, this.qualityProfile.maxPixelRatio);
  }

  public setQualityProfile(profileName: QualityProfileName): void {
    this.qualityProfile = QUALITY_PROFILES[profileName];
    this.materials.setQualityTier(this.qualityProfile.textureTier);
    this.lighting.setShadowMapResolution(
      this.qualityProfile.shadowMapSize,
      this.qualityProfile.shadowsEnabled && (this.currentSceneData?.lighting.shadowsEnabled ?? true),
    );
    if (this.container && this.rendererAdapter) {
      const rect = this.container.getBoundingClientRect();
      this.rendererAdapter.setSize(
        rect.width || 1280,
        rect.height || 720,
        this.qualityProfile.maxPixelRatio,
      );
    }
    if (this.currentSceneData) {
      this.loadScene(this.currentSceneData);
    }
  }

  public setNavigationMode(mode: CameraNavigationMode): void {
    this.walkthrough.setMode(mode);
    this.syncRoofAndCeilingVisibility();
  }

  public setRoofCutaway(cutaway: boolean): void {
    this.roofCutaway = cutaway;
    this.syncRoofAndCeilingVisibility();
  }

  public getRoofCutaway(): boolean {
    return this.roofCutaway;
  }

  private syncRoofAndCeilingVisibility(): void {
    if (!this.houseHierarchy) return;
    const hideOverhead = this.walkthrough.getMode() === 'top_down' || this.roofCutaway;
    this.houseHierarchy.roofGroup.visible = !hideOverhead;
    this.houseHierarchy.ceilingsGroup.visible = !hideOverhead;
  }

  public getSolarPosition(): SolarPositionResult | null {
    return this.lighting.getSolarPosition();
  }

  public getPerformanceMetrics(): EnginePerformanceMetrics {
    return this.latestMetrics;
  }

  /**
   * Synchronizes the 3D scene graph cleanly with authoritative SceneData JSON,
   * properly disposing replaced GPU geometries and cancelling stale async loads.
   */
  public loadScene(sceneData: SceneData): void {
    this.loadAbortController?.abort();
    this.loadAbortController = new AbortController();
    const signal = this.loadAbortController.signal;

    this.currentSceneData = deepClone(sceneData);
    this.materials.applyOverrides(sceneData.materials);

    // Dispose previous subtrees without leaking GPU buffers
    if (this.houseHierarchy) {
      this.scene.remove(this.houseHierarchy.root);
      AssetManager.disposeSubtreeGeometries(this.houseHierarchy.root);
    }
    if (this.landscapeRoot) {
      this.scene.remove(this.landscapeRoot);
      AssetManager.disposeSubtreeGeometries(this.landscapeRoot);
    }
    if (this.furnitureRoot) {
      this.scene.remove(this.furnitureRoot);
      AssetManager.disposeSubtreeGeometries(this.furnitureRoot);
    }
    this.furnitureGroupById.clear();

    // 1. Build Procedural House
    this.houseHierarchy = generateHouse3D(sceneData, this.materials);
    this.scene.add(this.houseHierarchy.root);

    // 2. Build Australian Landscape
    this.landscapeRoot = generateLandscape3D(sceneData, this.materials, {
      vegetationDensityMultiplier: this.qualityProfile.vegetationDensity,
      enableLod: this.qualityProfile.name !== 'ultra',
    });
    this.scene.add(this.landscapeRoot);

    // 3. Build Furniture Items
    this.furnitureRoot = new THREE.Group();
    this.furnitureRoot.name = 'FurnitureRoot';
    for (const item of sceneData.furniture) {
      const fGroup = buildFurnitureItemGroup(item, this.materials, this.assetManager, signal);
      this.furnitureGroupById.set(item.id, fGroup);
      this.furnitureRoot.add(fGroup);
    }
    this.scene.add(this.furnitureRoot);

    // 4. Configure Southern Hemisphere Solar Lighting & Reflections
    const effectiveLighting = {
      ...sceneData.lighting,
      shadowsEnabled: sceneData.lighting.shadowsEnabled && this.qualityProfile.shadowsEnabled,
    };
    this.lighting.applyConfig(
      this.scene,
      sceneData.property,
      effectiveLighting,
      sceneData.rooms,
      this.rendererAdapter?.rawRenderer,
    );

    // 5. Update Walkthrough Colliders & Overhead Visibility
    this.walkthrough.syncSceneData(sceneData);
    this.syncRoofAndCeilingVisibility();
    this.refreshSelectionHighlight();
  }

  public selectEntityById(entityType: SelectedEntityInfo['entityType'], entityId: string): void {
    if (!this.currentSceneData) return;
    if (entityType === 'furniture') {
      const f = this.currentSceneData.furniture.find((x) => x.id === entityId);
      if (f) {
        this.selectedEntity = {
          entityType: 'furniture',
          entityId: f.id,
          roomId: f.roomId,
          materialId: f.primaryMaterialId,
        };
      }
    } else if (entityType === 'room') {
      const r = this.currentSceneData.rooms.find((x) => x.id === entityId);
      if (r) {
        this.selectedEntity = {
          entityType: 'room',
          entityId: r.id,
          roomId: r.id,
          surfaceRole: 'floor',
          materialId: r.floorMaterialId,
        };
      }
    }
    this.refreshSelectionHighlight();
    this.callbacks.onSelect?.(this.selectedEntity);
  }

  private refreshSelectionHighlight(): void {
    if (this.selectionBoxHelper) {
      this.scene.remove(this.selectionBoxHelper);
      this.selectionBoxHelper.dispose();
      this.selectionBoxHelper = null;
    }
    if (!this.selectedEntity) return;

    let targetObj: THREE.Object3D | undefined;
    if (this.selectedEntity.entityType === 'furniture') {
      targetObj = this.furnitureGroupById.get(this.selectedEntity.entityId);
    } else if (this.selectedEntity.entityType === 'room' && this.houseHierarchy) {
      targetObj = this.houseHierarchy.floorsGroup.getObjectByName(
        `floor-${this.selectedEntity.entityId}`,
      );
    }
    if (targetObj) {
      this.selectionBoxHelper = new THREE.BoxHelper(targetObj, 0x0ea5e9);
      this.scene.add(this.selectionBoxHelper);
    }
  }

  private updatePointerNdc(e: MouseEvent | PointerEvent): void {
    if (!this.rendererAdapter) return;
    const rect = this.rendererAdapter.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private pickSceneEntity(e: MouseEvent | PointerEvent): {
    info: SelectedEntityInfo;
    point: THREE.Vector3;
  } | null {
    this.updatePointerNdc(e);
    this.raycaster.setFromCamera(this.pointerNdc, this.walkthrough.camera);

    const pickRoots: THREE.Object3D[] = [];
    if (this.furnitureRoot) pickRoots.push(this.furnitureRoot);
    if (this.houseHierarchy) {
      pickRoots.push(
        this.houseHierarchy.openingsGroup,
        this.houseHierarchy.wallsGroup,
        this.houseHierarchy.floorsGroup,
      );
      if (this.houseHierarchy.roofGroup.visible) {
        pickRoots.push(this.houseHierarchy.roofGroup);
      }
    }

    const hits = this.raycaster.intersectObjects(pickRoots, true);
    for (const hit of hits) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur) {
        const ud = cur.userData as Partial<SelectedEntityInfo> | undefined;
        if (ud?.entityType && ud.entityId) {
          return {
            info: {
              entityType: ud.entityType,
              entityId: ud.entityId,
              roomId: ud.roomId,
              surfaceRole: ud.surfaceRole,
              materialId: ud.materialId,
            },
            point: hit.point,
          };
        }
        cur = cur.parent;
      }
    }
    return null;
  }

  private handlePointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
    this.didDragFurniture = false;

    if (this.walkthrough.getMode() === 'first_person') return;

    const picked = this.pickSceneEntity(e);
    if (
      picked?.info.entityType === 'furniture' &&
      this.selectedEntity?.entityType === 'furniture' &&
      this.selectedEntity.entityId === picked.info.entityId &&
      this.currentSceneData
    ) {
      const furn = this.currentSceneData.furniture.find((f) => f.id === picked.info.entityId);
      if (furn) {
        this.draggingFurnitureId = furn.id;
        this.dragPlane.constant = -furn.position.y;
        const planeHit = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.dragPlane, planeHit)) {
          this.dragOffsetXZ = {
            x: furn.position.x - planeHit.x,
            z: furn.position.z - planeHit.z,
          };
        }
        this.walkthrough.orbitControls.enabled = false;
      }
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.draggingFurnitureId || !this.currentSceneData) return;
    this.updatePointerNdc(e);
    this.raycaster.setFromCamera(this.pointerNdc, this.walkthrough.camera);
    const planeHit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, planeHit)) return;

    const furn = this.currentSceneData.furniture.find((f) => f.id === this.draggingFurnitureId);
    const group = this.furnitureGroupById.get(this.draggingFurnitureId);
    if (!furn || !group) return;

    const desiredXZ = {
      x: planeHit.x + this.dragOffsetXZ.x,
      z: planeHit.z + this.dragOffsetXZ.z,
    };
    const constrained = constrainFurniturePositionToRoom(furn, desiredXZ, this.currentSceneData);
    group.position.x = constrained.position.x;
    group.position.z = constrained.position.z;
    furn.position.x = constrained.position.x;
    furn.position.z = constrained.position.z;
    furn.roomId = constrained.roomId;
    this.didDragFurniture = true;
    this.selectionBoxHelper?.update();
  }

  private handlePointerUp(e: PointerEvent): void {
    if (this.draggingFurnitureId && this.currentSceneData) {
      const furn = this.currentSceneData.furniture.find((f) => f.id === this.draggingFurnitureId);
      this.draggingFurnitureId = null;
      if (this.walkthrough.getMode() !== 'first_person') {
        this.walkthrough.orbitControls.enabled = true;
      }
      if (this.didDragFurniture && furn) {
        this.callbacks.onFurnitureTransformEnd?.(furn.id, { ...furn.position }, furn.roomId);
        return;
      }
    }

    if (!this.pointerDownPos) return;
    const moveDist = Math.hypot(
      e.clientX - this.pointerDownPos.x,
      e.clientY - this.pointerDownPos.y,
    );
    this.pointerDownPos = null;
    if (moveDist > 6) return; // Was an orbit/look drag, not a click

    const picked = this.pickSceneEntity(e);
    this.selectedEntity = picked ? picked.info : null;
    this.refreshSelectionHighlight();
    this.callbacks.onSelect?.(this.selectedEntity);
  }

  private handleDoubleClick(e: MouseEvent): void {
    const picked = this.pickSceneEntity(e);
    if (picked?.info.entityType === 'door') {
      this.callbacks.onDoorToggle?.(picked.info.entityId);
    }
  }

  /**
   * Renders a crisp architectural frame and returns a PNG DataURL for saving or sharing.
   */
  public captureSnapshotDataUrl(): string | null {
    if (!this.rendererAdapter) return null;
    const prevHelperVis = this.selectionBoxHelper?.visible ?? false;
    if (this.selectionBoxHelper) this.selectionBoxHelper.visible = false;
    this.rendererAdapter.render(this.scene, this.walkthrough.camera);
    const dataUrl = this.rendererAdapter.domElement.toDataURL('image/png');
    if (this.selectionBoxHelper) this.selectionBoxHelper.visible = prevHelperVis;
    return dataUrl;
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.stopRenderLoop();
    this.loadAbortController?.abort();

    if (this.rendererAdapter) {
      const canvas = this.rendererAdapter.domElement;
      canvas.removeEventListener('pointerdown', this.onPointerDownBound);
      canvas.removeEventListener('pointermove', this.onPointerMoveBound);
      window.removeEventListener('pointerup', this.onPointerUpBound);
      canvas.removeEventListener('dblclick', this.onDblClickBound);
    }
    this.resizeObserver?.disconnect();

    if (this.selectionBoxHelper) {
      this.selectionBoxHelper.dispose();
    }
    if (this.houseHierarchy) {
      AssetManager.disposeSubtreeGeometries(this.houseHierarchy.root);
    }
    if (this.landscapeRoot) {
      AssetManager.disposeSubtreeGeometries(this.landscapeRoot);
    }
    if (this.furnitureRoot) {
      AssetManager.disposeSubtreeGeometries(this.furnitureRoot);
    }

    this.walkthrough.dispose();
    this.lighting.dispose();
    this.materials.dispose();
    this.assetManager.disposeAll();
    this.rendererAdapter?.dispose();
  }
}
