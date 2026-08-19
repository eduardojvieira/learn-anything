<script setup lang="ts">
import { ref } from 'vue';
import type { SelectedFilePayload } from '@/composables/useTopicData';
import SearchTrigger from './SearchTrigger.vue';
import SidebarMobileToggle from './SidebarMobileToggle.vue';
import SidebarDashboard from './SidebarDashboard.vue';
import SidebarTabs from './tabs/SidebarTabs.vue';
import SidebarFooter from './footer/SidebarFooter.vue';
import { OmitQuizSourceType } from '@/composables/topicDataTypes';

const props = defineProps<{
  context: 'dashboard' | 'topic';
  topicSlug?: string;
  initialTab?: OmitQuizSourceType;
  selectedFilePath?: string | null;
}>();

const emit = defineEmits<{
  'file-selected': [file: SelectedFilePayload | null];
  'topic-selected': [slug: string];
  'back-to-dashboard': [];
  'search-open': [];
  'quiz-selected': [quiz: { path: string }];
  'quiz-batch-selected': [
    batch: {
      items: import('@/components/quiz/types').QueueItem[];
      mode: 'sequential' | 'random';
    },
  ];
}>();

const mobileOpen = ref(false);

function onMobileClose() {
  mobileOpen.value = false;
}

function onTopicSelected(slug: string) {
  emit('topic-selected', slug);
  mobileOpen.value = false;
}

function onFileSelected(file: SelectedFilePayload | null) {
  emit('file-selected', file);
  if (file) mobileOpen.value = false;
}

function onQuizSelected(quiz: { path: string }) {
  emit('quiz-selected', quiz);
  mobileOpen.value = false;
}

function onQuizBatchSelected(batch: {
  items: import('@/components/quiz/types').QueueItem[];
  mode: 'sequential' | 'random';
}) {
  emit('quiz-batch-selected', batch);
  mobileOpen.value = false;
}
</script>

<template>
  <SidebarMobileToggle
    :mobile-open="mobileOpen"
    @toggle="mobileOpen = !mobileOpen"
    @close="onMobileClose"
  />

  <aside
    class="ledger-rail fixed left-0 bottom-0 z-40 flex flex-col transition-transform duration-200 lg:translate-x-0"
    :class="mobileOpen ? 'translate-x-0' : '-translate-x-full'"
  >
    <div class="rail-heading">
      <button
        class="rail-title"
        @click="emit('back-to-dashboard')"
      >
        Learn Anything
      </button>
    </div>

    <div class="rail-search">
      <SearchTrigger @open="emit('search-open')" />
    </div>

    <div class="rail-rule" />

    <!-- Dashboard: topic list -->
    <SidebarDashboard v-if="context === 'dashboard'" @topic-selected="onTopicSelected" />

    <!-- Topic mode: tabs + trees -->
    <SidebarTabs
      v-else
      :topic-slug="topicSlug"
      :selected-file-path="selectedFilePath"
      :initial-tab="initialTab"
      @file-selected="onFileSelected"
      @quiz-selected="onQuizSelected"
      @quiz-batch-selected="onQuizBatchSelected"
    />

    <SidebarFooter />
  </aside>
</template>
