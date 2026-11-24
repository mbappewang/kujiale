<script setup lang="ts">
import type { HouseTypology } from '@kujiale/scene-schema';
import { AUSTRALIAN_CITIES, formatDateAU } from '@kujiale/shared';
import { ArrowRight, Compass, FolderPlus, Home, Settings, Upload } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useProjectStore } from '@/stores/projectStore';

const store = useProjectStore();
const router = useRouter();

const showCreateModal = ref(false);
const newName = ref('Byron Hinterland Residence');
const newDescription = ref('Modern single-storey coastal home with North-facing alfresco deck');
const newCity = ref('Sydney');
const newTypology = ref<HouseTypology>('single_storey');
const newOrientation = ref<number>(0);

const cityList = Object.keys(AUSTRALIAN_CITIES);

onMounted(() => {
  store.fetchProjects();
});

async function handleCreateProject(goToUpload: boolean): Promise<void> {
  const created = await store.createNewProject({
    name: newName.value.trim() || 'Australian Residence',
    description: newDescription.value.trim(),
    city: newCity.value,
    typology: newTypology.value,
    orientationDegrees: newOrientation.value,
  });
  showCreateModal.value = false;
  if (goToUpload) {
    router.push(`/projects/${created.id}/floorplan`);
  } else {
    router.push(`/projects/${created.id}/studio`);
  }
}

