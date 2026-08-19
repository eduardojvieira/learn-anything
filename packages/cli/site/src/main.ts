import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { initTopicData } from './composables/useTopicData';
import { initI18n } from './composables/useI18n';
import './styles/main.css';

async function bootstrap() {
  await initI18n();
  await initTopicData();
  const app = createApp(App);
  app.use(router);
  app.mount('#app');
}

bootstrap();
