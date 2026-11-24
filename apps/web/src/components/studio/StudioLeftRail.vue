<script setup lang="ts">
import {
  AUSTRALIAN_STYLE_PRESETS,
  FURNITURE_CATALOG,
} from '@kujiale/furniture';
import { AUSTRALIAN_MATERIAL_CATALOG } from '@kujiale/materials';
import type { StylePresetId } from '@kujiale/scene-schema';
import {
  deepClone,
  formatAreaSqm,
  formatCurrencyAUD,
  formatMetres,
  polygonAreaSqm,
} from '@kujiale/shared';
import {
  Armchair,
  Compass,
  GitCompare,
  Palette,
  PenTool,
  Sparkles,
  Upload,
} from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useProjectStore, type LeftDrawerTab } from '@/stores/projectStore';

const emit = defineEmits<{
  (e: 'teleport', zone: string): void;
  (e: 'walk-speed', speed: number): void;
  (e: 'submit-render', quality: 'standard' | 'high' | 'cycles_export'): void;
}>();

const store = useProjectStore();
const router = useRouter();

const walkSpeed = ref<number>(3.4);
const materialTarget = ref<'floor' | 'wall' | 'exterior_wall' | 'roof'>('floor');
const nlPrompt = ref<string>(
  'Make my living room look like a modern Australian coastal home with travertine floors',
);
const schemeNameInput = ref<string>('Option B — Sydney Contemporary');
const schemeStyleInput = ref<StylePresetId>('sydney_contemporary');

const navItems: Array<{ id: LeftDrawerTab; label: string; icon: typeof Compass }> = [
  { id: 'explore', label: 'Explore', icon: Compass },
  { id: 'structure', label: 'Floor Plan', icon: PenTool },
  { id: 'styles', label: 'AI Style', icon: Sparkles },
  { id: 'materials', label: 'Materials', icon: Palette },
  { id: 'furniture', label: 'Furniture', icon: Armchair },
  { id: 'schemes', label: 'Compare', icon: GitCompare },
];

const stylePresetsList = Object.values(AUSTRALIAN_STYLE_PRESETS);

const filteredMaterials = computed(() =>
  AUSTRALIAN_MATERIAL_CATALOG.filter((m) => m.recommendedFor.includes(materialTarget.value)),
);

const activeRoom = computed(() =>
  store.sceneData.rooms.find((r) => r.id === store.activeRoomId) ?? store.sceneData.rooms[0],
);

function applyMaterialSwatch(materialId: string): void {
  if (materialTarget.value === 'floor' || materialTarget.value === 'wall') {
    const rId = activeRoom.value?.id;
    if (!rId) return;
    store.executeCommand({
      type: 'update_room_material',
      roomId: rId,
      target: materialTarget.value,
      materialId,
    });
  } else {
    store.executeCommand({
      type: 'update_exterior_material',
      target: materialTarget.value,
      materialId,
    });
  }
}

function activeMaterialIdForTarget(): string {
  if (materialTarget.value === 'floor') return activeRoom.value?.floorMaterialId ?? '';
  if (materialTarget.value === 'wall') return activeRoom.value?.wallMaterialId ?? '';
  if (materialTarget.value === 'exterior_wall') {
    return store.sceneData.property.exteriorWallMaterialId;
  }
  return store.sceneData.property.roofMaterialId;
}

function copyShareUrl(): void {
  const url = window.location.href;
  navigator.clipboard?.writeText(url);
  store.notify('success', 'Copied project studio link to clipboard.');
}

function updateCeilingHeight(e: Event): void {
  const val = Number((e.target as HTMLInputElement).value);
  const next = deepClone(store.sceneData);
  if (next.floors[0]) next.floors[0].ceilingHeight = val;
  next.walls.forEach((w) => {
    w.height = val;
  });
  store.commitSceneMutation(next, true);
}

function loadSavedScheme(snapshot: typeof store.sceneData): void {
  store.commitSceneMutation(deepClone(snapshot), true);
}
</script>

