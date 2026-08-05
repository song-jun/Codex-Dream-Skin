/**
 * 全局导出状态 store
 *
 * 关键设计：把"是否正在导出"放在 Pinia 里，**跨页面持续存在**。
 * - 用户在 /generate 触发一键全部导出后，可任意切换页面
 * - App.vue 顶部状态条始终展示进度（持久性 loading）
 * - 导出结束（在哪个页面结束都行）由 store 统一把 isExporting 置 false
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useExportStore = defineStore('export', () => {
  /** 是否正在导出（一键全部导出） */
  const isExporting = ref(false);
  /** 进度信息 */
  const total = ref(0);
  const done = ref(0);
  const currentTag = ref('');
  /** 触发器：自增即可让其他组件响应（用于从任意位置触发 /generate 的导出） */
  const trigger = ref(0);

  const progressText = computed(() => {
    if (!isExporting.value) return '';
    if (total.value === 0) return '准备中…';
    if (currentTag.value) {
      // done 已达 total 时显示 total/total（避免 done+1 越界成 64/63）
      const left = done.value >= total.value ? total.value : done.value + 1;
      return `导出中 (${left}/${total.value})：${currentTag.value}`;
    }
    return `导出中 (${done.value}/${total.value})`;
  });

  const percent = computed(() => {
    if (total.value === 0) return 0;
    return Math.round((done.value / total.value) * 100);
  });

  function start(totalCount: number) {
    isExporting.value = true;
    total.value = totalCount;
    done.value = 0;
    currentTag.value = '';
  }

  function update(doneCount: number, tag: string) {
    done.value = doneCount;
    currentTag.value = tag;
  }

  function setCurrentTag(tag: string) {
    currentTag.value = tag;
  }

  function finish() {
    isExporting.value = false;
    total.value = 0;
    done.value = 0;
    currentTag.value = '';
  }

  function requestTrigger() {
    trigger.value++;
  }

  return {
    isExporting,
    total,
    done,
    currentTag,
    trigger,
    progressText,
    percent,
    start,
    update,
    setCurrentTag,
    finish,
    requestTrigger,
  };
});
