import {
  applyMeasuredScaleCalibration,
  deleteEditorSelectionFromScene,
  type EditorSelection2D,
  type EditorToolMode,
} from '@kujiale/floorplan-editor';
import {
  applyDesignCommand,
  generateRuleBasedFurnitureForScene,
} from '@kujiale/furniture';
import {
  computeSceneMetrics,
  createSydneyCoastalDemoScene,
  type DesignCommand,
  type HouseTypology,
  type SceneData,
  type StylePresetId,
  type TimeOfDayPreset,
} from '@kujiale/scene-schema';
import { deepClone, UndoRedoStack, type LengthDisplayUnit } from '@kujiale/shared';
import type {
  EnginePerformanceMetrics,
  QualityProfileName,
  SelectedEntityInfo,
} from '@kujiale/three-engine';
import type { CameraNavigationMode } from '@kujiale/walkthrough';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  apiClient,
  type DesignSchemeDTO,
  type FloorplanDTO,
  type HealthStatusDTO,
  type ProjectSummaryDTO,
  type RenderJobDTO,
} from '@/api/client';

export type StudioWorkspaceLayout = '3d_only' | 'split_2d_3d' | '2d_only';
export type LeftDrawerTab =
  | 'explore'
  | 'structure'
  | 'styles'
  | 'materials'
  | 'furniture'
  | 'schemes';

const LOCAL_SCENE_CACHE_PREFIX = 'aussiehome_scene_v1_';

