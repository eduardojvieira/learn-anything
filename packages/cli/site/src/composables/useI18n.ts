import { ref } from 'vue';
import en, { type I18nKey } from './locales/en';
import zhCN from './locales/zh-CN';
import es from './locales/es';

export type { I18nKey } from './locales/en';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type Locale = 'en' | 'es' | 'zh-CN';

type Messages = Record<I18nKey, string>;

const messages: Record<Locale, Messages> = { en, es, 'zh-CN': zhCN };

/* ------------------------------------------------------------------ */
/*  Shared state (singleton across components)                        */
/* ------------------------------------------------------------------ */

const THEME_KEY = 'learn-anything-theme';
export type UiConfig = { version: 1; locale: Locale; timezone: string; numbering: 'hierarchical' };
const config = ref<UiConfig>({
  version: 1,
  locale: 'en',
  timezone: 'UTC',
  numbering: 'hierarchical',
});

const locale = ref<Locale>('en');
const saving = ref(false);
const error = ref<string | null>(null);

function validConfig(value: unknown): value is UiConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Record<string, unknown>;
  if (
    Object.keys(config).length !== 4 ||
    !['version', 'locale', 'timezone', 'numbering'].every((key) => Object.hasOwn(config, key))
  )
    return false;
  if (
    config.version !== 1 ||
    !['en', 'es', 'zh-CN'].includes(config.locale as string) ||
    config.numbering !== 'hierarchical' ||
    typeof config.timezone !== 'string'
  )
    return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: config.timezone });
    return true;
  } catch {
    return false;
  }
}

function applyLocale(next: Locale): void {
  locale.value = next;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
    document.title = `${messages[next]['dashboard.title']} — Learn Anything`;
  }
}

export async function initI18n(): Promise<boolean> {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) return false;
    const payload = (await response.json()) as { config: UiConfig; revision: string };
    if (
      validConfig(payload.config) &&
      typeof payload.revision === 'string' &&
      /^[a-f0-9]{64}$/.test(payload.revision)
    ) {
      config.value = payload.config;
      applyLocale(payload.config.locale);
      revision.value = payload.revision;
      return true;
    }
  } catch {
    /* dashboard remains readable without config */
  }
  return false;
}
const revision = ref<string | null>(null);

/* ------------------------------------------------------------------ */
/*  Composable                                                        */
/* ------------------------------------------------------------------ */

export function useI18n() {
  const t = (key: I18nKey): string => {
    return messages[locale.value][key];
  };

  const toggleLocale = (): void => {
    void setLocale(locale.value === 'en' ? 'es' : locale.value === 'es' ? 'zh-CN' : 'en');
  };
  const setLocale = async (next: Locale): Promise<boolean> => {
    if (saving.value || next === locale.value) return true;
    const previous = locale.value;
    applyLocale(next);
    error.value = null;
    if (!revision.value) {
      applyLocale(previous);
      error.value = t('lang.saveError');
      return false;
    }
    const nextConfig = { ...config.value, locale: next };
    saving.value = true;
    try {
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': `"${revision.value}"` },
        body: JSON.stringify(nextConfig),
      });
      if (response.status === 412) {
        if (!(await initI18n())) applyLocale(previous);
        error.value = t('lang.saveError');
        return false;
      }
      if (!response.ok) throw new Error();
      const payload = (await response.json()) as { config: UiConfig; revision: string };
      if (
        !validConfig(payload.config) ||
        typeof payload.revision !== 'string' ||
        !/^[a-f0-9]{64}$/.test(payload.revision)
      )
        throw new Error();
      config.value = payload.config;
      revision.value = payload.revision;
      applyLocale(payload.config.locale);
      return true;
    } catch {
      applyLocale(previous);
      error.value = t('lang.saveError');
      return false;
    } finally {
      saving.value = false;
    }
  };

  const isDark = ref<boolean>(
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false,
  );

  const toggleDarkMode = (): void => {
    const next = !isDark.value;
    isDark.value = next;
    document.documentElement.classList.toggle('dark', next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
    }
  };

  return { locale, config, saving, error, t, toggleLocale, setLocale, isDark, toggleDarkMode };
}

export function __resetI18nForTest(): void {
  config.value = { version: 1, locale: 'en', timezone: 'UTC', numbering: 'hierarchical' };
  revision.value = null;
  saving.value = false;
  error.value = null;
  applyLocale('en');
}
