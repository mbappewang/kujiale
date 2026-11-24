<script setup lang="ts">
import { AlertTriangle, ArrowLeft, CheckCircle2, FileUp, Sparkles } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiClient, type FloorplanDTO } from '@/api/client';
import { useProjectStore } from '@/stores/projectStore';

const props = defineProps<{ id: string }>();
const store = useProjectStore();
const router = useRouter();

const selectedFile = ref<File | null>(null);
const localPreviewUrl = ref<string | null>(null);
const knownLengthMeters = ref<number>(13.6);
const useKnownScale = ref<boolean>(true);
const isUploading = ref<boolean>(false);
const isRecognizing = ref<boolean>(false);
const errorMessage = ref<string | null>(null);
const recognizedResult = ref<FloorplanDTO | null>(null);

onMounted(() => {
  store.loadProjectById(props.id);
});

function handleFileInput(e: Event): void {
  const files = (e.target as HTMLInputElement).files;
  if (!files || !files[0]) return;
  const f = files[0];
  errorMessage.value = null;
  if (f.size > 20 * 1024 * 1024) {
    errorMessage.value = 'File exceeds 20 MB maximum upload limit.';
    return;
  }
  selectedFile.value = f;
  localPreviewUrl.value = URL.createObjectURL(f);
  recognizedResult.value = null;
}

