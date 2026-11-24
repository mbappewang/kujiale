<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import FloorplanCanvas2D from '@/components/studio/FloorplanCanvas2D.vue';
import HouseViewer from '@/components/studio/HouseViewer.vue';
import MobileTouchOverlay from '@/components/studio/MobileTouchOverlay.vue';
import StudioLeftRail from '@/components/studio/StudioLeftRail.vue';
import StudioRightInspector from '@/components/studio/StudioRightInspector.vue';
import StudioTopBar from '@/components/studio/StudioTopBar.vue';
import { useProjectStore } from '@/stores/projectStore';

const props = defineProps<{ id: string }>();
const store = useProjectStore();
const viewerRef = ref<InstanceType<typeof HouseViewer> | null>(null);

onMounted(() => {
  // Detect mobile viewport for ergonomic default Quality Profile
  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    store.qualityProfile = 'medium';
  }
  store.loadProjectById(props.id);
});

watch(
  () => props.id,
  (nextId) => {
    store.loadProjectById(nextId);
  },
);

function handleTeleport(zone: string): void {
  if (store.workspaceLayout === '2d_only') {
    store.workspaceLayout = '3d_only';
  }
  viewerRef.value?.teleportTo(zone);
}

function handleWalkSpeed(speed: number): void {
  viewerRef.value?.setWalkSpeed(speed);
}

function handleCaptureSnapshot(): void {
  const dataUrl = viewerRef.value?.captureSnapshot() ?? null;
  if (!dataUrl) {
    store.notify('error', 'Switch to 3D Studio view to capture a snapshot.');
    return;
  }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${(store.activeProject?.name ?? 'aussie-home').toLowerCase().replace(/\s+/g, '-')}-3d.png`;
  a.click();
  store.notify('success', 'Downloaded HD 3D architectural snapshot.');
}

function handleSubmitRender(quality: 'standard' | 'high' | 'cycles_export'): void {
  const dataUrl = viewerRef.value?.captureSnapshot() ?? null;
  store.submitRenderJob(quality, dataUrl);
}
</script>

<template>
  <div class="h-screen w-screen overflow-hidden flex flex-col bg-stone-100">
    <StudioTopBar @capture-snapshot="handleCaptureSnapshot" />

    <div class="flex-1 min-h-0 flex relative">
      <StudioLeftRail
        @teleport="handleTeleport"
        @walk-speed="handleWalkSpeed"
        @submit-render="handleSubmitRender"
      />

      <!-- Center Workspace Canvas Area (3D Only | Split 2D+3D | 2D Only) -->
      <main class="flex-1 min-w-0 h-full relative flex">
        <div
          v-if="store.isLoadingScene"
          class="absolute inset-0 z-30 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center text-sm font-medium text-white"
        >
          Reconstructing 3D Australian Residence…
        </div>

        <!-- 2D Interactive Floor Plan Pane -->
        <div
          v-if="store.workspaceLayout === '2d_only' || store.workspaceLayout === 'split_2d_3d'"
          class="h-full border-r border-stone-300"
          :class="store.workspaceLayout === 'split_2d_3d' ? 'w-1/2' : 'w-full'"
        >
          <FloorplanCanvas2D />
        </div>

        <!-- 3D Realtime WebGL2 PBR Viewport Pane -->
        <div
          v-if="store.workspaceLayout === '3d_only' || store.workspaceLayout === 'split_2d_3d'"
          class="h-full relative"
          :class="store.workspaceLayout === 'split_2d_3d' ? 'w-1/2' : 'w-full'"
        >
          <HouseViewer ref="viewerRef" />
          <MobileTouchOverlay
            @joystick="(mx, my) => viewerRef?.setVirtualJoystick(mx, my)"
            @look="(dx, dy) => viewerRef?.applyTouchLook(dx, dy)"
          />
        </div>
      </main>

      <StudioRightInspector />
    </div>
  </div>
</template>
