<script setup lang="ts">
import { FURNITURE_CATALOG, validateFurniturePlacement } from '@kujiale/furniture';
import { AUSTRALIAN_MATERIAL_CATALOG } from '@kujiale/materials';
import {
  deepClone,
  distance2D,
  formatAreaSqm,
  formatCurrencyAUD,
  formatMetres,
  polygonAreaSqm,
} from '@kujiale/shared';
import { RotateCw, Trash2 } from 'lucide-vue-next';
import { computed } from 'vue';
import { useProjectStore } from '@/stores/projectStore';

const store = useProjectStore();

const selectedFurniture = computed(() => {
  if (store.selected3D?.entityType !== 'furniture') return null;
  return store.sceneData.furniture.find((f) => f.id === store.selected3D?.entityId) ?? null;
});

const furnitureValidation = computed(() => {
  if (!selectedFurniture.value) return null;
  return validateFurniturePlacement(selectedFurniture.value, store.sceneData);
});

const selectedRoom = computed(() => {
  if (store.selected3D?.entityType === 'room') {
    return store.sceneData.rooms.find((r) => r.id === store.selected3D?.entityId) ?? null;
  }
  if (store.selected2D?.kind === 'room') {
    return store.sceneData.rooms.find((r) => r.id === store.selected2D?.id) ?? null;
  }
  if (store.selected3D?.roomId) {
    return store.sceneData.rooms.find((r) => r.id === store.selected3D?.roomId) ?? null;
  }
  return null;
});

const selectedWall = computed(() => {
  const id =
    store.selected3D?.entityType === 'wall'
      ? store.selected3D.entityId
      : store.selected2D?.kind === 'wall'
        ? store.selected2D.id
        : null;
  if (!id) return null;
  return store.sceneData.walls.find((w) => w.id === id) ?? null;
});

const selectedDoor = computed(() => {
  const id =
    store.selected3D?.entityType === 'door'
      ? store.selected3D.entityId
      : store.selected2D?.kind === 'door'
        ? store.selected2D.id
        : null;
  if (!id) return null;
  return store.sceneData.doors.find((d) => d.id === id) ?? null;
});

const floorSwatches = computed(() =>
  AUSTRALIAN_MATERIAL_CATALOG.filter((m) => m.recommendedFor.includes('floor')),
);
const wallSwatches = computed(() =>
  AUSTRALIAN_MATERIAL_CATALOG.filter((m) => m.recommendedFor.includes('wall')),
);
const furnitureSwatches = computed(() =>
  AUSTRALIAN_MATERIAL_CATALOG.filter((m) => m.recommendedFor.includes('furniture')),
);

function setSelectedFurnitureFinish(materialId: string): void {
  if (!selectedFurniture.value) return;
  const next = deepClone(store.sceneData);
  const f = next.furniture.find((x) => x.id === selectedFurniture.value!.id);
  if (f) {
    f.primaryMaterialId = materialId;
    store.commitSceneMutation(next, true);
  }
}
</script>