<template>
  <aside class="flex h-full shrink-0 bg-white border-r border-stone-200 z-20">
    <!-- Narrow Consumer Icon Rail -->
    <nav class="w-15 shrink-0 border-r border-stone-100 py-3 flex flex-col items-center gap-1.5">
      <button
        v-for="item in navItems"
        :key="item.id"
        type="button"
        class="w-12 py-2 rounded-xl flex flex-col items-center gap-1 text-[10px] font-medium transition"
        :class="
          store.activeLeftTab === item.id
            ? 'bg-slate-900 text-white shadow-xs'
            : 'text-slate-600 hover:bg-stone-100 hover:text-slate-900'
        "
        @click="store.activeLeftTab = item.id"
      >
        <component :is="item.icon" class="w-4 h-4" />
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <!-- Context Drawer Content -->
    <div class="hidden md:flex w-74 flex-col h-full overflow-y-auto p-4 space-y-4">
      <!-- 1. EXPLORE & WALKTHROUGH -->
      <template v-if="store.activeLeftTab === 'explore'">
        <div>
          <h2 class="text-sm font-semibold text-slate-900">Indoor &amp; Outdoor Walkthrough</h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Jump to any zone or walk continuously from Front Yard through Living Room to Backyard Patio.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-1.5">
          <button
            v-for="wp in [
              { key: 'front_yard', label: 'Front Yard' },
              { key: 'living_room', label: 'Living Room' },
              { key: 'kitchen', label: 'Kitchen' },
              { key: 'master_bedroom', label: 'Master Suite' },
              { key: 'bathroom', label: 'Bathroom' },
              { key: 'patio', label: 'Alfresco Deck' },
              { key: 'backyard_pool', label: 'Backyard Pool' },
            ]"
            :key="wp.key"
            type="button"
            class="rounded-xl border border-stone-200 bg-stone-50/70 hover:bg-sky-50 hover:border-sky-300 px-3 py-2 text-left text-xs font-medium text-slate-800 transition"
            @click="emit('teleport', wp.key)"
          >
            {{ wp.label }}
          </button>
        </div>

        <div class="rounded-xl bg-stone-50 p-3 border border-stone-200/80 space-y-2">
          <div class="flex justify-between text-xs">
            <span class="font-medium text-slate-700">Walk Speed</span>
            <span class="font-mono text-slate-500">{{ walkSpeed.toFixed(1) }} m/s</span>
          </div>
          <input
            v-model.number="walkSpeed"
            type="range"
            min="1.5"
            max="6.5"
            step="0.2"
            class="w-full accent-slate-900"
            @input="emit('walk-speed', walkSpeed)"
          />
        </div>

        <div>
          <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Room Directory ({{ store.sceneData.rooms.length }})
          </h3>
          <div class="space-y-1">
            <button
              v-for="room in store.sceneData.rooms"
              :key="room.id"
              type="button"
              class="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition"
              :class="
                store.activeRoomId === room.id
                  ? 'bg-sky-50 text-sky-900 font-semibold'
                  : 'hover:bg-stone-100 text-slate-700'
              "
              @click="
                store.selected3D = { entityType: 'room', entityId: room.id, roomId: room.id };
                emit('teleport', room.id);
              "
            >
              <span class="truncate">{{ room.name }}</span>
              <span class="font-mono text-[11px] text-slate-500">
                {{ formatAreaSqm(polygonAreaSqm(room.polygon)) }}
              </span>
            </button>
          </div>
        </div>
      </template>

      <!-- 2. 2D STRUCTURE & FLOOR PLAN UPLOAD -->
      <template v-else-if="store.activeLeftTab === 'structure'">
        <div>
          <h2 class="text-sm font-semibold text-slate-900">2D Floor Plan &amp; Structure</h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Upload a residential blueprint or edit walls, doors, windows &amp; scale live with 3D sync.
          </p>
        </div>

        <button
          type="button"
          class="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white px-3.5 py-2.5 text-xs font-semibold shadow-xs transition"
          @click="router.push(`/projects/${store.activeProject?.id ?? 'proj-sydney-coastal-demo'}/floorplan`)"
        >
          <Upload class="w-4 h-4" />
          <span>Upload / AI Recognise Floor Plan</span>
        </button>

        <div class="space-y-1.5">
          <div class="text-xs font-medium text-slate-700">Editor Viewport Layout</div>
          <div class="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              class="rounded-lg border px-2.5 py-2 text-xs font-medium transition"
              :class="
                store.workspaceLayout === 'split_2d_3d'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-stone-200 hover:bg-stone-50 text-slate-700'
              "
              @click="store.workspaceLayout = 'split_2d_3d'"
            >
              Split 2D + 3D
            </button>
            <button
              type="button"
              class="rounded-lg border px-2.5 py-2 text-xs font-medium transition"
              :class="
                store.workspaceLayout === '2d_only'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-stone-200 hover:bg-stone-50 text-slate-700'
              "
              @click="store.workspaceLayout = '2d_only'"
            >
              Full 2D Editor
            </button>
          </div>
        </div>

        <div class="rounded-xl bg-stone-50 p-3 border border-stone-200 space-y-2 text-xs">
          <div class="flex justify-between">
            <span class="text-slate-600">Ceiling Height</span>
            <span class="font-mono font-semibold text-slate-900">
              {{ formatMetres(store.sceneData.floors[0]?.ceilingHeight ?? 2.85, store.displayUnit) }}
            </span>
          </div>
          <input
            type="range"
            min="2.4"
            max="3.6"
            step="0.05"
            :value="store.sceneData.floors[0]?.ceilingHeight ?? 2.85"
            class="w-full accent-slate-900"
            @change="updateCeilingHeight"
          />
          <div class="flex justify-between pt-1">
            <span class="text-slate-600">Dimension Units</span>
            <div class="inline-flex rounded-md bg-white border border-stone-200 p-0.5">
              <button
                type="button"
                class="px-2 py-0.5 rounded text-[11px]"
                :class="store.displayUnit === 'm' ? 'bg-slate-900 text-white' : 'text-slate-600'"
                @click="store.displayUnit = 'm'"
              >
                m
              </button>
              <button
                type="button"
                class="px-2 py-0.5 rounded text-[11px]"
                :class="store.displayUnit === 'mm' ? 'bg-slate-900 text-white' : 'text-slate-600'"
                @click="store.displayUnit = 'mm'"
              >
                mm
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- 3. AI INTERIOR DESIGNER & AUSTRALIAN STYLE PRESETS -->
      <template v-else-if="store.activeLeftTab === 'styles'">
        <div>
          <h2 class="text-sm font-semibold text-slate-900">AI Interior Designer</h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Apply curated Australian architectural palettes or describe your renovation in plain English.
          </p>
        </div>

        <!-- Natural Language Renovation Command Input -->
        <div class="rounded-xl bg-stone-50 p-3 border border-stone-200 space-y-2">
          <label class="block text-xs font-semibold text-slate-700">
            Natural Language Edit Prompt
          </label>
          <textarea
            v-model="nlPrompt"
            rows="3"
            placeholder="e.g., Make my living room look like a modern Australian coastal home"
            class="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
          />
          <button
            type="button"
            :disabled="store.isRunningAiTask"
            class="w-full rounded-lg bg-slate-900 hover:bg-slate-800 text-white py-2 text-xs font-semibold transition disabled:opacity-60"
            @click="store.runNaturalLanguageDesign(nlPrompt)"
          >
            {{ store.isRunningAiTask ? 'Applying Validated Commands…' : 'Apply Design Prompt' }}
          </button>
        </div>

        <div class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Australian Style Presets
          </h3>
          <div
            v-for="preset in stylePresetsList"
            :key="preset.id"
            class="rounded-xl border p-3 transition cursor-pointer"
            :class="
              store.sceneData.activeStyleId === preset.id
                ? 'border-sky-600 bg-sky-50/50'
                : 'border-stone-200 hover:border-stone-300 bg-white'
            "
            @click="store.executeCommand({ type: 'apply_style_preset', styleId: preset.id })"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-900">{{ preset.name }}</span>
              <span
                v-if="store.sceneData.activeStyleId === preset.id"
                class="text-[10px] font-semibold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded"
              >
                Active
              </span>
            </div>
            <div class="text-[11px] font-medium text-amber-800 mt-0.5">{{ preset.tagline }}</div>
            <p class="text-[11px] text-slate-500 mt-1 leading-relaxed">{{ preset.description }}</p>
          </div>
        </div>
      </template>

      <!-- 4. PBR MATERIALS -->
      <template v-else-if="store.activeLeftTab === 'materials'">
        <div>
          <h2 class="text-sm font-semibold text-slate-900">PBR Architectural Materials</h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Target Room: <strong class="text-slate-800">{{ activeRoom?.name ?? 'Living Room' }}</strong>
          </p>
        </div>

        <div class="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 text-xs font-medium">
          <button
            v-for="tgt in [
              { id: 'floor', label: 'Room Floor' },
              { id: 'wall', label: 'Room Walls' },
              { id: 'exterior_wall', label: 'Facade Brick' },
              { id: 'roof', label: 'Roof Sheet' },
            ] as const"
            :key="tgt.id"
            type="button"
            class="py-1.5 rounded-lg transition"
            :class="
              materialTarget === tgt.id
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            "
            @click="materialTarget = tgt.id"
          >
            {{ tgt.label }}
          </button>
        </div>

        <div class="space-y-1.5">
          <button
            v-for="mat in filteredMaterials"
            :key="mat.id"
            type="button"
            class="w-full flex items-center gap-3 rounded-xl border p-2.5 text-left transition"
            :class="
              activeMaterialIdForTarget() === mat.id
                ? 'border-sky-600 bg-sky-50/60'
                : 'border-stone-200 hover:bg-stone-50'
            "
            @click="applyMaterialSwatch(mat.id)"
          >
            <span
              class="w-9 h-9 shrink-0 rounded-lg border border-black/10 shadow-inner"
              :style="{
                background: `linear-gradient(135deg, ${mat.baseColorHex} 0%, ${mat.secondaryColorHex} 100%)`,
              }"
            />
            <span class="min-w-0 flex-1">
              <span class="block text-xs font-semibold text-slate-900 truncate">{{ mat.name }}</span>
              <span class="block text-[11px] text-slate-500">
                Rough {{ mat.roughness.toFixed(2) }} · Scale {{ mat.tileSizeMeters }}m
              </span>
            </span>
          </button>
        </div>
      </template>

      <!-- 5. FURNITURE CATALOG -->
      <template v-else-if="store.activeLeftTab === 'furniture'">
        <div>
          <h2 class="text-sm font-semibold text-slate-900">Furniture &amp; Joinery</h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Click to place into <strong class="text-slate-800">{{ activeRoom?.name }}</strong> with automatic wall-clearance checks.
          </p>
        </div>

        <div class="space-y-2">
          <div
            v-for="entry in FURNITURE_CATALOG"
            :key="entry.catalogId"
            class="rounded-xl border border-stone-200 p-2.5 hover:border-stone-300 bg-white flex flex-col gap-2"
          >
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="text-xs font-semibold text-slate-900">{{ entry.name }}</div>
                <div class="text-[11px] text-slate-500 font-mono">
                  {{ entry.dimensions.x.toFixed(2) }}m × {{ entry.dimensions.z.toFixed(2) }}m ·
                  {{ formatCurrencyAUD(entry.priceAUD) }}
                </div>
              </div>
              <span
                v-if="entry.glbUrl"
                class="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"
              >
                GLB
              </span>
            </div>
            <button
              type="button"
              class="w-full rounded-lg bg-stone-100 hover:bg-slate-900 hover:text-white py-1.5 text-xs font-semibold text-slate-800 transition"
              @click="
                store.executeCommand({
                  type: 'add_furniture',
                  roomId: store.activeRoomId,
                  catalogId: entry.catalogId,
                })
              "
            >
              + Place in {{ activeRoom?.name ?? 'Room' }}
            </button>
          </div>
        </div>
      </template>

      <!-- 6. SCHEME COMPARE, RENDER & SHARE -->
      <template v-else-if="store.activeLeftTab === 'schemes'">
        <div>
          <h2 class="text-sm font-semibold text-slate-900">Compare Schemes &amp; Render</h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Current Furniture Estimate:
            <strong class="text-slate-900">
              {{ formatCurrencyAUD(store.metrics.estimatedFurnitureBudgetAUD) }}
            </strong>
          </p>
        </div>

        <div class="rounded-xl bg-stone-50 p-3 border border-stone-200 space-y-2">
          <div class="text-xs font-semibold text-slate-800">Generate &amp; Save New Option</div>
          <input
            v-model="schemeNameInput"
            type="text"
            class="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
          />
          <select
            v-model="schemeStyleInput"
            class="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
          >
            <option v-for="p in stylePresetsList" :key="p.id" :value="p.id">
              {{ p.name }}
            </option>
          </select>
          <button
            type="button"
            :disabled="store.isRunningAiTask"
            class="w-full rounded-lg bg-slate-900 hover:bg-slate-800 text-white py-2 text-xs font-semibold transition"
            @click="store.saveDesignSchemeSnapshot(schemeNameInput, schemeStyleInput)"
          >
            Save Renovation Option
          </button>
        </div>

        <div v-if="store.savedSchemes.length > 0" class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Saved Options ({{ store.savedSchemes.length }})
          </h3>
          <div
            v-for="sc in store.savedSchemes"
            :key="sc.id"
            class="rounded-xl border border-stone-200 p-2.5 space-y-1.5 bg-white"
          >
            <div class="flex justify-between items-center text-xs">
              <span class="font-semibold text-slate-900 truncate">{{ sc.name }}</span>
              <span class="font-mono text-[11px] text-emerald-700">
                {{ formatCurrencyAUD(sc.estimatedBudgetAUD) }}
              </span>
            </div>
            <button
              type="button"
              class="w-full rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-900 py-1 text-xs font-semibold"
              @click="loadSavedScheme(sc.sceneSnapshot)"
            >
              Load Option into 3D Viewer
            </button>
          </div>
        </div>

        <div class="pt-2 border-t border-stone-200 space-y-2">
          <div class="text-xs font-semibold text-slate-800">Photorealistic Render &amp; Share</div>
          <button
            type="button"
            class="w-full rounded-lg bg-amber-600 hover:bg-amber-700 text-white py-2 text-xs font-semibold transition"
            @click="emit('submit-render', 'cycles_export')"
          >
            Export Snapshot &amp; Cycles Script
          </button>
          <button
            type="button"
            class="w-full rounded-lg border border-stone-200 hover:bg-stone-50 py-1.5 text-xs font-medium text-slate-700"
            @click="copyShareUrl"
          >
            Copy Share Link
          </button>

          <div
            v-if="store.latestRenderJob"
            class="rounded-xl border border-stone-200 bg-stone-50 p-2.5 space-y-2 text-xs"
          >
            <div class="flex justify-between">
              <span class="font-semibold text-slate-800">Job: {{ store.latestRenderJob.status }}</span>
              <span class="font-mono text-emerald-700">{{ store.latestRenderJob.progressPct }}%</span>
            </div>
            <img
              v-if="store.latestRenderJob.previewDataUrl"
              :src="store.latestRenderJob.previewDataUrl"
              alt="Rendered Preview"
              class="w-full rounded-lg border border-stone-200"
            />
          </div>
        </div>
      </template>
    </div>
  </aside>
</template>