function openDemoStudio(): void {
  const firstId = store.projects[0]?.id ?? 'proj-sydney-coastal-demo';
  router.push(`/projects/${firstId}/studio`);
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-stone-50">
    <!-- Top Brand Navigation -->
    <header class="bg-white/90 backdrop-blur-md border-b border-stone-200 sticky top-0 z-20">
      <div class="max-w-6xl mx-auto px-6 h-15 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
            <Home class="w-4 h-4" />
          </div>
          <div>
            <span class="font-bold text-sm tracking-tight text-slate-900">AussieHome 3D</span>
            <span class="hidden sm:inline text-xs text-slate-500 ml-2">
              Australian Residential Digital Twin Studio
            </span>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <span
            class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            :class="
              store.backendOnline
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-amber-50 text-amber-800 border border-amber-200'
            "
          >
            <span
              class="w-1.5 h-1.5 rounded-full"
              :class="store.backendOnline ? 'bg-emerald-500' : 'bg-amber-500'"
            />
            {{
              store.backendOnline
                ? `API Connected (${store.health?.aiProviderMode === 'gemini' ? 'Gemini AI' : 'Assisted Mode'})`
                : 'Local Standalone Mode'
            }}
          </span>

          <button
            type="button"
            class="p-2 rounded-lg text-slate-600 hover:bg-stone-100"
            title="Settings"
            @click="router.push('/settings')"
          >
            <Settings class="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>

    <!-- Hero Banner -->
    <main class="flex-1 max-w-6xl w-full mx-auto px-6 py-10 space-y-10">
      <section
        class="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-stone-900 text-white p-8 md:p-11 shadow-xl relative overflow-hidden"
      >
        <div class="max-w-2xl space-y-4 relative z-10">
          <div
            class="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3 py-1 text-xs font-medium text-sky-200"
          >
            <Compass class="w-3.5 h-3.5" />
            <span>Engineered for Australian Homes · Metres · m² · AUD · Southern Hemisphere Sun</span>
          </div>
          <h1 class="text-2xl md:text-4xl font-bold tracking-tight leading-tight">
            Upload Your Floor Plan. Design Your Home. Walk Through It Before You Build.
          </h1>
          <p class="text-sm md:text-base text-slate-300 leading-relaxed">
            Explore realistic PBR timber, brickwork &amp; stone finishes under authentic Sydney or Melbourne sunlight, edit 2D walls &amp; openings with live 3D reconstruction, and walk seamlessly from your front footpath out to your backyard alfresco &amp; pool.
          </p>

          <div class="pt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 px-5 py-3 text-sm font-bold shadow-md transition"
              @click="openDemoStudio"
            >
              <span>Walk Through Sydney Coastal Demo (216 m²)</span>
              <ArrowRight class="w-4 h-4" />
            </button>

            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white px-4 py-3 text-sm font-semibold transition"
              @click="showCreateModal = true"
            >
              <FolderPlus class="w-4 h-4" />
              <span>New Residence / Upload Floor Plan</span>
            </button>
          </div>
        </div>
      </section>

      <!-- Project Dashboard -->
      <section class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-slate-900">Your Residential Projects</h2>
            <p class="text-xs text-slate-500">
              Open any residence in the 3D Walkthrough Studio or upload a floor plan blueprint.
            </p>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 text-xs font-semibold"
            @click="showCreateModal = true"
          >
            <FolderPlus class="w-3.5 h-3.5" />
            <span>Create Project</span>
          </button>
        </div>

        <div v-if="store.isLoadingProjects" class="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-slate-500">
          Loading residential projects…
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <article
            v-for="proj in store.projects"
            :key="proj.id"
            class="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between gap-4"
          >
            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs text-slate-500">
                <span class="font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">
                  {{ proj.city }}, Australia
                </span>
                <span>{{ formatDateAU(proj.updatedAt) }}</span>
              </div>
              <h3 class="font-bold text-base text-slate-900">{{ proj.name }}</h3>
              <p class="text-xs text-slate-500 line-clamp-2">
                {{ proj.description || 'Australian residential 3D digital twin project.' }}
              </p>
            </div>

            <div class="flex items-center gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                class="flex-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-white py-2 text-xs font-semibold transition"
                @click="router.push(`/projects/${proj.id}/studio`)"
              >
                Open 3D Studio
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-xl border border-stone-200 hover:bg-stone-50 px-3 py-2 text-xs font-medium text-slate-700"
                title="Upload Floor Plan"
                @click="router.push(`/projects/${proj.id}/floorplan`)"
              >
                <Upload class="w-3.5 h-3.5" />
                <span>Floor Plan</span>
              </button>
            </div>
          </article>
        </div>
      </section>
    </main>

    <!-- Create New Residence Modal -->
    <div
      v-if="showCreateModal"
      class="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-stone-200 space-y-4">
        <div>
          <h3 class="text-base font-bold text-slate-900">Create Australian Home Project</h3>
          <p class="text-xs text-slate-500 mt-0.5">
            Configure location and solar orientation for accurate Southern Hemisphere daylighting.
          </p>
        </div>

        <div class="space-y-3 text-xs">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Project Name</label>
            <input
              v-model="newName"
              type="text"
              class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Australian City</label>
              <select
                v-model="newCity"
                class="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-xs"
              >
                <option v-for="c in cityList" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Dwelling Type</label>
              <select
                v-model="newTypology"
                class="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-xs"
              >
                <option value="single_storey">Single-Storey Detached</option>
                <option value="double_storey">Double-Storey Residence</option>
                <option value="townhouse">Townhouse</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block font-semibold text-slate-700 mb-1">
              North Orientation ({{ newOrientation }}°)
            </label>
            <input
              v-model.number="newOrientation"
              type="range"
              min="-180"
              max="180"
              step="5"
              class="w-full accent-slate-900"
            />
          </div>
        </div>

        <div class="flex flex-col sm:flex-row justify-end gap-2 pt-2">
          <button
            type="button"
            class="rounded-xl px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-stone-100"
            @click="showCreateModal = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-xl border border-stone-300 hover:bg-stone-50 px-3.5 py-2 text-xs font-semibold text-slate-800"
            @click="handleCreateProject(true)"
          >
            Create &amp; Upload Blueprint
          </button>
          <button
            type="button"
            class="rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 text-xs font-semibold"
            @click="handleCreateProject(false)"
          >
            Open Template in 3D
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
