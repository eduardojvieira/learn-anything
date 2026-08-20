// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, provide, ref } from 'vue';
import TopicPage from '@/views/TopicPage.vue';
import { __injectTestData, __resetForTest } from '@/composables/useTopicData';

afterEach(() => {
  __resetForTest();
  document.body.replaceChildren();
});

describe('TopicPage canonical reading', () => {
  it('opens the exact README from Map and Progress through the injected navigation callback', async () => {
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
              name: 'Domain',
              slug: 'domain',
              concepts: [
                {
                  name: 'Concept',
                  slug: 'concept',
                  status: 'in_progress',
                  confidence: 0.5,
                  practice_count: 0,
                  explain_count: 0,
                  last_explained: null,
                  last_practiced: null,
                  details: ['Detail'],
                },
              ],
            },
          ],
        },
      },
      knowledgeMaps: {},
      fileContents: {},
      files: { topic: { sessions: [], exercises: ['exercises/concept/README.md'], quizzes: [] } },
    });
    const open = vi.fn();
    const mode = ref<'map' | 'progress'>('map');
    const selected = ref(null);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(
      defineComponent({
        setup: () => {
          provide('viewMode', mode);
          provide('setViewMode', (next: 'map' | 'progress') => (mode.value = next));
          provide('topicSelectedFile', selected);
          provide('openConceptReading', open);
          return () => h(TopicPage, { slug: 'topic' });
        },
      }),
    );
    app.mount(host);
    const button = () =>
      Array.from(host.querySelectorAll('button')).find((entry) =>
        entry.textContent?.includes('1.1 Concept'),
      );
    button()?.click();
    await nextTick();
    mode.value = 'progress';
    await nextTick();
    button()?.click();
    expect(open).toHaveBeenNthCalledWith(1, '/topics/topic/exercises/concept/README.md');
    expect(open).toHaveBeenNthCalledWith(2, '/topics/topic/exercises/concept/README.md');
    app.unmount();
  });
});
