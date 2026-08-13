<!-- 错误记录工作区：展示本地保留的原始错误详情，并支持单条或全部删除。 -->
<template>
  <section class="error-records-page">
    <header class="error-records-header">
      <div>
        <div class="eyebrow">{{ errorRecordUi.eyebrow }}</div>
        <h2>{{ errorRecordUi.title }}</h2>
        <p>{{ errorRecordUi.description }}</p>
      </div>
      <el-button
        :disabled="errorRecords.length === 0"
        plain
        type="danger"
        @click="clearErrorRecords"
      >
        <el-icon><Delete /></el-icon>
        <span>{{ errorRecordUi.clear }}</span>
      </el-button>
    </header>

    <el-empty v-if="errorRecords.length === 0" :description="errorRecordUi.empty" />
    <el-collapse v-else class="error-record-list">
      <el-collapse-item v-for="record in errorRecords" :key="record.id" :name="record.id">
        <template #title>
          <div class="error-record-title">
            <span>{{ record.source }}</span>
            <time :datetime="record.createdAt">{{ formatTime(record.createdAt) }}</time>
          </div>
        </template>
        <div class="error-record-content">
          <div class="error-record-actions">
            <el-button size="small" text type="danger" @click="removeErrorRecord(record.id)">
              <el-icon><Delete /></el-icon>
              <span>{{ errorRecordUi.delete }}</span>
            </el-button>
          </div>
          <dl>
            <dt>{{ errorRecordUi.source }}</dt>
            <dd>{{ record.source }}</dd>
            <dt>{{ errorRecordUi.detail }}</dt>
            <dd><pre>{{ record.detail }}</pre></dd>
          </dl>
        </div>
      </el-collapse-item>
    </el-collapse>
  </section>
</template>

<script setup lang="ts">
/** 错误记录主工作区组件。 */
import { Delete } from "@element-plus/icons-vue";
import {
  clearErrorRecords,
  errorRecords,
  removeErrorRecord,
} from "@/utils/errorRecords";
import { errorRecordUi } from "@/components/error-records/errorRecordUi";

/** 将 ISO 时间转换为本地完整时间。 */
function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return errorRecordUi.unknownTime;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
</script>

<style scoped>
.error-records-page { display: grid; gap: 20px; max-width: 1120px; margin: 0 auto; padding: 28px; }
.error-records-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.error-records-header h2 { margin: 5px 0 8px; color: var(--text-primary); font-size: 24px; }
.error-records-header p { max-width: 640px; margin: 0; color: var(--text-secondary); line-height: 1.6; }
.error-record-list { border-top: 1px solid var(--border-color); }
.error-record-title { display: flex; min-width: 0; flex: 1; align-items: center; justify-content: space-between; gap: 16px; padding-right: 12px; font-weight: 600; }
.error-record-title time { flex: 0 0 auto; color: var(--text-secondary); font-size: 12px; font-weight: 400; }
.error-record-content { padding: 0 4px 12px; }
.error-record-actions { display: flex; justify-content: flex-end; margin-bottom: 8px; }
.error-record-content dl { display: grid; grid-template-columns: 116px minmax(0, 1fr); gap: 10px 16px; margin: 0; }
.error-record-content dt { color: var(--text-secondary); font-size: 13px; }
.error-record-content dd { min-width: 0; margin: 0; color: var(--text-primary); }
.error-record-content pre { max-height: 320px; margin: 0; padding: 12px; overflow: auto; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-soft); color: var(--text-primary); font-family: Consolas, Monaco, monospace; font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
@media (max-width: 720px) { .error-records-page { padding: 20px; } .error-records-header { display: grid; } .error-record-content dl { grid-template-columns: 1fr; gap: 6px; } .error-record-title { align-items: flex-start; flex-direction: column; gap: 2px; } }
</style>
