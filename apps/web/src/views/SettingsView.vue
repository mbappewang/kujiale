<script setup lang="ts">
import type { QualityProfileName } from '@kujiale/three-engine';
import { ArrowLeft } from 'lucide-vue-next';
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useProjectStore } from '@/stores/projectStore';

const store = useProjectStore();
const router = useRouter();
const profiles: QualityProfileName[] = ['low', 'medium', 'high', 'ultra'];

onMounted(() => {
  store.refreshHealth();
});
</script>

<template>
  <div class="min-h-screen bg-stone-50 flex flex-col">
    <header class="bg-white border-b border-stone-200 px-6 h-14 flex items-center gap-3">
      <button
        type="button"
        class="p-1.5 rounded-lg text-slate-600 hover:bg-stone-100"
        @click="router.back()"
      >
        <ArrowLeft class="w-4 h-4" />
      </button>
      <h1 class="font-bold text-sm text-slate-900">Platform Settings &amp; System Diagnostics</h1>
    </header>

    <main class="max-w-2xl w-full mx-auto px-6 py-8 space-y-6">
      <section class="rounded-2xl bg-white border border-stone-200 p-6 space-y-4">
        <h2 class="text-sm font-bold text-slate-900">Australian Regional &amp; Measurement Preferences</h2>
        <div class="flex items-center justify-between text-xs">
          <div>
            <div class="font-semibold text-slate-800">Length Display Unit</div>
            <div class="text-slate-500">Internal scene coordinates strictly remain metric metres (m)</div>
          </div>
          <select
            v-model="store.displayUnit"
            class="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium"
          >
            <option value="m">Metres (e.g. 4.50 m)</option>
            <option value="mm">Millimetres (e.g. 4,500 mm)</option>
          </select>
        </div>

        <div class="flex items-center justify-between text-xs pt-3 border-t border-stone-100">
          <div>
            <div class="font-semibold text-slate-800">3D Graphics Quality Profile</div>
            <div class="text-slate-500">Controls shadow map resolution, pixel ratio &amp; flora density</div>
          </div>
          <select
            v-model="store.qualityProfile"
            class="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium"
          >
            <option v-for="p in profiles" :key="p" :value="p">{{ p.toUpperCase() }}</option>
          </select>
        </div>
      </section>

      <section class="rounded-2xl bg-white border border-stone-200 p-6 space-y-3 text-xs">
        <h2 class="text-sm font-bold text-slate-900">Backend &amp; AI Provider Health</h2>
        <div class="space-y-2 rounded-xl bg-stone-50 p-4 border border-stone-200 font-mono">
          <div class="flex justify-between">
            <span class="text-slate-500">API Status:</span>
            <span :class="store.backendOnline ? 'text-emerald-700 font-bold' : 'text-amber-700'">
              {{ store.backendOnline ? 'ONLINE' : 'OFFLINE (Local Cache Mode)' }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">AI Provider Mode:</span>
            <span>{{ store.health?.aiProviderMode ?? 'assisted_demo' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Storage Backend:</span>
            <span>{{ store.health?.storageBackend ?? 'local' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">Illumination Pipeline:</span>
            <span>WebGL2 Realtime Direct Sun + PMREM IBL (Not Ray-Tracing)</span>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
