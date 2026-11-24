import type { HouseTypology, SceneData, StylePresetId } from '@kujiale/scene-schema';

export interface HealthStatusDTO {
  status: string;
  service: string;
  environment: string;
  databaseConnected: boolean;
  storageBackend: string;
  aiProviderMode: 'gemini' | 'assisted_demo';
  aiKeyConfigured: boolean;
  locale: string;
  units: string;
}

export interface ProjectSummaryDTO {
  id: string;
  name: string;
  description: string;
  city: string;
  typology: HouseTypology;
  activeSceneId: string;
  shareToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface SceneEnvelopeDTO {
  id: string;
  projectId: string;
  revision: number;
  scene: SceneData;
  updatedAt: string;
}

export interface FloorplanRecognitionPayload {
  providerMode: string;
  requiresScaleCalibration: boolean;
  requiresUserReview: boolean;
  overallConfidence: number;
  warnings: string[];
  detectedImageWidthPx: number;
  detectedImageHeightPx: number;
  estimatedPixelsPerMeter: number;
  scenePatch: {
    rooms: SceneData['rooms'];
    walls: SceneData['walls'];
    doors: SceneData['doors'];
    windows: SceneData['windows'];
    floorplanOverlay: NonNullable<SceneData['floorplanOverlay']>;
  };
}

export interface FloorplanDTO {
  id: string;
  projectId: string | null;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  status: 'uploaded' | 'processing' | 'completed' | 'failed';
  providerMode: string;
  overallConfidence: number | null;
  previewUrl: string;
  recognition: FloorplanRecognitionPayload | null;
  createdAt: string;
}

export interface DesignSchemeDTO {
  id: string;
  projectId: string;
  name: string;
  styleId: StylePresetId;
  providerMode: string;
  summary: string;
  estimatedBudgetAUD: number;
  sceneSnapshot: SceneData;
  createdAt: string;
}

export interface RenderJobDTO {
  id: string;
  projectId: string;
  sceneId: string;
  quality: string;
  cameraPreset: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progressPct: number;
  engineKind: string;
  previewDataUrl: string | null;
  cyclesScriptPreview: string | null;
  createdAt: string;
  completedAt: string | null;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api/v1';

async function requestJson<T>(path: string, init?: RequestInit, timeoutMs = 25000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const errJson = (await res.json()) as { detail?: string };
        if (errJson.detail) detail = errJson.detail;
      } catch {
        // ignore JSON parse fallback
      }
      throw new Error(detail);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const apiClient = {
  getHealth(): Promise<HealthStatusDTO> {
    return requestJson<HealthStatusDTO>('/health');
  },

  listProjects(): Promise<ProjectSummaryDTO[]> {
    return requestJson<ProjectSummaryDTO[]>('/projects');
  },

  getProject(id: string): Promise<ProjectSummaryDTO> {
    return requestJson<ProjectSummaryDTO>(`/projects/${encodeURIComponent(id)}`);
  },

  createProject(payload: {
    name: string;
    description: string;
    city: string;
    typology: HouseTypology;
    orientationDegrees: number;
    initialScene?: SceneData;
  }): Promise<ProjectSummaryDTO> {
    return requestJson<ProjectSummaryDTO>('/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  patchProject(
    id: string,
    payload: { name?: string; description?: string; city?: string },
  ): Promise<ProjectSummaryDTO> {
    return requestJson<ProjectSummaryDTO>(`/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  getScene(sceneId: string): Promise<SceneEnvelopeDTO> {
    return requestJson<SceneEnvelopeDTO>(`/scenes/${encodeURIComponent(sceneId)}`);
  },

  saveScene(sceneId: string, scene: SceneData): Promise<SceneEnvelopeDTO> {
    return requestJson<SceneEnvelopeDTO>(`/scenes/${encodeURIComponent(sceneId)}`, {
      method: 'PUT',
      body: JSON.stringify(scene),
    });
  },

  uploadFloorplan(file: File, projectId?: string): Promise<FloorplanDTO> {
    const fd = new FormData();
    fd.append('file', file);
    if (projectId) fd.append('project_id', projectId);
    return requestJson<FloorplanDTO>('/floorplans/upload', {
      method: 'POST',
      body: fd,
    });
  },

  recognizeFloorplan(
    floorplanId: string,
    knownWallLengthMeters?: number,
  ): Promise<FloorplanDTO> {
    return requestJson<FloorplanDTO>(`/floorplans/${encodeURIComponent(floorplanId)}/recognize`, {
      method: 'POST',
      body: JSON.stringify(
        knownWallLengthMeters ? { knownWallLengthMeters } : {},
      ),
    });
  },

  generateDesignScheme(payload: {
    projectId: string;
    scene: SceneData;
    name: string;
    styleId: StylePresetId;
    prompt?: string;
  }): Promise<DesignSchemeDTO> {
    return requestJson<DesignSchemeDTO>('/designs/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  applyNaturalLanguageCommand(payload: {
    projectId?: string;
    scene: SceneData;
    naturalLanguagePrompt: string;
  }): Promise<{
    providerMode: string;
    summary: string;
    detectedStyle: StylePresetId;
    targetRoomId: string | null;
    commands: unknown[];
    updatedScene: SceneData;
  }> {
    return requestJson('/designs/apply-command', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  listProjectDesigns(projectId: string): Promise<DesignSchemeDTO[]> {
    return requestJson<DesignSchemeDTO[]>(
      `/projects/${encodeURIComponent(projectId)}/designs`,
    );
  },

  createRenderJob(payload: {
    projectId: string;
    sceneId: string;
    quality: 'standard' | 'high' | 'cycles_export';
    cameraPreset: string;
    clientSnapshotDataUrl?: string | null;
  }): Promise<RenderJobDTO> {
    return requestJson<RenderJobDTO>('/renders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getRenderJob(renderId: string): Promise<RenderJobDTO> {
    return requestJson<RenderJobDTO>(`/renders/${encodeURIComponent(renderId)}`);
  },
};
