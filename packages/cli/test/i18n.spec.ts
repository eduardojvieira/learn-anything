import { afterEach, describe, expect, it } from 'vitest';
import { detectSystemLocale, getMessages, resolveLocale } from '../src/i18n/index.js';

const originalLang = process.env.LANG;
afterEach(() => {
  if (originalLang === undefined) delete process.env.LANG;
  else process.env.LANG = originalLang;
});

describe('i18n', () => {
  it('resolves Spanish directly and from the system locale', () => {
    process.env.LANG = 'es_AR.UTF-8';
    expect(resolveLocale('es')).toBe('es');
    expect(detectSystemLocale()).toBe('es');
  });

  it('has complete localized CLI catalogs', () => {
    for (const locale of ['en', 'es', 'zh-CN'] as const) {
      const messages = getMessages(locale);
      expect(messages.cli.context7Option).toBeTruthy();
      expect(messages.cli.noContext7Option).toBeTruthy();
      expect(messages.init.topicCommandDescription).toBeTruthy();
      expect(messages.init.quizCommandDescription).toBeTruthy();
      expect(messages.init.quizCommandDescription.toLowerCase()).not.toContain('saved');
      expect(messages.init.quizCommandDescription.toLowerCase()).not.toContain('re-practice');
    }
  });
});
