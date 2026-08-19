import type { SupportedLocale, LocaleMessages } from './types.js';
import { zhCN } from './locales/zh-CN.js';
import { en } from './locales/en.js';
import { es } from './locales/es.js';

const messages: Record<SupportedLocale, LocaleMessages> = {
  'zh-CN': zhCN,
  en,
  es,
};

export function getMessages(locale: SupportedLocale): LocaleMessages {
  return messages[locale];
}

export function detectSystemLocale(): SupportedLocale {
  const langEnv = process.env.LANG || process.env.LC_ALL || process.env.LANGUAGE || '';

  if (/^zh[_-]/i.test(langEnv)) {
    return 'zh-CN';
  }
  if (/^es[_-]?/i.test(langEnv)) return 'es';
  return 'en';
}

export function resolveLocale(cliFlag?: string): SupportedLocale {
  if (cliFlag === 'zh-CN' || cliFlag === 'en' || cliFlag === 'es') {
    return cliFlag;
  }
  if (cliFlag) {
    // Unknown locale flag — warn and fall back
    console.warn(`Unknown locale "${cliFlag}", falling back to system default.`);
  }
  return detectSystemLocale();
}

export type { SupportedLocale, LocaleMessages, ServeMessages } from './types.js';
