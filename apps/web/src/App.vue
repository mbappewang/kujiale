<script setup lang="ts">
import { RouterView } from 'vue-router';
import { useProjectStore } from '@/stores/projectStore';

const store = useProjectStore();
</script>

<template>
  <div class="min-h-full flex flex-col bg-stone-50 text-slate-900">
    <!-- Global Real-Time Status Notification Toast -->
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="store.statusBanner"
        class="fixed top-14 right-4 z-50 max-w-md rounded-xl border px-4 py-3 shadow-lg backdrop-blur-md flex items-start gap-3 text-sm"
        :class="{
          'bg-emerald-950/90 border-emerald-700 text-emerald-50': store.statusBanner.kind === 'success',
          'bg-rose-950/90 border-rose-700 text-rose-50': store.statusBanner.kind === 'error',
          'bg-slate-900/90 border-slate-700 text-slate-100': store.statusBanner.kind === 'info',
        }"
      >
        <span class="flex-1 leading-snug">{{ store.statusBanner.message }}</span>
        <button
          type="button"
          class="text-xs opacity-75 hover:opacity-100 font-medium"
          @click="store.statusBanner = null"
        >
          Dismiss
        </button>
      </div>
    </transition>

    <RouterView />
  </div>
</template>
