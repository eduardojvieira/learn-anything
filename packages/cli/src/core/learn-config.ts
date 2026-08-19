import { z } from 'zod';
import { StateAlreadyExistsError, StateStore, type StateSnapshot } from './state-store/index.js';
import type { SupportedLocale } from '../i18n/types.js';

export const learnConfigSchema = z
  .object({
    version: z.literal(1),
    locale: z.enum(['en', 'es', 'zh-CN']),
    timezone: z.string().refine((value) => isIanaTimezone(value), 'Invalid IANA timezone'),
    numbering: z.literal('hierarchical'),
  })
  .strict();

export type LearnConfig = z.infer<typeof learnConfigSchema>;

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function defaultLearnConfig(
  locale: SupportedLocale = systemLocale(),
  timezone = runtimeTimezone(),
): LearnConfig {
  return {
    version: 1,
    locale,
    timezone: isIanaTimezone(timezone) ? timezone : 'UTC',
    numbering: 'hierarchical',
  };
}

export function runtimeTimezone(): string {
  const value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return value && isIanaTimezone(value) ? value : 'UTC';
}

function systemLocale(): SupportedLocale {
  const value = process.env.LANG || process.env.LC_ALL || process.env.LANGUAGE || '';
  if (/^zh[_-]/i.test(value)) return 'zh-CN';
  if (/^es[_-]?/i.test(value)) return 'es';
  return 'en';
}

export function learnConfigStore(learnDir: string): StateStore<LearnConfig> {
  return new StateStore<LearnConfig>(learnDir, {
    fileName: 'config.json',
    validate: (value) => {
      learnConfigSchema.parse(value);
    },
  });
}

export async function initializeLearnConfig(
  learnDir: string,
  locale?: SupportedLocale,
): Promise<StateSnapshot<LearnConfig>> {
  const store = learnConfigStore(learnDir);
  try {
    return await store.initialize(defaultLearnConfig(locale));
  } catch (error) {
    if (!(error instanceof StateAlreadyExistsError)) throw error;
    const current = await store.read();
    return locale ? store.transact(current.revision, (config) => ({ ...config, locale })) : current;
  }
}

/** Missing config is initialized; invalid existing config is deliberately surfaced. */
export const loadOrInitializeLearnConfig = initializeLearnConfig;

export async function updateLearnConfig(
  learnDir: string,
  expectedRevision: string,
  config: LearnConfig,
): Promise<StateSnapshot<LearnConfig>> {
  learnConfigSchema.parse(config);
  return learnConfigStore(learnDir).transact(expectedRevision, () => config);
}
