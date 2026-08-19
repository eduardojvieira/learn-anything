// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, defineComponent, h, nextTick, provide, ref } from 'vue';
import SidebarTopicTree from '@/components/sidebar/tabs/SidebarTopicTree.vue';
import { __injectTestData, __resetForTest, type TopicV2Snapshot } from '@/composables/useTopicData';

const revision = 'a'.repeat(64);
const summary = {
  slug: 'topic',
  name: 'Topic',
  domainCount: 0,
  totalConcepts: 0,
  masteredCount: 0,
  percentage: 0,
};

const v2: TopicV2Snapshot = {
  state: {
    version: 2,
    id: '00000000-0000-4000-8000-000000000001',
    topic: 'Topic',
    slug: 'topic',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    domains: [],
  },
  revision,
  numbering: {},
  mastery: {},
};

afterEach(() => {
  __resetForTest();
  document.body.replaceChildren();
});

function mountTopicTree(v2Snapshot?: TopicV2Snapshot) {
  __injectTestData({
    summaries: [summary],
    states: v2Snapshot ? {} : { topic: { version: 1, topic: 'Topic', slug: 'topic', domains: [] } },
    knowledgeMaps: {},
    fileContents: {},
    files: { topic: { sessions: [], exercises: [], quizzes: [] } },
    v2Snapshots: v2Snapshot ? { topic: v2Snapshot } : {},
  });
  const selected = ref({ path: '/topics/topic/sessions/legacy.md', type: 'markdown' as const });
  const mode = ref('map');
  const Wrapper = defineComponent({
    setup() {
      provide('setViewMode', (next: string) => (mode.value = next));
      return () =>
        h(SidebarTopicTree, {
          topicSlug: 'topic',
          selectedFilePath: selected.value?.path,
          onKnowledgeMap: () => (selected.value = null as never),
        });
    },
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(Wrapper);
  app.mount(host);
  return { host, mode, selected, unmount: () => app.unmount() };
}

describe('SidebarTopicTree V2 session discovery', () => {
  it('opens the canonical Session Ledger and clears a selected file when V2 has no Markdown notes', async () => {
    const tree = mountTopicTree(v2);
    const action = tree.host.querySelector<HTMLButtonElement>(
      '[data-testid="open-session-ledger"]',
    );
    expect(action?.textContent).toContain('Open Session Ledger');
    action?.click();
    await nextTick();
    expect(tree.mode.value).toBe('sessions');
    expect(tree.selected.value).toBeNull();
    tree.unmount();
  });

  it('keeps the V1 empty state without a Session Ledger action', () => {
    const tree = mountTopicTree();
    expect(tree.host.querySelector('[data-testid="open-session-ledger"]')).toBeNull();
    expect(tree.host.textContent).toContain('No session notes');
    tree.unmount();
  });
});
