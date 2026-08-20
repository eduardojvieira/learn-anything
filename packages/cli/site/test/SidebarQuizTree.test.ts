// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import SidebarQuizTree from '@/components/sidebar/tabs/SidebarQuizTree.vue';
import { __injectTestData, __resetForTest } from '@/composables/useTopicData';

afterEach(() => {
  __resetForTest();
  document.body.replaceChildren();
});

describe('SidebarQuizTree canonical batches', () => {
  it('emits sequential quizzes in canonical order with canonical concept names', async () => {
    __injectTestData({
      summaries: [],
      states: {
        topic: {
          version: 1,
          topic: 'Topic',
          slug: 'topic',
          created: '2026-01-01',
          domains: [
            {
              name: 'First',
              slug: 'first',
              concepts: [
                {
                  name: 'Zeta name',
                  slug: 'zeta',
                  status: 'unexplored',
                  confidence: 0,
                  practice_count: 0,
                  explain_count: 0,
                  last_explained: null,
                  last_practiced: null,
                  details: [],
                },
              ],
            },
            {
              name: 'Second',
              slug: 'second',
              concepts: [
                {
                  name: 'Alpha name',
                  slug: 'alpha',
                  status: 'unexplored',
                  confidence: 0,
                  practice_count: 0,
                  explain_count: 0,
                  last_explained: null,
                  last_practiced: null,
                  details: [],
                },
              ],
            },
          ],
        },
      },
      knowledgeMaps: {},
      fileContents: {},
      files: {
        topic: {
          sessions: [],
          exercises: [],
          quizzes: ['quizzes/alpha/quiz.json', 'quizzes/zeta/quiz.json'],
        },
      },
    });
    const batch = ref<unknown>(null);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(
      defineComponent({
        setup: () => () =>
          h(SidebarQuizTree, {
            topicSlug: 'topic',
            onQuizBatchSelected: (value: unknown) => (batch.value = value),
          }),
      }),
    );
    app.mount(host);
    host.querySelector<HTMLButtonElement>('[title="Practice in order"]')?.click();
    await nextTick();
    expect(batch.value).toMatchObject({
      mode: 'sequential',
      items: [
        { concept_slug: 'zeta', concept_name: 'Zeta name' },
        { concept_slug: 'alpha', concept_name: 'Alpha name' },
      ],
    });
    app.unmount();
  });
});
