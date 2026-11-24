<script setup lang="ts">
import {
  FloorplanEditor2D,
  type ScaleCalibrationSample,
} from '@kujiale/floorplan-editor';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useProjectStore } from '@/stores/projectStore';

const store = useProjectStore();
const containerRef = ref<HTMLDivElement | null>(null);
const calibrationSample = ref<ScaleCalibrationSample | null>(null);
const knownLengthInput = ref<number>(5.7);

let editor: FloorplanEditor2D | null = null;
let suppressEcho = false;

function fitView(): void {
  editor?.fitToView();
}

function confirmCalibration(): void {
  if (!calibrationSample.value || knownLengthInput.value <= 0.1) return;
  store.calibrateScale(calibrationSample.value.currentDistanceMeters, knownLengthInput.value);
  calibrationSample.value = null;
  store.editorToolMode = 'select';
}

defineExpose({ fitView });

onMounted(() => {
  if (!containerRef.value) return;
  editor = new FloorplanEditor2D(containerRef.value, store.sceneData, {
    onSceneChange: (nextScene, commitHistory) => {
      suppressEcho = true;
      store.commitSceneMutation(nextScene, commitHistory);
      queueMicrotask(() => {
        suppressEcho = false;
      });
    },
    onSelect: (sel) => {
      store.selected2D = sel;
    },
    onCalibrationMeasured: (sample) => {
      calibrationSample.value = sample;
      knownLengthInput.value = Number(sample.currentDistanceMeters.toFixed(2));
    },
  });
  editor.setToolMode(store.editorToolMode);
  editor.setDisplayUnit(store.displayUnit);
  editor.fitToView();
});

watch(
  () => store.sceneData,
  (next) => {
    if (!suppressEcho) {
      editor?.setSceneData(next);
    }
  },
  { deep: true },
);

watch(
  () => store.editorToolMode,
  (mode) => {
    editor?.setToolMode(mode);
  },
);

watch(
  () => store.displayUnit,
  (unit) => {
    editor?.setDisplayUnit(unit);
  },
);

onBeforeUnmount(() => {
  editor?.dispose();
  editor = null;
});
</script>

<template>
  <div class="relative w-full h-full bg-[#f8f6f1] overflow-hidden select-none">
    <div ref="containerRef" class="w-full h-full" />

    <!-- Floating 2D Floor Plan Toolbar -->
    <div
      class="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 rounded-xl bg-white/95 p-1.5 shadow-md border border-stone-200 text-xs"
    >
      <button
        type="button"
        class="px-2.5 py-1.5 rounded-lg font-medium transition"
        :class="store.editorToolMode === 'select' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-stone-100'"
        @click="store.editorToolMode = 'select'"
      >
        Select / Drag Wall
      </button>
      <button
        type="button"
        class="px-2.5 py-1.5 rounded-lg font-medium transition"
        :class="store.editorToolMode === 'draw_wall' ? 'bg-sky-600 text-white' : 'text-slate-700 hover:bg-stone-100'"
        @click="store.editorToolMode = 'draw_wall'"
      >
        + Wall
      </button>
      <button
        type="button"
        class="px-2.5 py-1.5 rounded-lg font-medium transition"
        :class="store.editorToolMode === 'add_door' ? 'bg-sky-600 text-white' : 'text-slate-700 hover:bg-stone-100'"
        @click="store.editorToolMode = 'add_door'"
      >
        + Door
      </button>
      <button
        type="button"
        class="px-2.5 py-1.5 rounded-lg font-medium transition"
        :class="store.editorToolMode === 'add_window' ? 'bg-sky-600 text-white' : 'text-slate-700 hover:bg-stone-100'"
        @click="store.editorToolMode = 'add_window'"
      >
        + Window
      </button>
      <button
        type="button"
        class="px-2.5 py-1.5 rounded-lg font-medium transition"
        :class="store.editorToolMode === 'calibrate_scale' ? 'bg-amber-600 text-white' : 'text-slate-700 hover:bg-stone-100'"
        @click="store.editorToolMode = 'calibrate_scale'"
      >
        Calibrate Scale
      </button>
      <button
        type="button"
        class="px-2.5 py-1.5 rounded-lg text-slate-600 hover:bg-stone-100 font-medium"
        @click="fitView"
      >
        Fit View
      </button>
      <button
        v-if="store.selected2D && store.selected2D.kind !== 'room'"
        type="button"
        class="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-medium"
        @click="store.deleteSelected2DEntity"
      >
        Delete {{ store.selected2D.kind }}
      </button>
    </div>

    <!-- Interactive 2-Point Scale Calibration Dialog -->
    <div
      v-if="calibrationSample"
      class="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 rounded-2xl bg-white p-4 shadow-xl border border-stone-200 flex items-center gap-3 text-xs"
    >
      <div>
        <div class="font-semibold text-slate-900">Confirm Known Dimension (Metres)</div>
        <div class="text-slate-500">
          Current span: {{ calibrationSample.currentDistanceMeters.toFixed(2) }} m
        </div>
      </div>
      <input
        v-model.number="knownLengthInput"
        type="number"
        step="0.05"
        min="0.3"
        max="50"
        class="w-24 rounded-lg border border-stone-300 px-2.5 py-1.5 font-mono text-sm"
      />
      <button
        type="button"
        class="rounded-lg bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 font-semibold"
        @click="confirmCalibration"
      >
        Apply Scale
      </button>
      <button
        type="button"
        class="rounded-lg text-slate-500 hover:bg-stone-100 px-2 py-1.5"
        @click="calibrationSample = null"
      >
        Cancel
      </button>
    </div>
  </div>
</template>
