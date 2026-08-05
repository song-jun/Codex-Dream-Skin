import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getDefaultInvokeConfig, DEFAULT_URL_PREFIX } from '@/core/env';
import type { IInvokeConfig } from '@/core/types';

const CONFIG_KEY = 'apiWorkbench.invokeConfig';

export const useConfigStore = defineStore('config', () => {
  // 用函数获取默认值：reloadEnv 后重新 init 即可拿到最新 env 值
  const config = ref<IInvokeConfig>(getDefaultInvokeConfig());

  function load() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // 用 getDefaultInvokeConfig() 而不是快照：实时反映最新的 env 默认值
        config.value = { ...getDefaultInvokeConfig(), ...parsed };
      } else {
        config.value = getDefaultInvokeConfig();
      }
    } catch {
      /* ignore */
    }
  }

  function save() {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config.value));
    } catch {
      /* ignore */
    }
  }

  const urlPrefix = computed(() => config.value.urlPrefix || DEFAULT_URL_PREFIX);

  return { config, load, save, urlPrefix };
});
