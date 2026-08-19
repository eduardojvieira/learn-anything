import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetI18nForTest, initI18n, useI18n } from '@/composables/useI18n';

const revision = 'a'.repeat(64);
const nextRevision = 'b'.repeat(64);
const spanish = {
  version: 1 as const,
  locale: 'es' as const,
  timezone: 'America/Argentina/Buenos_Aires',
  numbering: 'hierarchical' as const,
};
afterEach(() => {
  __resetI18nForTest();
  vi.unstubAllGlobals();
});

describe('useI18n config authority', () => {
  it('loads a valid canonical Spanish config into state and document', async () => {
    vi.stubGlobal('document', {
      documentElement: { lang: '', classList: { contains: () => false, toggle: () => undefined } },
      title: '',
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ config: spanish, revision }), { status: 200 }),
        ),
    );
    await initI18n();
    const state = useI18n();
    expect(state.locale.value).toBe('es');
    expect(state.config.value).toEqual(spanish);
    expect(document.documentElement.lang).toBe('es');
  });
  it('does not publish invalid config payloads', async () => {
    for (const payload of [
      { config: { ...spanish, version: 2 }, revision },
      { config: { ...spanish, locale: 'fr' }, revision },
      { config: { ...spanish, timezone: 'No/Zone' }, revision },
      { config: { ...spanish, numbering: 'flat' }, revision },
      { config: spanish, revision: 'bad' },
      { config: { ...spanish, extra: true }, revision },
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })),
      );
      await initI18n();
      expect(useI18n().locale.value).toBe('en');
    }
  });
  it('persists full config and adopts the returned canonical revision', async () => {
    const chinese = { ...spanish, locale: 'zh-CN' as const, timezone: 'UTC' };
    vi.stubGlobal('document', {
      documentElement: { lang: '', classList: { contains: () => false, toggle: () => undefined } },
      title: '',
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ config: spanish, revision }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ config: chinese, revision: nextRevision }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetch);
    await initI18n();
    const state = useI18n();
    await expect(state.setLocale('zh-CN')).resolves.toBe(true);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ ...spanish, locale: 'zh-CN' });
    expect(fetch.mock.calls[1][1].headers['If-Match']).toBe(`"${revision}"`);
    expect(state.config.value).toEqual(chinese);
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.title).toContain('Learn Anything');
  });
  it('reconciles a 412 to canonical config and uses its revision next', async () => {
    const english = { ...spanish, locale: 'en' as const, timezone: 'UTC' };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ config: spanish, revision }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('', { status: 412 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ config: english, revision: nextRevision }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ config: { ...english, locale: 'zh-CN' }, revision: 'c'.repeat(64) }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetch);
    await initI18n();
    const state = useI18n();
    await expect(state.setLocale('zh-CN')).resolves.toBe(false);
    expect(state.locale.value).toBe('en');
    expect(state.error.value).toBe(state.t('lang.saveError'));
    await state.setLocale('zh-CN');
    expect(fetch.mock.calls[3][1].headers['If-Match']).toBe(`"${nextRevision}"`);
  });
  it('keeps a canonical requested locale after a 412 reconciliation', async () => {
    const canonical = { ...spanish, locale: 'zh-CN' as const, timezone: 'UTC' };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ config: spanish, revision }), { status: 200 }),
        )
        .mockResolvedValueOnce(new Response('', { status: 412 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ config: canonical, revision: nextRevision }), {
            status: 200,
          }),
        ),
    );
    await initI18n();
    const state = useI18n();
    await expect(state.setLocale('zh-CN')).resolves.toBe(false);
    expect(state.locale.value).toBe('zh-CN');
    expect(state.config.value).toEqual(canonical);
  });
  it('does not publish an in-memory locale without a revision', async () => {
    const state = useI18n();
    await expect(state.setLocale('es')).resolves.toBe(false);
    expect(state.locale.value).toBe('en');
    expect(state.error.value).toBe(state.t('lang.saveError'));
  });
  it('persists a full config with If-Match and rolls back a failed save', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ config: spanish, revision }), { status: 200 }),
      )
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetch);
    await initI18n();
    const state = useI18n();
    await expect(state.setLocale('zh-CN')).resolves.toBe(false);
    expect(state.locale.value).toBe('es');
    expect(state.error.value).toBe(state.t('lang.saveError'));
    expect(fetch.mock.calls[1][1].headers['If-Match']).toBe(`"${revision}"`);
  });
});
