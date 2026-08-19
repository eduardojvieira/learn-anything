<script setup lang="ts">
import { useI18n } from '@/composables/useI18n';
defineProps<{
  mobileOpen: boolean;
}>();

defineEmits<{
  toggle: [];
  close: [];
}>();
const { t } = useI18n();
</script>

<template>
  <button
    class="ledger-menu grid lg:hidden fixed z-50"
    @click="$emit('toggle')"
  >
    <span class="sr-only">{{ t('ui.menu') }}</span>
    <svg v-if="!mobileOpen" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
    <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  </button>

  <div v-if="mobileOpen" class="lg:hidden fixed inset-0 z-30 bg-black/60" @click="$emit('close')" />
</template>
