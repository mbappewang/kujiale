<script setup lang="ts">
import { ref } from 'vue';
import { useProjectStore } from '@/stores/projectStore';

const emit = defineEmits<{
  (e: 'joystick', moveX: number, moveY: number): void;
  (e: 'look', deltaX: number, deltaY: number): void;
}>();

const store = useProjectStore();
const knobOffset = ref({ x: 0, y: 0 });
let joyPointerId: number | null = null;
let joyCenter = { x: 0, y: 0 };

let lookPointerId: number | null = null;
let lastLook = { x: 0, y: 0 };

const MAX_RADIUS = 38;

function onJoyDown(e: PointerEvent): void {
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  joyPointerId = e.pointerId;
  joyCenter = { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.5 };
  el.setPointerCapture(e.pointerId);
  onJoyMove(e);
}

function onJoyMove(e: PointerEvent): void {
  if (e.pointerId !== joyPointerId) return;
  const dx = e.clientX - joyCenter.x;
  const dy = e.clientY - joyCenter.y;
  const dist = Math.hypot(dx, dy);
  const clamped = Math.min(MAX_RADIUS, dist);
  const angle = Math.atan2(dy, dx);
  const kx = Math.cos(angle) * clamped;
  const ky = Math.sin(angle) * clamped;
  knobOffset.value = { x: kx, y: ky };
  emit('joystick', kx / MAX_RADIUS, -ky / MAX_RADIUS);
}

function onJoyUp(e: PointerEvent): void {
  if (e.pointerId !== joyPointerId) return;
  joyPointerId = null;
  knobOffset.value = { x: 0, y: 0 };
  emit('joystick', 0, 0);
}

function onLookDown(e: PointerEvent): void {
  lookPointerId = e.pointerId;
  lastLook = { x: e.clientX, y: e.clientY };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onLookMove(e: PointerEvent): void {
  if (e.pointerId !== lookPointerId) return;
  const dx = e.clientX - lastLook.x;
  const dy = e.clientY - lastLook.y;
  lastLook = { x: e.clientX, y: e.clientY };
  emit('look', dx, dy);
}

function onLookUp(e: PointerEvent): void {
  if (e.pointerId !== lookPointerId) return;
  lookPointerId = null;
}
</script>

<template>
  <div
    v-if="store.cameraMode === 'first_person'"
    class="md:hidden pointer-events-none absolute inset-x-0 bottom-4 flex items-end justify-between px-5 z-20"
  >
    <!-- Virtual Movement Thumbstick (Left) -->
    <div
      class="pointer-events-auto relative w-26 h-26 rounded-full bg-slate-950/55 border border-white/25 backdrop-blur-sm flex items-center justify-center touch-none"
      @pointerdown="onJoyDown"
      @pointermove="onJoyMove"
      @pointerup="onJoyUp"
      @pointercancel="onJoyUp"
    >
      <div
        class="w-11 h-11 rounded-full bg-white/85 shadow-md transition-transform duration-75"
        :style="{ transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)` }"
      />
    </div>

    <!-- Touch Look Pad (Right) -->
    <div
      class="pointer-events-auto w-28 h-26 rounded-2xl bg-slate-950/45 border border-white/20 backdrop-blur-sm flex items-center justify-center text-[11px] font-medium text-white/80 touch-none"
      @pointerdown="onLookDown"
      @pointermove="onLookMove"
      @pointerup="onLookUp"
      @pointercancel="onLookUp"
    >
      Swipe to Look
    </div>
  </div>
</template>
