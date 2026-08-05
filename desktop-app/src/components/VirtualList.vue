<template>
  <div ref="containerRef" class="vlist" @scroll.passive="onScroll">
    <div class="vlist-spacer" :style="{ height: totalHeight + 'px' }">
      <div
        v-for="item in visibleItems"
        :key="item.__index"
        class="vlist-item"
        :style="itemStyle(item.__index)"
      >
        <slot :item="item.value" :index="item.__index" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';

interface Props {
  items: any[];
  lineHeight?: number;
  buffer?: number;
}
const props = withDefaults(defineProps<Props>(), {
  lineHeight: 22,
  buffer: 6
});

const containerRef = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const viewportHeight = ref(0);

// vlist-spacer 总高度 = items 总行数 * 行高
const totalHeight = computed(() => props.items.length * props.lineHeight);

const startIndex = computed(() => {
  const i = Math.floor(scrollTop.value / props.lineHeight) - props.buffer;
  return Math.max(0, i);
});

const endIndex = computed(() => {
  const visible = Math.ceil(viewportHeight.value / props.lineHeight) + props.buffer * 2;
  return Math.min(props.items.length, startIndex.value + visible);
});

const visibleItems = computed(() => {
  // 包装成 { value, __index }：避免对字符串做 spread 产生 {0: char} 这种副作用
  const out: { __index: number; value: any }[] = [];
  for (let i = startIndex.value; i < endIndex.value; i++) {
    if (props.items[i] !== undefined) out.push({ __index: i, value: props.items[i] });
  }
  return out;
});

function itemStyle(index: number) {
  return {
    height: props.lineHeight + 'px',
    transform: `translateY(${index * props.lineHeight}px)`,
    lineHeight: props.lineHeight + 'px'
  };
}

function onScroll() {
  if (containerRef.value) scrollTop.value = containerRef.value.scrollTop;
}

let ro: ResizeObserver | null = null;
function measure() {
  if (!containerRef.value) return;
  viewportHeight.value = containerRef.value.clientHeight;
}

onMounted(async () => {
  await nextTick();
  measure();
  if (containerRef.value && 'ResizeObserver' in window) {
    ro = new ResizeObserver(measure);
    ro.observe(containerRef.value);
  }
});

onBeforeUnmount(() => {
  if (ro) ro.disconnect();
});
</script>

<style scoped>
.vlist {
  height: 100%;
  width: 100%;
  overflow: auto;
  position: relative;
}
.vlist-spacer {
  position: relative;
  width: max-content;
  min-width: 100%;
}
/* 关键：spacer 实际高度用内联 paddingBottom 撑出，让垂直滚动条工作 */
.vlist-item {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  padding: 0 8px;
  font-family: 'Fira Code', 'Consolas', 'Monaco', monospace;
  font-size: 12.5px;
  white-space: nowrap;
  overflow: hidden;
  width: max-content;
  min-width: 100%;
}
.vlist :deep(.json-line),
.vlist :deep(.code-line) {
  white-space: pre;
}
</style>
