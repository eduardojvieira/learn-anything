import { provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export type ViewMode = 'map' | 'progress' | 'sessions';

export function useViewMode() {
  const route = useRoute();
  const router = useRouter();

  const viewMode = ref<ViewMode>('map');
  provide('viewMode', viewMode);

  function setMode(mode: ViewMode, syncUrl = true): void {
    if (viewMode.value === mode) return;
    viewMode.value = mode;
    if (!syncUrl) return;
    const query = { ...route.query };
    if (mode === 'progress' || mode === 'sessions') query.view = mode;
    else delete query.view;
    router.replace({ query });
  }

  provide('setViewMode', setMode);

  function restoreFromRoute(): void {
    viewMode.value =
      route.query.view === 'progress' || route.query.view === 'sessions' ? route.query.view : 'map';
  }

  watch(
    () => route.params.slug,
    () => restoreFromRoute(),
    { immediate: true },
  );
}
