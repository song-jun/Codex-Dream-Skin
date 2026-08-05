<template>
  <el-card shadow="never" class="card-full" body-style="height: 100%; padding: 0; display: flex; flex-direction: column;">
    <div class="response-header">
      <span class="response-title">响应结果</span>
      <el-tag
        v-if="response"
        :type="response.success ? 'success' : 'danger'"
        size="small"
      >
        {{ response.statusCode }} · {{ response.responseTime }}ms
      </el-tag>
    </div>

    <div v-if="error" class="response-error">
      <el-alert :title="error" type="error" :closable="false" />
    </div>

    <div class="response-body">
      <template v-if="response && formattedResponse">
        <pre class="code-block">{{ displayResponse }}</pre>
        <div v-if="truncated" class="truncation-hint">
          响应内容过长，已截断显示前 {{ truncateThreshold }} 字符（共 {{ totalLength }} 字符）
        </div>
      </template>
      <el-empty
        v-else
        :image-size="80"
        :description="isInvoking ? '请求进行中…' : '尚未发送请求'"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { IInvokeResponse } from '@/core/types';
import { RESPONSE_TRUNCATE_THRESHOLD } from '@/core/env';
import { formatJson } from '@/utils/formatJson';

/**
 * 响应结果面板
 * - 顶部：标题 + 状态码/响应时间 tag
 * - 中部：错误提示（alert）
 * - 底部：响应 body（JSON 格式化 + 超长截断提示）
 */
const props = defineProps<{
  response: IInvokeResponse | null;
  error: string;
  isInvoking: boolean;
}>();

const truncateThreshold = computed(() => RESPONSE_TRUNCATE_THRESHOLD);

const formattedResponse = computed(() => {
  if (!props.response || props.response.data === undefined) return '';
  return formatJson(props.response.data);
});

/** 实际显示的内容：超过阈值时截断到阈值（避免大响应卡 UI） */
const displayResponse = computed(() => {
  const text = formattedResponse.value;
  if (text.length > truncateThreshold.value) {
    return text.slice(0, truncateThreshold.value);
  }
  return text;
});

/** 真实长度（用于"共 N 字符"提示） */
const totalLength = computed(() => formattedResponse.value.length);

const truncated = computed(
  () => totalLength.value > truncateThreshold.value
);
</script>

<style scoped>
.card-full { height: 100%; }
.response-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
}
.response-title {
  font-weight: 600;
  font-size: 14px;
  color: #111827;
}
.response-error {
  padding: 8px 16px 0;
}
.response-body {
  flex: 1;
  padding: 12px 16px;
  overflow: auto;
}
.code-block {
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #1e293b;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}
.truncation-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #d97706;
  padding: 6px 10px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 4px;
}
</style>
