<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from '@/composables/useI18n';
import { listAllTopics } from '@/composables/useTopicData';
import { useDashboardStats } from '@/components/stats/useDashboardStats';
import StatsHero from '@/components/stats/StatsHero.vue';
import StatsSummary from '@/components/stats/StatsSummary.vue';
import ReviewPanel from '@/components/review/ReviewPanel.vue';
import { useReviewItems } from '@/components/review/useReview';

const router = useRouter();
const { t } = useI18n();
const topics = computed(() => listAllTopics());
const reviewItems = useReviewItems(8);
const stats = useDashboardStats();

function goToTopic(slug: string) {
  router.push(`/topics/${slug}`);
}
</script>

<template>
  <div class="ledger-dashboard">
    <header class="ledger-heading">
      <h1>
        {{ t('dashboard.title') }}
      </h1>
      <p v-if="topics.length > 0">
      {{ topics.length }} {{ topics.length === 1 ? 'topic' : 'topics' }}
    </p>
      <a v-if="reviewItems.length > 0" class="ledger-review-jump" href="#review-ledger">
        {{ t('review.title') }} {{ reviewItems.length }}
      </a>
    </header>

    <!-- Empty state -->
    <div
      v-if="topics.length === 0"
      class="flex flex-col items-center justify-center py-24 text-center"
    >
      <p class="text-sm font-medium text-text-2 mb-2">
        {{ t('dashboard.noTopics') }}
      </p>
      <p class="text-xs text-text-3 max-w-md">
        {{ t('dashboard.startLearning') }}
      </p>
    </div>

    <!-- Content (only when topics exist) -->
    <template v-else>
      <!-- Topics band (top, full width) -->
      <div class="ledger-desk">
        <section class="ledger-main">
          <div class="mastery-ledger">
            <StatsHero :stats="stats" />
            <StatsSummary :stats="stats" />
          </div>
          <section class="topic-directory">
            <h2>{{ t('dashboard.topicDirectory') }}</h2>
          <button
            v-for="topic in topics"
            :key="topic.slug"
            class="topic-ledger-row"
            @click="goToTopic(topic.slug)"
          >
            <div>
              <h3>
                {{ topic.name }}
              </h3>
              <p>
                {{ topic.domainCount }} {{ t('topic.domains') }} · {{ topic.totalConcepts }}
                {{ t('topic.concepts') }} · {{ topic.masteredCount }}/{{ topic.totalConcepts }}
                {{ t('topic.mastered') }}
              </p>
            </div>

            <!-- Progress bar — mastered-green, slightly thicker -->
            <div class="topic-ledger-progress">
              <div class="topic-ledger-track">
                <div
                  class="topic-ledger-fill"
                  :style="{ width: `${topic.percentage}%` }"
                />
              </div>
              <span>
                {{ topic.percentage }}%
              </span>
            </div>
          </button>
          </section>
        </section>
        <aside id="review-ledger" v-if="reviewItems.length > 0" class="ledger-review">
          <ReviewPanel />
        </aside>
      </div>
    </template>
  </div>
</template>
