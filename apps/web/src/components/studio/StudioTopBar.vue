<script setup lang="ts">
import type { TimeOfDayPreset } from '@kujiale/scene-schema';
import type { QualityProfileName } from '@kujiale/three-engine';
import {
  ArrowLeft,
  Camera,
  Eye,
  Footprints,
  Home,
  Layers,
  Redo2,
  Save,
  Settings,
  Sun,
  Undo2,
} from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { useProjectStore } from '@/stores/projectStore';

const emit = defineEmits<{
  (e: 'capture-snapshot'): void;
}>();

const store = useProjectStore();
const router = useRouter();

const timePresets: Array<{ id: TimeOfDayPreset; label: string }> = [
  { id: 'morning', label: 'Morning' },
  { id: 'noon', label: 'Noon' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
];

const qualityOptions: QualityProfileName[] = ['low', 'medium', 'high', 'ultra'];
</script>

<template>
  <header
    class="h-13 shrink-0 bg-white border-b border-stone-200 px-3 md:px-4 flex items-center justify-between gap-2 z-30"
  >
    <!-- Left: Back to Dashboard + Project Title & Australian City Badge -->
    <div class="flex items-center gap-2.5 min-w-0">
      <button
        type="button"
        class="p-1.5 rounded-lg text-slate-600 hover:bg-stone-100 hover:text-slate-900 transition"
        title="Back to Projects"
        @click="router.push('/')"
      >
        <ArrowLeft class="w-4 h-4" />
      </button>
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="font-semibold text-sm text-slate-900 truncate">
            {{ store.activeProject?.name ?? 'Sydney Coastal Pavilion' }}
          </span>
          <span
            class="hidden sm:inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
          >
            {{ store.sceneData.property.city }}, AU · {{ store.metrics.totalBuildingAreaSqm.toFixed(0) }} m²
          </span>
        </div>
      </div>
    </div>

    <!-- Center: 2D/3D Layout & Camera Mode Switchers -->
    <div class="flex items-center gap-2">
      <!-- Workspace View Mode -->
      <div class="hidden lg:flex items-center rounded-lg bg-stone-100 p-0.5 text-xs font-medium">
        <button
          type="button"
          class="px-2.5 py-1 rounded-md transition"
          :class="store.workspaceLayout === '3d_only' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'"
          @click="store.workspaceLayout = '3d_only'"
        >
          3D Studio
        </button>
        <button
          type="button"
          class="px-2.5 py-1 rounded-md transition"
          :class="store.workspaceLayout === 'split_2d_3d' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'"
          @click="store.workspaceLayout = 'split_2d_3d'"
        >
          Split 2D / 3D
        </button>
        <button
          type="button"
          class="px-2.5 py-1 rounded-md transition"
          :class="store.workspaceLayout === '2d_only' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'"
          @click="store.workspaceLayout = '2d_only'"
        >
          2D Floor Plan
        </button>
      </div>

      <!-- 3D Camera Switcher -->
      <div
        v-if="store.workspaceLayout !== '2d_only'"
        class="flex items-center rounded-lg bg-stone-100 p-0.5 text-xs font-medium"
      >
        <button
          type="button"
          class="flex items-center gap-1 px-2.5 py-1 rounded-md transition"
          :class="store.cameraMode === 'orbit' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'"
          @click="store.cameraMode = 'orbit'"
        >
          <Eye class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">Orbit</span>
        </button>
        <button
          type="button"
          class="flex items-center gap-1 px-2.5 py-1 rounded-md transition"
          :class="store.cameraMode === 'first_person' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'"
          @click="store.cameraMode = 'first_person'"
        >
          <Footprints class="w-3.5 h-3.5" />
          <span>Walkthrough</span>
        </button>
        <button
          type="button"
          class="flex items-center gap-1 px-2.5 py-1 rounded-md transition"
          :class="store.cameraMode === 'top_down' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'"
          @click="store.cameraMode = 'top_down'"
        >
          <Layers class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">Top-Down</span>
        </button>
      </div>

      <!-- Dollhouse Roof Cutaway Toggle -->
      <button
        v-if="store.workspaceLayout !== '2d_only' && store.cameraMode === 'orbit'"
        type="button"
        class="hidden md:flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition"
        :class="
          store.roofCutaway
            ? 'border-sky-500 bg-sky-50 text-sky-800'
            : 'border-stone-200 bg-white text-slate-700 hover:bg-stone-50'
        "
        title="Hide roof & ceilings in Orbit view to inspect interior rooms"
        @click="store.roofCutaway = !store.roofCutaway"
      >
        <Home class="w-3.5 h-3.5" />
        <span>{{ store.roofCutaway ? 'Show Roof' : 'Cutaway Roof' }}</span>
      </button>

      <!-- Southern Hemisphere Sunlight Time-of-Day -->
      <div class="hidden xl:flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-0.5 text-xs">
        <Sun class="w-3.5 h-3.5 text-amber-500 mr-0.5" />
        <button
          v-for="tp in timePresets"
          :key="tp.id"
          type="button"
          class="px-2 py-0.5 rounded-md transition"
          :class="
            store.sceneData.lighting.timeOfDay === tp.id
              ? 'bg-amber-100 text-amber-900 font-semibold'
              : 'text-slate-600 hover:bg-stone-100'
          "
          @click="store.setTimeOfDay(tp.id)"
        >
          {{ tp.label }}
        </button>
      </div>
    </div>

    <!-- Right: Telemetry, Quality, Undo/Redo, Snapshot & Save -->
    <div class="flex items-center gap-1.5">
      <!-- Real Measured FPS Badge -->
      <div
        v-if="store.performanceMetrics && store.workspaceLayout !== '2d_only'"
        class="hidden 2xl:flex items-center gap-1.5 rounded-md bg-stone-100 px-2 py-1 font-mono text-[11px] text-slate-600"
        title="Real-time measured WebGL2 performance"
      >
        <span class="font-semibold text-emerald-700">{{ store.performanceMetrics.fps }} FPS</span>
        <span>·</span>
        <span>{{ store.performanceMetrics.drawCalls }} draws</span>
      </div>

      <select
        v-model="store.qualityProfile"
        aria-label="Graphics Quality Profile"
        class="hidden md:block rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
      >
        <option v-for="q in qualityOptions" :key="q" :value="q">
          Quality: {{ q.toUpperCase() }}
        </option>
      </select>

      <button
        type="button"
        :disabled="!store.canUndo"
        class="p-1.5 rounded-lg text-slate-600 hover:bg-stone-100 disabled:opacity-35"
        title="Undo"
        @click="store.undo"
      >
        <Undo2 class="w-4 h-4" />
      </button>
      <button
        type="button"
        :disabled="!store.canRedo"
        class="p-1.5 rounded-lg text-slate-600 hover:bg-stone-100 disabled:opacity-35"
        title="Redo"
        @click="store.redo"
      >
        <Redo2 class="w-4 h-4" />
      </button>

      <button
        type="button"
        class="hidden sm:flex items-center gap-1 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 px-2.5 py-1.5 text-xs font-medium text-slate-700"
        title="Export HD Snapshot"
        @click="emit('capture-snapshot')"
      >
        <Camera class="w-3.5 h-3.5" />
        <span class="hidden lg:inline">Snapshot</span>
      </button>

      <button
        type="button"
        :disabled="store.isSavingScene"
        class="flex items-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60"
        @click="store.saveCurrentScene"
      >
        <Save class="w-3.5 h-3.5" />
        <span>{{ store.isSavingScene ? 'Saving…' : store.hasUnsavedChanges ? 'Save*' : 'Saved' }}</span>
      </button>

      <button
        type="button"
        class="p-1.5 rounded-lg text-slate-600 hover:bg-stone-100"
        title="Platform Settings"
        @click="router.push('/settings')"
      >
        <Settings class="w-4 h-4" />
      </button>
    </div>
  </header>
</template>
