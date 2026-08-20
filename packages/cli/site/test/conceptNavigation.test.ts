import { afterEach, describe, expect, it } from 'vitest';
import { __injectTestData, __resetForTest } from '@/composables/useTopicData';
import { conceptReadmePath, topicCurriculum } from '@/composables/conceptNavigation';

afterEach(__resetForTest);

describe('canonical concept navigation', () => {
  it('opens only an exact canonical README and keeps domain/concept order', () => {
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
                  name: 'Zeta',
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
                  name: 'Alpha',
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
          exercises: ['exercises/zeta/README.md', 'exercises/alpha/starter.ts'],
          quizzes: [],
        },
      },
    });
    expect(conceptReadmePath('topic', 'zeta')).toBe('/topics/topic/exercises/zeta/README.md');
    expect(conceptReadmePath('topic', 'alpha')).toBeNull();
    expect(topicCurriculum('topic')).toMatchObject({
      rootOrder: ['zeta', 'alpha'],
      directoryLabels: { zeta: '1.1 Zeta', alpha: '2.1 Alpha' },
      conceptNames: { zeta: 'Zeta', alpha: 'Alpha' },
    });
  });
});