async function loadBundledSampleBlueprint(): Promise<void> {
  errorMessage.value = null;
  try {
    const resp = await fetch('/floorplans/sydney-coastal-4bed.png');
    const blob = await resp.blob();
    const file = new File([blob], 'sydney-coastal-4bed.png', { type: 'image/png' });
    selectedFile.value = file;
    localPreviewUrl.value = '/floorplans/sydney-coastal-4bed.png';
    knownLengthMeters.value = 13.6;
    useKnownScale.value = true;
    recognizedResult.value = null;
  } catch (err) {
    errorMessage.value = `Could not load sample blueprint: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function runUploadAndRecognition(): Promise<void> {
  if (!selectedFile.value) return;
  errorMessage.value = null;
  isUploading.value = true;
  try {
    const uploaded = await apiClient.uploadFloorplan(selectedFile.value, props.id);
    isUploading.value = false;
    isRecognizing.value = true;
    const recognized = await apiClient.recognizeFloorplan(
      uploaded.id,
      useKnownScale.value ? knownLengthMeters.value : undefined,
    );
    recognizedResult.value = recognized;
    store.currentFloorplan = recognized;
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err);
  } finally {
    isUploading.value = false;
    isRecognizing.value = false;
  }
}

async function applyAndOpenStudio(): Promise<void> {
  if (!recognizedResult.value) return;
  store.applyRecognizedFloorplanToScene(recognizedResult.value);
  await store.saveCurrentScene();
  store.workspaceLayout = 'split_2d_3d';
  router.push(`/projects/${props.id}/studio`);
}
</script>

<template>
  <div class="min-h-screen bg-stone-50 flex flex-col">
    <header class="bg-white border-b border-stone-200 px-6 h-14 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="p-1.5 rounded-lg text-slate-600 hover:bg-stone-100"
          @click="router.push(`/projects/${props.id}/studio`)"
        >
          <ArrowLeft class="w-4 h-4" />
        </button>
        <h1 class="font-bold text-sm text-slate-900">
          Floor Plan Upload &amp; AI Structure Review
        </h1>
      </div>
      <span
        class="rounded-full px-3 py-1 text-xs font-medium"
        :class="
          store.health?.aiKeyConfigured
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-amber-50 text-amber-900 border border-amber-200'
        "
      >
        {{
          store.health?.aiKeyConfigured
            ? 'Gemini Vision Provider Active'
            : 'Local Assisted Mode (No GEMINI_API_KEY)'
        }}
      </span>
    </header>

    <main class="max-w-5xl w-full mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Left Card: Upload & Scale Input -->
      <section class="rounded-2xl bg-white border border-stone-200 p-6 space-y-5 shadow-xs">
        <div>
          <h2 class="text-base font-bold text-slate-900">1. Select Residential Floor Plan</h2>
          <p class="text-xs text-slate-500 mt-1">
            Accepted formats: PNG, JPG/JPEG, PDF (up to 20 MB). Private residential plans are stored securely and never shared publicly.
          </p>
        </div>

        <label
          class="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 hover:border-sky-500 bg-stone-50/60 p-6 cursor-pointer transition text-center"
        >
          <FileUp class="w-8 h-8 text-slate-400 mb-2" />
          <span class="text-xs font-semibold text-slate-800">
            {{ selectedFile ? selectedFile.name : 'Click to choose PNG, JPG or PDF floor plan' }}
          </span>
          <span class="text-[11px] text-slate-500 mt-1">
            Or load our pre-measured Sydney test sheet below
          </span>
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
            class="hidden"
            @change="handleFileInput"
          />
        </label>

        <button
          type="button"
          class="w-full rounded-xl border border-stone-300 hover:bg-stone-50 py-2 text-xs font-semibold text-slate-800 transition"
          @click="loadBundledSampleBlueprint"
        >
          Load Sample Sydney 4-Bed Blueprint (13.6 m × 13.6 m)
        </button>

        <div v-if="localPreviewUrl" class="rounded-xl border border-stone-200 overflow-hidden bg-stone-100">
          <img
            :src="localPreviewUrl"
            alt="Floor Plan Preview"
            class="max-h-60 w-full object-contain mx-auto"
          />
        </div>

        <!-- Scale Reference Input -->
        <div class="rounded-xl bg-stone-50 p-4 border border-stone-200 space-y-2 text-xs">
          <label class="flex items-center gap-2 font-semibold text-slate-800">
            <input v-model="useKnownScale" type="checkbox" class="accent-slate-900" />
            <span>Provide known overall building width (metres)</span>
          </label>
          <div v-if="useKnownScale" class="flex items-center gap-2 pt-1">
            <input
              v-model.number="knownLengthMeters"
              type="number"
              min="4"
              max="40"
              step="0.1"
              class="w-28 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 font-mono text-sm"
            />
            <span class="text-slate-500">metres (can also calibrate interactively in 2D Editor)</span>
          </div>
        </div>

        <div
          v-if="errorMessage"
          class="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800"
        >
          {{ errorMessage }}
        </div>

        <button
          type="button"
          :disabled="!selectedFile || isUploading || isRecognizing"
          class="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white py-3 text-xs font-bold transition disabled:opacity-45"
          @click="runUploadAndRecognition"
        >
          <Sparkles class="w-4 h-4" />
          <span>
            {{
              isUploading
                ? 'Uploading & Validating File…'
                : isRecognizing
                  ? 'Analysing Walls, Doors & Rooms…'
                  : 'Upload & Extract Structured Floor Plan'
            }}
          </span>
        </button>
      </section>

      <!-- Right Card: Recognition Review & Confidence Report -->
      <section class="rounded-2xl bg-white border border-stone-200 p-6 space-y-5 shadow-xs">
        <div>
          <h2 class="text-base font-bold text-slate-900">2. Review Extracted Structure</h2>
          <p class="text-xs text-slate-500 mt-1">
            Inspect confidence scores, architectural defaults, and launch into Split 2D/3D Studio for fine adjustment.
          </p>
        </div>

        <div
          v-if="!recognizedResult?.recognition"
          class="h-64 rounded-2xl border border-dashed border-stone-200 flex items-center justify-center text-xs text-slate-400 text-center px-6"
        >
          Upload and analyse a floor plan on the left to inspect extracted rooms, walls, openings, and confidence flags.
        </div>

        <div v-else class="space-y-4 text-xs">
          <div class="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-emerald-950">
            <div class="flex items-center gap-2 font-semibold">
              <CheckCircle2 class="w-4 h-4 text-emerald-600" />
              <span>Mode: {{ recognizedResult.recognition.providerMode }}</span>
            </div>
            <span class="font-mono font-bold">
              Confidence: {{ Math.round(recognizedResult.recognition.overallConfidence * 100) }}%
            </span>
          </div>

          <!-- Extracted Counts -->
          <div class="grid grid-cols-2 gap-2.5">
            <div class="rounded-xl bg-stone-50 p-3 border border-stone-200">
              <div class="text-slate-500">Extracted Rooms</div>
              <div class="text-lg font-bold text-slate-900">
                {{ recognizedResult.recognition.scenePatch.rooms.length }}
              </div>
            </div>
            <div class="rounded-xl bg-stone-50 p-3 border border-stone-200">
              <div class="text-slate-500">Walls &amp; Openings</div>
              <div class="text-lg font-bold text-slate-900">
                {{ recognizedResult.recognition.scenePatch.walls.length }} walls ·
                {{
                  recognizedResult.recognition.scenePatch.doors.length +
                  recognizedResult.recognition.scenePatch.windows.length
                }}
                openings
              </div>
            </div>
          </div>

          <!-- Explicit Warnings & Defaults Disclosure -->
          <div class="rounded-xl bg-amber-50 border border-amber-200 p-3.5 space-y-1.5 text-amber-950">
            <div class="flex items-center gap-1.5 font-semibold">
              <AlertTriangle class="w-4 h-4 text-amber-600" />
              <span>Transparency &amp; Manual Calibration Notes</span>
            </div>
            <ul class="list-disc pl-4 space-y-1 text-[11px] leading-relaxed">
              <li v-for="(warn, idx) in recognizedResult.recognition.warnings" :key="idx">
                {{ warn }}
              </li>
            </ul>
          </div>

          <button
            type="button"
            class="w-full rounded-xl bg-sky-600 hover:bg-sky-700 text-white py-3 text-xs font-bold shadow-sm transition"
            @click="applyAndOpenStudio"
          >
            Confirm &amp; Generate Editable 3D House
          </button>
        </div>
      </section>
    </main>
  </div>
</template>
