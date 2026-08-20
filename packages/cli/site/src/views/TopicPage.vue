<script setup lang="ts">
import { computed, ref, inject, watch, type Ref } from 'vue';
import { useI18n } from '@/composables/useI18n';
import { loadTopic, loadTopicV2, getDataVersion } from '@/composables/useTopicData';
import ContentViewer from '@/components/content/ContentViewer.vue';
import ViewModeToggle from '@/components/content/ViewModeToggle.vue';
import TopicProgressView from '@/components/stats/TopicProgressView.vue';
import MasteryTree from '@/components/stats/MasteryTree.vue';
import SessionLedger from '@/components/sessions/SessionLedger.vue';
import type { SelectedFilePayload } from '@/composables/useTopicData';
import type { ViewMode } from '@/composables/useViewMode';
import { conceptReadmePath } from '@/composables/conceptNavigation';

const props = defineProps<{ slug: string }>();

const { t } = useI18n();

const state = computed(() => {
  void getDataVersion();
  return loadTopic(props.slug);
});
const v2 = computed(() => {
  void getDataVersion();
  return loadTopicV2(props.slug);
});

const readmePaths = computed(() =>
  Object.fromEntries(
    state.value?.domains
      .flatMap((domain) =>
        domain.concepts.map(
          (concept) => [concept.slug, conceptReadmePath(props.slug, concept.slug)] as const,
        ),
      )
      .filter(([, path]) => path) ?? [],
  ),
);

/* --- Receive file selection from sidebar via provide/inject --- */
const selectedFile = inject<Ref<SelectedFilePayload | null>>('topicSelectedFile', ref(null));
const openConceptReading = inject<(path: string) => void>('openConceptReading', () => {});

/* --- View-mode toggle (Map / Progress) shared via provide/inject --- */
const viewMode = inject<Ref<ViewMode>>('viewMode', ref<ViewMode>('map'));
const setViewMode = inject<(mode: ViewMode) => void>('setViewMode', () => {});

watch(
  v2,
  (snapshot) => {
    if (!snapshot && viewMode.value === 'sessions') setViewMode('map');
  },
  { immediate: true },
);

const showKnowledgeMap = computed(() => !selectedFile.value);
</script>

<template>
  <!-- Topic not found -->
  <div v-if="!state" class="flex flex-col items-center justify-center py-24 text-center">
    <div class="text-4xl mb-4 opacity-60 select-none">🔍</div>
    <p class="text-base text-(--color-pencil)">{{ t('topic.notFound') }}: {{ slug }}</p>
  </div>

  <!-- Topic content -->
  <div v-else class="topic-sheet">
    <!-- Topic overview: toggle between Knowledge Map (markdown) and Progress (data).
         The Progress view is width-constrained to the prose reading measure. -->
    <template v-if="showKnowledgeMap">
      <div :class="viewMode === 'progress' ? 'max-w-4xl mx-auto' : ''">
        <div class="flex justify-end mb-6">
          <ViewModeToggle :v2="Boolean(v2)" />
        </div>
        <template v-if="viewMode === 'map'">
          <h1 class="mb-6">{{ state.topic }}</h1>
          <MasteryTree
            :domains="state.domains"
            :readme-paths="readmePaths"
            :selected-file-path="selectedFile?.path"
            show-details
            @readme-selected="openConceptReading"
          />
        </template>
        <TopicProgressView
          v-else-if="viewMode === 'progress'"
          :state="state"
          :readme-paths="readmePaths"
          :selected-file-path="selectedFile?.path"
          @readme-selected="openConceptReading"
        />
        <SessionLedger v-else-if="v2" :key="slug" :slug="slug" />
      </div>
    </template>

    <!-- File content -->
    <ContentViewer v-else :file="selectedFile" />
  </div>
</template>
