import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import 'element-plus/dist/index.css'
import './styles.css'
import './styles/api-workbench.scss'
import App from './App.vue'
import router from './router'
import { registerGlobalErrorRecording } from './utils/errorRecords'

async function bootstrap() {
  registerGlobalErrorRecording()
  window.__RUNTIME_ENV__ = window.__RUNTIME_ENV__ || {}
  if (window.electronAPI?.getOpenApiEnv) {
    try {
      const env = await window.electronAPI.getOpenApiEnv()
      for (const [key, value] of Object.entries(env)) {
        window.__RUNTIME_ENV__[key] = value
        window.__RUNTIME_ENV__[`VITE_${key}`] = value
      }
    } catch {
      // 环境变量读取失败时继续使用 API Workbench 内置默认值。
    }
  }

  createApp(App).use(ElementPlus).use(createPinia()).use(router).mount('#app')
}

void bootstrap()