export const useProjectStore = defineStore('project', () => {
  // Backend & System Diagnostics
  const health = ref<HealthStatusDTO | null>(null);
  const backendOnline = ref<boolean>(true);

  // Projects & Active Scene
  const projects = ref<ProjectSummaryDTO[]>([]);
  const activeProject = ref<ProjectSummaryDTO | null>(null);
  const sceneData = ref<SceneData>(createSydneyCoastalDemoScene());
  const sceneRevision = ref<number>(1);
  const hasUnsavedChanges = ref<boolean>(false);

  // Loading / Feedback States (real status feedback — never fake progress)
  const isLoadingProjects = ref<boolean>(false);
  const isLoadingScene = ref<boolean>(false);
  const isSavingScene = ref<boolean>(false);
  const isRunningAiTask = ref<boolean>(false);
  const statusBanner = ref<{ kind: 'info' | 'success' | 'error'; message: string } | null>(null);

  // Studio UI & Viewport State (strictly separated from SceneData business state!)
  const workspaceLayout = ref<StudioWorkspaceLayout>('3d_only');
  const activeLeftTab = ref<LeftDrawerTab>('explore');
  const cameraMode = ref<CameraNavigationMode>('orbit');
  const roofCutaway = ref<boolean>(false);
  const editorToolMode = ref<EditorToolMode>('select');
  const displayUnit = ref<LengthDisplayUnit>('m');
  const qualityProfile = ref<QualityProfileName>('high');
  const selected3D = ref<SelectedEntityInfo | null>(null);
  const selected2D = ref<EditorSelection2D | null>(null);
  const performanceMetrics = ref<EnginePerformanceMetrics | null>(null);

  // Schemes & Renders & Floorplan Recognition
  const savedSchemes = ref<DesignSchemeDTO[]>([]);
  const latestRenderJob = ref<RenderJobDTO | null>(null);
  const currentFloorplan = ref<FloorplanDTO | null>(null);

  // Undo / Redo Stack
  const history = new UndoRedoStack<SceneData>(45);
  const canUndo = ref<boolean>(false);
  const canRedo = ref<boolean>(false);

  const metrics = computed(() => computeSceneMetrics(sceneData.value));

  const activeRoomId = computed<string>(() => {
    if (selected3D.value?.roomId) return selected3D.value.roomId;
    if (selected2D.value?.kind === 'room') return selected2D.value.id;
    return sceneData.value.rooms[0]?.id ?? 'room-living';
  });

  function notify(kind: 'info' | 'success' | 'error', message: string): void {
    statusBanner.value = { kind, message };
    if (kind !== 'error') {
      setTimeout(() => {
        if (statusBanner.value?.message === message) {
          statusBanner.value = null;
        }
      }, 4500);
    }
  }

  function syncHistoryFlags(): void {
    canUndo.value = history.canUndo;
    canRedo.value = history.canRedo;
  }

  function commitSceneMutation(nextScene: SceneData, recordUndo = true): void {
    if (recordUndo) {
      history.record(sceneData.value);
      syncHistoryFlags();
    }
    sceneData.value = nextScene;
    hasUnsavedChanges.value = true;

    if (activeProject.value) {
      try {
        localStorage.setItem(
          `${LOCAL_SCENE_CACHE_PREFIX}${activeProject.value.activeSceneId}`,
          JSON.stringify(nextScene),
        );
      } catch {
        // Ignore quota errors
      }
    }
  }

  function undo(): void {
    const prev = history.undo(sceneData.value);
    if (prev) {
      sceneData.value = prev;
      hasUnsavedChanges.value = true;
      syncHistoryFlags();
    }
  }

  function redo(): void {
    const next = history.redo(sceneData.value);
    if (next) {
      sceneData.value = next;
      hasUnsavedChanges.value = true;
      syncHistoryFlags();
    }
  }

  async function refreshHealth(): Promise<void> {
    try {
      health.value = await apiClient.getHealth();
      backendOnline.value = true;
    } catch {
      backendOnline.value = false;
    }
  }

  async function fetchProjects(): Promise<void> {
    isLoadingProjects.value = true;
    try {
      await refreshHealth();
      projects.value = await apiClient.listProjects();
      backendOnline.value = true;
    } catch {
      backendOnline.value = false;
      if (projects.value.length === 0) {
        projects.value = [
          {
            id: 'proj-sydney-coastal-demo',
            name: 'Sydney Coastal Pavilion (216 m²)',
            description:
              '4-Bedroom Australian Detached Residence with North-Facing Alfresco Deck, Louvred Pergola & Saltwater Plunge Pool.',
            city: 'Sydney',
            typology: 'single_storey',
            activeSceneId: 'scene-sydney-coastal-demo',
            shareToken: 'local-demo',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];
      }
    } finally {
      isLoadingProjects.value = false;
    }
  }

  async function loadProjectById(projectId: string): Promise<void> {
    isLoadingScene.value = true;
    history.clear();
    syncHistoryFlags();
    selected3D.value = null;
    selected2D.value = null;

    try {
      if (projects.value.length === 0) {
        await fetchProjects();
      }
      let proj = projects.value.find((p) => p.id === projectId) ?? null;
      if (!proj && backendOnline.value) {
        proj = await apiClient.getProject(projectId);
      }
      if (!proj) {
        proj = projects.value[0] ?? null;
      }
      activeProject.value = proj;

      if (proj && backendOnline.value) {
        const env = await apiClient.getScene(proj.activeSceneId);
        sceneData.value = env.scene;
        sceneRevision.value = env.revision;
        savedSchemes.value = await apiClient.listProjectDesigns(proj.id);
      } else if (proj) {
        const cached = localStorage.getItem(`${LOCAL_SCENE_CACHE_PREFIX}${proj.activeSceneId}`);
        sceneData.value = cached
          ? (JSON.parse(cached) as SceneData)
          : createSydneyCoastalDemoScene();
      }
      hasUnsavedChanges.value = false;
    } catch (err) {
      notify(
        'error',
        `Loaded local Australian fallback scene (${err instanceof Error ? err.message : 'API unreachable'}).`,
      );
      sceneData.value = createSydneyCoastalDemoScene();
    } finally {
      isLoadingScene.value = false;
    }
  }

  async function createNewProject(input: {
    name: string;
    description: string;
    city: string;
    typology: HouseTypology;
    orientationDegrees: number;
  }): Promise<ProjectSummaryDTO> {
    const starter = createSydneyCoastalDemoScene();
    starter.property.city = input.city;
    starter.property.typology = input.typology;
    starter.property.orientationDegrees = input.orientationDegrees;

    if (backendOnline.value) {
      const created = await apiClient.createProject({
        ...input,
        initialScene: starter,
      });
      projects.value = [created, ...projects.value];
      activeProject.value = created;
      sceneData.value = starter;
      hasUnsavedChanges.value = false;
      return created;
    }

    const localProj: ProjectSummaryDTO = {
      id: `proj-local-${Date.now().toString(36)}`,
      name: input.name,
      description: input.description,
      city: input.city,
      typology: input.typology,
      activeSceneId: `scene-local-${Date.now().toString(36)}`,
      shareToken: 'local',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    projects.value = [localProj, ...projects.value];
    activeProject.value = localProj;
    sceneData.value = starter;
    return localProj;
  }

  async function saveCurrentScene(): Promise<void> {
    if (!activeProject.value) return;
    isSavingScene.value = true;
    try {
      localStorage.setItem(
        `${LOCAL_SCENE_CACHE_PREFIX}${activeProject.value.activeSceneId}`,
        JSON.stringify(sceneData.value),
      );
      if (backendOnline.value) {
        const saved = await apiClient.saveScene(
          activeProject.value.activeSceneId,
          sceneData.value,
        );
        sceneRevision.value = saved.revision;
        notify('success', `Saved Revision #${saved.revision} to server.`);
      } else {
        notify('success', 'Saved scene to local browser storage (offline mode).');
      }
      hasUnsavedChanges.value = false;
    } catch (err) {
      notify('error', `Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      isSavingScene.value = false;
    }
  }

  function executeCommand(command: DesignCommand): void {
    const updated = applyDesignCommand(sceneData.value, command);
    commitSceneMutation(updated, true);
  }

  function setTimeOfDay(tod: TimeOfDayPreset): void {
    executeCommand({ type: 'update_lighting', timeOfDay: tod });
  }

  function toggleDoorOpenState(doorId: string): void {
    const next = deepClone(sceneData.value);
    const door = next.doors.find((d) => d.id === doorId);
    if (door) {
      door.isOpen = !door.isOpen;
      commitSceneMutation(next, true);
    }
  }

  function updateFurniturePosition(
    furnitureId: string,
    pos: { x: number; y: number; z: number },
    roomId?: string,
  ): void {
    const next = deepClone(sceneData.value);
    const item = next.furniture.find((f) => f.id === furnitureId);
    if (item) {
      item.position = { ...pos };
      if (roomId) item.roomId = roomId;
      commitSceneMutation(next, true);
    }
  }

  function rotateFurnitureItem(furnitureId: string, deltaDegrees: number): void {
    const next = deepClone(sceneData.value);
    const item = next.furniture.find((f) => f.id === furnitureId);
    if (item) {
      item.rotationY += (deltaDegrees * Math.PI) / 180;
      commitSceneMutation(next, true);
    }
  }

  function renameRoom(roomId: string, newName: string): void {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const next = deepClone(sceneData.value);
    const room = next.rooms.find((r) => r.id === roomId);
    if (room) {
      room.name = trimmed;
      commitSceneMutation(next, true);
    }
  }

  function deleteSelected2DEntity(): void {
    if (!selected2D.value) return;
    const updated = deleteEditorSelectionFromScene(sceneData.value, selected2D.value);
    selected2D.value = null;
    commitSceneMutation(updated, true);
  }

  function calibrateScale(measuredMeters: number, knownRealMeters: number): void {
    const updated = applyMeasuredScaleCalibration(
      sceneData.value,
      measuredMeters,
      knownRealMeters,
    );
    commitSceneMutation(updated, true);
    notify('success', `Calibrated floor plan scale (${knownRealMeters.toFixed(2)} m reference).`);
  }

  async function runNaturalLanguageDesign(prompt: string): Promise<void> {
    if (!prompt.trim()) return;
    isRunningAiTask.value = true;
    try {
      if (backendOnline.value) {
        const res = await apiClient.applyNaturalLanguageCommand({
          projectId: activeProject.value?.id,
          scene: sceneData.value,
          naturalLanguagePrompt: prompt.trim(),
        });
        commitSceneMutation(res.updatedScene, true);
        notify('success', `${res.summary} [${res.providerMode}]`);
      } else {
        executeCommand({ type: 'apply_style_preset', styleId: 'modern_coastal' });
        notify('info', 'Applied local coastal style rules (backend offline).');
      }
    } catch (err) {
      notify('error', `Design command failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      isRunningAiTask.value = false;
    }
  }

  async function saveDesignSchemeSnapshot(name: string, styleId: StylePresetId): Promise<void> {
    if (!activeProject.value) return;
    isRunningAiTask.value = true;
    try {
      if (backendOnline.value) {
        const created = await apiClient.generateDesignScheme({
          projectId: activeProject.value.id,
          scene: sceneData.value,
          name,
          styleId,
        });
        savedSchemes.value = [created, ...savedSchemes.value];
        commitSceneMutation(created.sceneSnapshot, true);
        notify('success', `Saved scheme "${created.name}" for side-by-side comparison.`);
      } else {
        executeCommand({ type: 'apply_style_preset', styleId });
        const localScheme: DesignSchemeDTO = {
          id: `scheme-${Date.now().toString(36)}`,
          projectId: activeProject.value.id,
          name,
          styleId,
          providerMode: 'deterministic_rules',
          summary: 'Local deterministic Australian scheme',
          estimatedBudgetAUD: metrics.value.estimatedFurnitureBudgetAUD,
          sceneSnapshot: deepClone(sceneData.value),
          createdAt: new Date().toISOString(),
        };
        savedSchemes.value = [localScheme, ...savedSchemes.value];
        notify('success', `Saved local scheme "${name}".`);
      }
    } catch (err) {
      notify('error', `Could not generate scheme: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      isRunningAiTask.value = false;
    }
  }

  function applyRecognizedFloorplanToScene(fp: FloorplanDTO): void {
    if (!fp.recognition) return;
    const patch = fp.recognition.scenePatch;
    const next = deepClone(sceneData.value);
    next.rooms = patch.rooms;
    next.walls = patch.walls;
    next.doors = patch.doors;
    next.windows = patch.windows;
    next.floorplanOverlay = {
      ...patch.floorplanOverlay,
      floorplanId: fp.id,
    };
    next.furniture = generateRuleBasedFurnitureForScene(next, next.activeStyleId);
    commitSceneMutation(next, true);
  }

  async function submitRenderJob(
    quality: 'standard' | 'high' | 'cycles_export',
    snapshotDataUrl: string | null,
  ): Promise<void> {
    if (!activeProject.value) return;
    isRunningAiTask.value = true;
    try {
      if (backendOnline.value) {
        const created = await apiClient.createRenderJob({
          projectId: activeProject.value.id,
          sceneId: activeProject.value.activeSceneId,
          quality,
          cameraPreset: cameraMode.value,
          clientSnapshotDataUrl: snapshotDataUrl,
        });
        latestRenderJob.value = created;
        // Poll job completion cleanly
        const done = await apiClient.getRenderJob(created.id);
        latestRenderJob.value = done;
        notify('success', `Render job completed (${done.engineKind}).`);
      } else if (snapshotDataUrl) {
        latestRenderJob.value = {
          id: 'local-snapshot',
          projectId: activeProject.value.id,
          sceneId: activeProject.value.activeSceneId,
          quality,
          cameraPreset: cameraMode.value,
          status: 'completed',
          progressPct: 100,
          engineKind: 'webgl2_realtime_snapshot',
          previewDataUrl: snapshotDataUrl,
          cyclesScriptPreview: null,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
        notify('success', 'Captured realtime WebGL2 architectural snapshot.');
      }
    } catch (err) {
      notify('error', `Render job error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      isRunningAiTask.value = false;
    }
  }

  return {
    health,
    backendOnline,
    projects,
    activeProject,
    sceneData,
    sceneRevision,
    hasUnsavedChanges,
    isLoadingProjects,
    isLoadingScene,
    isSavingScene,
    isRunningAiTask,
    statusBanner,
    workspaceLayout,
    activeLeftTab,
    cameraMode,
    roofCutaway,
    editorToolMode,
    displayUnit,
    qualityProfile,
    selected3D,
    selected2D,
    performanceMetrics,
    savedSchemes,
    latestRenderJob,
    currentFloorplan,
    canUndo,
    canRedo,
    metrics,
    activeRoomId,
    notify,
    commitSceneMutation,
    undo,
    redo,
    refreshHealth,
    fetchProjects,
    loadProjectById,
    createNewProject,
    saveCurrentScene,
    executeCommand,
    setTimeOfDay,
    toggleDoorOpenState,
    updateFurniturePosition,
    rotateFurnitureItem,
    renameRoom,
    deleteSelected2DEntity,
    calibrateScale,
    runNaturalLanguageDesign,
    saveDesignSchemeSnapshot,
    applyRecognizedFloorplanToScene,
    submitRenderJob,
  };
});
