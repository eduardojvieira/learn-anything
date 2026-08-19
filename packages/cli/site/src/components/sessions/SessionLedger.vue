<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useI18n, type I18nKey } from '@/composables/useI18n';
import { createSessionStore, formatSessionDate, type SessionSummary } from '@/composables/useSessions';

const props = defineProps<{ slug: string }>();
const { t, locale, config } = useI18n();
const store = createSessionStore(props.slug);

const sessionKindKeys: Record<SessionSummary['kind'], I18nKey> = {
  study: 'sessions.kind.study', explain: 'sessions.kind.explain', practice: 'sessions.kind.practice', review: 'sessions.kind.review', quiz: 'sessions.kind.quiz',
};
const blockKindKeys: Record<string, I18nKey> = {
  positioning: 'sessions.block.positioning', diagnostic: 'sessions.block.diagnostic', retrieval: 'sessions.block.retrieval', explanation: 'sessions.block.explanation', worked_example: 'sessions.block.worked_example', self_explanation: 'sessions.block.self_explanation', feedback: 'sessions.block.feedback', correction: 'sessions.block.correction', interleaving: 'sessions.block.interleaving', transfer: 'sessions.block.transfer', delayed_assessment: 'sessions.block.delayed_assessment', summary: 'sessions.block.summary',
};

function formatDate(value: string): string { return formatSessionDate(value, locale.value, config.value.timezone); }

async function load() {
  await store.loadList();
  if (!store.selectedId.value && store.sessions.value[0]) await store.select(store.sessions.value[0].id);
}

onMounted(load);
watch(() => props.slug, load);
</script>

<template>
  <section class="session-ledger" :aria-busy="store.listLoading.value || store.detailLoading.value || store.saving.value !== null">
    <header class="session-ledger-header">
      <h1>{{ t('sessions.title') }}</h1>
      <button class="session-action" type="button" :disabled="store.listLoading.value || store.saving.value !== null" @click="load">{{ t('sessions.reloadList') }}</button>
    </header>

    <p v-if="store.listLoading.value" class="session-state" role="status">{{ t('sessions.loading') }}</p>
    <div v-else-if="store.listError.value" class="session-state" role="alert">
      <p>{{ t('sessions.listError') }}</p>
      <button class="session-action" type="button" :disabled="store.listLoading.value || store.saving.value !== null" @click="load">{{ t('sessions.reloadList') }}</button>
    </div>
    <p v-else-if="store.sessions.value.length === 0" class="session-state">{{ t('sessions.empty') }}</p>
    <div v-else class="session-ledger-grid">
      <nav class="session-list" :aria-label="t('sessions.title')">
        <button
          v-for="item in store.sessions.value"
          :key="item.id"
          class="session-row"
          :class="{ 'session-row-active': item.id === store.selectedId.value }"
          type="button"
          :aria-pressed="item.id === store.selectedId.value"
          :disabled="store.saving.value !== null"
          @click="store.select(item.id)"
        >
          <span>{{ item.concept_name }}</span>
          <small>{{ t(sessionKindKeys[item.kind]) }} · {{ formatDate(item.updated_at) }}</small>
        </button>
      </nav>

      <div class="session-sheet">
        <p v-if="store.detailLoading.value" class="session-state" role="status">{{ t('sessions.detailLoading') }}</p>
        <div v-else-if="store.detailError.value" class="session-state" role="alert">
          <p>{{ t('sessions.detailError') }}</p>
          <button class="session-action" type="button" :disabled="store.detailLoading.value || store.saving.value !== null" @click="store.reload">{{ t('sessions.reload') }}</button>
        </div>
        <p v-else-if="!store.session.value" class="session-state">{{ t('sessions.select') }}</p>
        <template v-else>
          <header class="session-sheet-header">
            <h2>{{ store.session.value.concept_name }}</h2>
            <p>{{ formatDate(store.session.value.updated_at) }}</p>
          </header>
          <section class="session-prose">
            <h3>{{ t('sessions.blocks') }}</h3>
            <article v-for="block in store.session.value.blocks" :key="block.id">
              <h4>{{ t(blockKindKeys[block.kind] ?? 'sessions.block.summary') }}</h4>
              <p>{{ block.text }}</p>
            </article>
          </section>
          <section class="session-prompts">
            <h3>{{ t('sessions.prompts') }}</h3>
            <article v-for="prompt in store.session.value.socratic_prompts" :key="prompt.id" class="session-prompt">
              <label :for="`socratic-${prompt.id}`">{{ prompt.prompt }}</label>
              <textarea
                :id="`socratic-${prompt.id}`"
                :value="store.drafts.value[prompt.id] ?? ''"
                :disabled="store.saving.value !== null"
                @input="store.setDraft(prompt.id, ($event.target as HTMLTextAreaElement).value)"
              />
              <div class="session-actions">
                <button class="session-save" type="button" :aria-busy="store.saving.value === prompt.id" :disabled="store.saving.value !== null || !store.isDirty(prompt.id)" @click="store.save(prompt.id)">
                  {{ store.saving.value === prompt.id ? t('sessions.saving') : t('sessions.save') }}
                </button>
                <button v-if="store.writeError.value === prompt.id" class="session-action" type="button" :disabled="store.saving.value !== null" @click="store.retry(prompt.id)">{{ t('sessions.retry') }}</button>
              </div>
              <p v-if="store.writeError.value === prompt.id" class="session-error" role="alert">{{ t('sessions.writeError') }}</p>
              <p v-if="store.saved.value === prompt.id" class="session-feedback" role="status">{{ t('sessions.saved') }}</p>
              <div class="session-history">
                <h4>{{ t('sessions.history') }}</h4>
                <p v-if="prompt.responses.length === 0">{{ t('sessions.unanswered') }}</p>
                <ol v-else>
                  <li v-for="response in prompt.responses" :key="response.id">
                    <time :datetime="response.submitted_at">{{ formatDate(response.submitted_at) }}</time>
                    <p>{{ response.response }}</p>
                  </li>
                </ol>
              </div>
            </article>
          </section>
          <div v-if="store.conflict.value" class="session-conflict" role="alert">
            <p>{{ t('sessions.conflict') }}</p>
            <button class="session-action" type="button" :disabled="store.detailLoading.value || store.saving.value !== null" @click="store.reload">{{ t('sessions.reload') }}</button>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>
