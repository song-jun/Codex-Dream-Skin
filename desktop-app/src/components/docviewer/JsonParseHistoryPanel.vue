<template>
  <section class="history-panel" aria-label="JSON 解析历史">
    <div v-if="items.length > 0" class="history-toolbar">
      <el-button size="small" text type="danger" @click="emit('clear')">
        {{ jsonHistoryUi.clear }}
      </el-button>
    </div>
    <el-empty
      v-if="items.length === 0"
      :image-size="72"
      :description="jsonHistoryUi.empty"
    />
    <div v-else class="history-list">
      <article
        v-for="item in items"
        :key="item.id"
        class="history-item"
        role="button"
        tabindex="0"
        @click="emit('select', item)"
        @keydown.enter.prevent="emit('select', item)"
        @keydown.space.prevent="emit('select', item)"
      >
        <el-icon class="history-item__icon"><Document /></el-icon>
        <span class="history-item__content">
          <span class="history-item__title">{{ item.sourceName || item.title }}</span>
          <span class="history-item__meta">
            <span>{{ item.endpointCount }} {{ jsonHistoryUi.endpointSuffix }}</span>
            <span class="history-item__separator">|</span>
            <time :datetime="item.updatedAt">{{ formatHistoryTime(item.updatedAt) }}</time>
          </span>
        </span>
        <span class="history-item__actions">
          <el-button
            :title="jsonHistoryUi.delete"
            circle
            plain
            size="small"
            type="danger"
            @click.stop="emit('delete', item.id)"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
          <el-icon class="history-item__action"><ArrowRight /></el-icon>
        </span>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
/** JSON 解析历史列表，仅负责展示和选择事件，不处理本地存储或解析业务。 */
import { ArrowRight, Delete, Document } from "@element-plus/icons-vue";
import type { JsonParseHistoryItem } from "@/composables/useDocLoader";
import { jsonHistoryUi } from "@/components/docviewer/jsonHistoryUi";

defineProps<{
  /** 当天成功解析的 JSON 历史记录。 */
  items: JsonParseHistoryItem[];
}>();

const emit = defineEmits<{
  /** 用户选择一条历史记录。 */
  (e: "select", item: JsonParseHistoryItem): void;
  /** 用户删除一条历史记录。 */
  (e: "delete", id: string): void;
  /** 用户清空全部历史记录。 */
  (e: "clear"): void;
}>();

/** 使用本地完整日期、时间和星期显示历史记录的解析时刻。 */
function formatHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return jsonHistoryUi.unknownTime;
  const dateText = date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const timeText = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `${dateText} ${timeText}`;
}
</script>

<style scoped>
.history-panel {
  min-height: 260px;
}

.history-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.history-list {
  display: grid;
  gap: 8px;
}

.history-item {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 64px;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 6px;
  background: var(--el-fill-color-blank, #ffffff);
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}

.history-item:hover {
  border-color: var(--el-color-primary-light-5, #a0cfff);
  background: var(--el-color-primary-light-9, #ecf5ff);
}

.history-item:focus-visible {
  outline: 2px solid var(--el-color-primary, #409eff);
  outline-offset: 2px;
}

.history-item__icon {
  flex: 0 0 auto;
  color: var(--el-color-primary, #409eff);
  font-size: 18px;
}

.history-item__content {
  display: grid;
  min-width: 0;
  gap: 4px;
  flex: 1;
}

.history-item__title {
  overflow: hidden;
  color: var(--el-text-color-primary, #303133);
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-item__meta {
  display: flex;
  gap: 7px;
  color: var(--el-text-color-secondary, #909399);
  font-size: 12px;
}

.history-item__separator {
  color: var(--el-border-color, #dcdfe6);
}

.history-item__action {
  flex: 0 0 auto;
  color: var(--el-text-color-placeholder, #c0c4cc);
}

.history-item__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 768px) {
  .history-item__meta {
    flex-wrap: wrap;
  }
}
</style>
