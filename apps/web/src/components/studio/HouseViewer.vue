<script setup lang="ts">
import { HouseSceneEngine } from '@kujiale/three-engine';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useProjectStore } from '@/stores/projectStore';

const store = useProjectStore();
const viewportRef = ref<HTMLDivElement | null>(null);
let engine: HouseSceneEngine | null = null;

function teleportTo(zone: string): void {
  engine?.walkthrough.teleportToPreset(zone);
}

function setVirtualJoystick(mx: number, my: number): void {
  engine?.walkthrough.setVirtualJoystick(mx, my);
}

function applyTouchLook(dx: number, dy: number): void {
  engine?.walkthrough.applyLookDelta(dx, dy, 0.004);
}

function setWalkSpeed(speed: number): void {
  engine?.walkthrough.setWalkSpeed(speed);
}

function requestPointerLock(): void {
  engine?.walkthrough.requestPointerLock();
}

function captureSnapshot(): string | null {
  return engine?.captureSnapshotDataUrl() ?? null;
}

defineExpose({
  teleportTo,
  setVirtualJoystick,
  applyTouchLook,
  setWalkSpeed,
  requestPointerLock,
  captureSnapshot,
});

onMounted(() => {
  if (!viewportRef.value) return;
  engine = new HouseSceneEngine({
    container: viewportRef.value,
    quality: store.qualityProfile,
    callbacks: {
      onSelect: (sel) => {
        store.selected3D = sel;
      },
      onFurnitureTransformEnd: (furnId, newPos, roomId) => {
        store.updateFurniturePosition(furnId, newPos, roomId);
      },
      onDoorToggle: (doorId) => {
        store.toggleDoorOpenState(doorId);
      },
      onMetrics: (metrics) => {
        store.performanceMetrics = metrics;
      },
    },
  });

  engine.loadScene(store.sceneData);
  engine.setNavigationMode(store.cameraMode);
  engine.setRoofCutaway(store.roofCutaway);
  engine.startRenderLoop();
});

watch(
  () => store.sceneData,
  (nextScene) => {
    engine?.loadScene(nextScene);
  },
  { deep: true },
);

watch(
  () => store.cameraMode,
  (mode) => {
    engine?.setNavigationMode(mode);
  },
);

watch(
  () => store.roofCutaway,
  (cutaway) => {
    engine?.setRoofCutaway(cutaway);
  },
);

watch(
  () => store.qualityProfile,
  (profile) => {
    engine?.setQualityProfile(profile);
  },
);

onBeforeUnmount(() => {
  engine?.dispose();
  engine = null;
});
</script>

<template>
  <div class="relative w-full h-full overflow-hidden bg-slate-900 select-none">
    <div ref="viewportRef" class="w-full h-full" />

    <!-- Subtle Walkthrough Controls HUD Pill -->
    <div
      v-if="store.cameraMode === 'first_person'"
      class="pointer-events-auto absolute bottom-5 left-1/2 -translate-x-1/2 hidden md:flex items-center gap-3 rounded-full bg-slate-950/75 px-4 py-2 text-xs text-slate-100 backdrop-blur-md border border-white/10 shadow-lg"
    >
      <span><kbd class="px-1.5 py-0.5 bg-white/15 rounded">W A S D</kbd> Walk Indoors &amp; Backyard</span>
      <span class="text-slate-400">·</span>
      <span>Drag or Lock Mouse to Look</span>
      <span class="text-slate-400">·</span>
      <span>Double-click Door to Open/Close</span>
      <button
        type="button"
        class="ml-1 rounded-full bg-sky-500/90 hover:bg-sky-400 px-2.5 py-0.5 text-[11px] font-semibold text-slate-950 transition"
        @click="requestPointerLock"
      >
        Lock Pointer
      </button>
    </div>

    <!-- Center Crosshair in First-Person Walkthrough -->
    <div
      v-if="store.cameraMode === 'first_person'"
      class="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <div class="w-2 h-2 rounded-full bg-white/80 ring-2 ring-slate-900/40" />
    </div>
  </div>
</template>
