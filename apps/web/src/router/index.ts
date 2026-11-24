import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '@/views/DashboardView.vue';
import FloorplanUploadView from '@/views/FloorplanUploadView.vue';
import SettingsView from '@/views/SettingsView.vue';
import StudioView from '@/views/StudioView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
    },
    {
      path: '/projects/:id/floorplan',
      name: 'floorplan-upload',
      component: FloorplanUploadView,
      props: true,
    },
    {
      path: '/projects/:id/studio',
      name: 'studio',
      component: StudioView,
      props: true,
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
    },
  ],
});
