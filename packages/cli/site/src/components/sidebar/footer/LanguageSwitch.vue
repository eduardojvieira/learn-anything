<script setup lang="ts">
import { useI18n } from '@/composables/useI18n';

const { locale, saving, error, setLocale, t } = useI18n();
</script>

<template>
  <label class="text-xs font-medium text-text-2">
    <span class="sr-only">{{ t('lang.switch') }}</span>
    <select class="min-h-11" :value="locale" :disabled="saving" :aria-busy="saving" :aria-label="t('lang.switch')" @change="setLocale(($event.target as HTMLSelectElement).value as 'en' | 'es' | 'zh-CN')">
      <option value="en">English</option><option value="es">Español</option><option value="zh-CN">中文</option>
    </select>
  </label>
  <p v-if="error" class="sr-only" role="alert">{{ error }}</p>
</template>
