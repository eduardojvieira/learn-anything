// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import MasteryTree from '@/components/stats/MasteryTree.vue';

afterEach(() => document.body.replaceChildren());

describe('MasteryTree concept reading', () => {
  it('emits the exact README route for an available concept and leaves missing assets noninteractive', async () => {
    const selected = ref<string | null>(null);
    const Wrapper = defineComponent({
      setup() {
        return () =>
          h(MasteryTree, {
            domains: [
              {
                name: 'Domain',
                slug: 'domain',
                concepts: [
                  {
                    name: 'Openable',
                    slug: 'openable',
                    status: 'in_progress',
                    confidence: 0.5,
                    practice_count: 0,
                    explain_count: 0,
                    last_explained: null,
                    last_practiced: null,
                    details: ['Detail'],
                  },
                  {
                    name: 'Missing',
                    slug: 'missing',
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
            readmePaths: { openable: '/topics/topic/exercises/openable/README.md' },
            showDetails: true,
            onReadmeSelected: (path: string) => (selected.value = path),
          });
      },
    });
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(Wrapper);
    app.mount(host);
    const buttons = Array.from(host.querySelectorAll('button'));
    const open = buttons.find((button) => button.textContent?.includes('1.1 Openable'));
    expect(open).toBeTruthy();
    expect(open?.getAttribute('aria-label')).toBe('open 1.1 Openable');
    expect(buttons.some((button) => button.textContent?.includes('1.2 Missing'))).toBe(false);
    open?.click();
    await nextTick();
    expect(selected.value).toBe('/topics/topic/exercises/openable/README.md');
    expect(host.textContent).toContain('1.1.1 Detail');
    app.unmount();
  });

  it('keeps details hidden in the compact default presentation', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(
      defineComponent({
        setup: () => () =>
          h(MasteryTree, {
            domains: [
              {
                name: 'Domain',
                slug: 'domain',
                concepts: [
                  {
                    name: 'Concept',
                    slug: 'concept',
                    status: 'unexplored',
                    confidence: 0,
                    practice_count: 0,
                    explain_count: 0,
                    last_explained: null,
                    last_practiced: null,
                    details: ['Hidden detail'],
                  },
                ],
              },
            ],
          }),
      }),
    );
    app.mount(host);
    expect(host.textContent).not.toContain('Hidden detail');
    app.unmount();
  });
});
