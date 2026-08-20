<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from '@/composables/useI18n';
import SidebarTreeNode from '@/components/sidebar/SidebarTreeNode.vue';
import type { Concept, ConceptStatus } from '@/composables/topicDataTypes';

const props = defineProps<{
  domains: { name: string; slug: string; concepts: Concept[] }[];
  readmePaths?: Record<string, string>;
  selectedFilePath?: string | null;
  showDetails?: boolean;
}>();
const emit = defineEmits<{ 'readme-selected': [path: string] }>();
const { t } = useI18n();

const collapsed = ref<Set<string>>(new Set());

function isExpanded(slug: string): boolean {
  return !collapsed.value.has(slug);
}

function toggle(slug: string): void {
  const next = new Set(collapsed.value);
  if (next.has(slug)) next.delete(slug);
  else next.add(slug);
  collapsed.value = next;
}

const statusBarClass: Record<ConceptStatus, string> = {
  mastered: 'bg-mastered',
  in_progress: 'bg-(--color-progress)',
  needs_practice: 'bg-brand-2',
  unexplored: 'bg-(--color-text-3) opacity-30',
};
</script>

<template>
  <div class="space-y-1">
    <SidebarTreeNode
      v-for="(domain, domainIndex) in props.domains"
      :key="domain.slug"
      :label="`${domainIndex + 1} ${domain.name}`"
      :expanded="isExpanded(domain.slug)"
      :roomy="props.showDetails"
      @toggle="toggle(domain.slug)"
    >
      <div
        v-for="(concept, conceptIndex) in domain.concepts"
        :key="concept.slug"
        class="pr-1 group"
        :class="props.showDetails ? 'py-2' : 'py-1'"
      >
        <div class="flex gap-2.5" :class="props.showDetails ? 'items-start' : 'items-center'">
          <span class="w-1 h-3.5 rounded-full shrink-0" :class="statusBarClass[concept.status]" />
          <button
            v-if="props.readmePaths?.[concept.slug]"
            type="button"
            class="flex-1 min-w-0 text-left text-text-2 hover:text-text-1 transition-colors cursor-pointer"
            :class="[
              props.selectedFilePath === props.readmePaths[concept.slug] ? 'text-brand-2' : '',
              props.showDetails
                ? 'whitespace-normal text-[15px] leading-7'
                : 'truncate text-[13px]',
            ]"
            :aria-current="
              props.selectedFilePath === props.readmePaths[concept.slug] ? 'page' : undefined
            "
            :aria-label="`${t('ui.open')} ${domainIndex + 1}.${conceptIndex + 1} ${concept.name}`"
            @click="emit('readme-selected', props.readmePaths[concept.slug])"
          >
            {{ `${domainIndex + 1}.${conceptIndex + 1} ${concept.name}` }}
          </button>
          <span
            v-else
            class="flex-1 min-w-0 text-text-2 group-hover:text-text-1 transition-colors"
            :class="
              props.showDetails ? 'whitespace-normal text-[15px] leading-7' : 'truncate text-[13px]'
            "
            >{{ `${domainIndex + 1}.${conceptIndex + 1} ${concept.name}` }}</span
          >
          <span class="text-[11px] tabular-nums text-text-3 shrink-0" :title="t('topic.confidence')"
            >{{ Math.round(concept.confidence * 100) }}%</span
          >
        </div>
        <ul
          v-if="props.showDetails && concept.details.length"
          class="ml-3.5 mt-2 space-y-1 text-sm leading-6 text-text-3"
        >
          <li v-for="(detail, detailIndex) in concept.details" :key="detail">
            {{ `${domainIndex + 1}.${conceptIndex + 1}.${detailIndex + 1} ${detail}` }}
          </li>
        </ul>
      </div>
    </SidebarTreeNode>
  </div>
</template>