<template>
  <aside
    class="hidden xl:flex w-76 shrink-0 flex-col bg-white border-l border-stone-200 p-4 overflow-y-auto space-y-4 z-20"
  >
    <!-- 1. SELECTED FURNITURE INSPECTOR -->
    <template v-if="selectedFurniture">
      <div class="flex items-start justify-between gap-2">
        <div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-sky-700">
            Selected Furniture
          </span>
          <h3 class="text-sm font-semibold text-slate-900 mt-0.5">
            {{ selectedFurniture.name }}
          </h3>
        </div>
        <span class="font-mono text-xs font-semibold text-emerald-700">
          {{ formatCurrencyAUD(selectedFurniture.priceAUD) }}
        </span>
      </div>

      <!-- Spatial Validation Status -->
      <div
        v-if="furnitureValidation"
        class="rounded-xl p-2.5 text-xs border"
        :class="
          furnitureValidation.valid
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
            : 'bg-amber-50 border-amber-300 text-amber-900'
        "
      >
        <div v-if="furnitureValidation.valid" class="font-medium">
          Clearances OK — within room &amp; clear of doorways
        </div>
        <ul v-else class="space-y-0.5 list-disc pl-4">
          <li v-for="iss in furnitureValidation.issues" :key="iss.code">{{ iss.message }}</li>
        </ul>
      </div>

      <!-- True Metric Dimensions -->
      <div class="rounded-xl bg-stone-50 p-3 border border-stone-200 space-y-1.5 text-xs">
        <div class="flex justify-between">
          <span class="text-slate-500">Width × Depth</span>
          <span class="font-mono font-medium text-slate-900">
            {{ formatMetres(selectedFurniture.dimensions.x, store.displayUnit) }} ×
            {{ formatMetres(selectedFurniture.dimensions.z, store.displayUnit) }}
          </span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Height</span>
          <span class="font-mono font-medium text-slate-900">
            {{ formatMetres(selectedFurniture.dimensions.y, store.displayUnit) }}
          </span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Position (X, Z)</span>
          <span class="font-mono text-slate-700">
            ({{ selectedFurniture.position.x.toFixed(2)}}m, {{ selectedFurniture.position.z.toFixed(2) }}m)
          </span>
        </div>
      </div>

      <!-- Transform Actions -->
      <div class="flex gap-2">
        <button
          type="button"
          class="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 py-2 text-xs font-medium text-slate-800"
          @click="store.rotateFurnitureItem(selectedFurniture.id, 45)"
        >
          <RotateCw class="w-3.5 h-3.5" />
          <span>Rotate 45°</span>
        </button>
        <button
          type="button"
          class="flex items-center justify-center gap-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 px-3 py-2 text-xs font-medium"
          @click="
            store.executeCommand({ type: 'remove_furniture', furnitureId: selectedFurniture.id });
            store.selected3D = null;
          "
        >
          <Trash2 class="w-3.5 h-3.5" />
          <span>Remove</span>
        </button>
      </div>

      <!-- Replace Furniture Item -->
      <div class="space-y-1.5">
        <label class="block text-xs font-semibold text-slate-700">Swap Furniture Model</label>
        <select
          :value="selectedFurniture.catalogId"
          class="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
          @change="
            (e) =>
              store.executeCommand({
                type: 'replace_furniture',
                furnitureId: selectedFurniture!.id,
                newCatalogId: (e.target as HTMLSelectElement).value,
              })
          "
        >
          <option v-for="c in FURNITURE_CATALOG" :key="c.catalogId" :value="c.catalogId">
            {{ c.name }} ({{ formatCurrencyAUD(c.priceAUD) }})
          </option>
        </select>
      </div>

      <!-- Primary Finish -->
      <div class="space-y-1.5">
        <label class="block text-xs font-semibold text-slate-700">Primary Upholstery / Finish</label>
        <div class="grid grid-cols-4 gap-1.5">
          <button
            v-for="mat in furnitureSwatches"
            :key="mat.id"
            type="button"
            class="h-8 rounded-lg border transition"
            :class="
              selectedFurniture.primaryMaterialId === mat.id
                ? 'ring-2 ring-sky-600 border-white'
                : 'border-black/15'
            "
            :style="{ backgroundColor: mat.baseColorHex }"
            :title="mat.name"
            @click="setSelectedFurnitureFinish(mat.id)"
          />
        </div>
      </div>
    </template>

    <!-- 2. SELECTED DOOR INSPECTOR -->
    <template v-else-if="selectedDoor">
      <div>
        <span class="text-[10px] font-bold uppercase tracking-wider text-amber-700">
          Architectural Opening
        </span>
        <h3 class="text-sm font-semibold text-slate-900 mt-0.5">
          Door ({{ selectedDoor.doorType.replace('_', ' ') }})
        </h3>
      </div>
      <div class="rounded-xl bg-stone-50 p-3 border border-stone-200 space-y-1.5 text-xs">
        <div class="flex justify-between">
          <span class="text-slate-500">Clear Width</span>
          <span class="font-mono font-medium">{{ formatMetres(selectedDoor.width, store.displayUnit) }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Head Height</span>
          <span class="font-mono font-medium">{{ formatMetres(selectedDoor.height, store.displayUnit) }}</span>
        </div>
      </div>
      <button
        type="button"
        class="w-full rounded-lg bg-slate-900 hover:bg-slate-800 text-white py-2 text-xs font-semibold"
        @click="store.toggleDoorOpenState(selectedDoor.id)"
      >
        {{ selectedDoor.isOpen ? 'Close Door' : 'Open Door for Walkthrough' }}
      </button>
    </template>

    <!-- 3. SELECTED WALL INSPECTOR -->
    <template v-else-if="selectedWall">
      <div>
        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {{ selectedWall.isExterior ? 'Exterior Brick Veneer Wall' : 'Interior Stud Partition' }}
        </span>
        <h3 class="text-sm font-semibold text-slate-900 mt-0.5">{{ selectedWall.id }}</h3>
      </div>
      <div class="rounded-xl bg-stone-50 p-3 border border-stone-200 space-y-1.5 text-xs">
        <div class="flex justify-between">
          <span class="text-slate-500">Length</span>
          <span class="font-mono font-semibold">
            {{ formatMetres(distance2D(selectedWall.start, selectedWall.end), store.displayUnit) }}
          </span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Thickness</span>
          <span class="font-mono">{{ formatMetres(selectedWall.thickness, store.displayUnit) }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Height</span>
          <span class="font-mono">{{ formatMetres(selectedWall.height, store.displayUnit) }}</span>
        </div>
        <div v-if="selectedWall.confidence" class="flex justify-between">
          <span class="text-slate-500">Recognition Confidence</span>
          <span class="font-mono text-emerald-700">{{ Math.round(selectedWall.confidence * 100) }}%</span>
        </div>
      </div>
    </template>

    <!-- 4. SELECTED ROOM INSPECTOR -->
    <template v-if="selectedRoom">
      <div class="pt-2 border-t border-stone-100 space-y-3">
        <div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-sky-700">
            Room Zone
          </span>
          <input
            :value="selectedRoom.name"
            type="text"
            aria-label="Room Name"
            class="mt-1 w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm font-semibold text-slate-900"
            @change="(e) => store.renameRoom(selectedRoom!.id, (e.target as HTMLInputElement).value)"
          />
        </div>

        <div class="rounded-xl bg-stone-50 p-3 border border-stone-200 space-y-1 text-xs">
          <div class="flex justify-between">
            <span class="text-slate-500">Floor Area</span>
            <span class="font-mono font-semibold text-slate-900">
              {{ formatAreaSqm(polygonAreaSqm(selectedRoom.polygon)) }}
            </span>
          </div>
          <div v-if="selectedRoom.confidence" class="flex justify-between">
            <span class="text-slate-500">Confidence</span>
            <span class="font-mono text-emerald-700">
              {{ Math.round(selectedRoom.confidence * 100) }}%
            </span>
          </div>
        </div>

        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-slate-700">Quick Floor Finish</label>
          <select
            :value="selectedRoom.floorMaterialId"
            class="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
            @change="
              (e) =>
                store.executeCommand({
                  type: 'update_room_material',
                  roomId: selectedRoom!.id,
                  target: 'floor',
                  materialId: (e.target as HTMLSelectElement).value,
                })
            "
          >
            <option v-for="m in floorSwatches" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
        </div>

        <div v-if="!selectedRoom.isOutdoor" class="space-y-1.5">
          <label class="block text-xs font-semibold text-slate-700">Quick Wall Finish</label>
          <select
            :value="selectedRoom.wallMaterialId"
            class="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
            @change="
              (e) =>
                store.executeCommand({
                  type: 'update_room_material',
                  roomId: selectedRoom!.id,
                  target: 'wall',
                  materialId: (e.target as HTMLSelectElement).value,
                })
            "
          >
            <option v-for="m in wallSwatches" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
        </div>
      </div>
    </template>

    <!-- 5. DEFAULT RESIDENCE OVERVIEW WHEN NOTHING SELECTED -->
    <template v-if="!selectedFurniture && !selectedWall && !selectedDoor && !selectedRoom">
      <div>
        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Property Summary
        </span>
        <h3 class="text-sm font-semibold text-slate-900 mt-0.5">
          Australian Digital Twin
        </h3>
        <p class="text-xs text-slate-500 mt-1">
          Click any room floor, wall, door, or piece of furniture in the 3D scene to inspect dimensions and swap PBR finishes.
        </p>
      </div>

      <div class="rounded-xl bg-stone-50 p-3 border border-stone-200 space-y-2 text-xs">
        <div class="flex justify-between">
          <span class="text-slate-500">Enclosed Area</span>
          <span class="font-mono font-semibold">{{ store.metrics.indoorAreaSqm }} m²</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Covered Alfresco &amp; Porch</span>
          <span class="font-mono font-semibold">{{ store.metrics.outdoorCoveredAreaSqm }} m²</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Total Building Area</span>
          <span class="font-mono font-bold text-slate-900">{{ store.metrics.totalBuildingAreaSqm }} m²</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">Furniture Estimate</span>
          <span class="font-mono font-semibold text-emerald-700">
            {{ formatCurrencyAUD(store.metrics.estimatedFurnitureBudgetAUD) }}
          </span>
        </div>
      </div>
    </template>
  </aside>
</template>
