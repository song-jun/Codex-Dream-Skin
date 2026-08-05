<template>
  <div class="page-container">
    <!-- 进度反馈移到顶栏（export store 持有，跨页面持续）
         按钮上的 :loading 已替代原页面级 v-loading，避免遮挡通知 -->
    <div class="page-header">
      <div>
        <h2 class="page-title">生成代码</h2>
        <p class="sub-tip">
          从已加载的 OpenAPI 文档生成 TypeScript 类型定义和 API 请求函数
        </p>
      </div>
      <el-button :disabled="!docStore.doc" @click="openUrlPrefixDialog">
        <el-icon><Setting /></el-icon>
        <span>业务前缀：{{ urlPrefix }}</span>
      </el-button>
    </div>

    <el-alert
      v-if="!docStore.doc"
      title="请先在「OpenAPI 文档」页加载文档"
      type="info"
      :closable="false"
      show-icon
    />

    <template v-else>
      <el-row :gutter="16" class="generate-main">
        <el-col :span="9" class="generate-col">
          <EndpointTree
            :mode="mode"
            :search-text="searchText"
            :selected="selectedEndpoints"
            :expanded-tags="expandedTags"
            :select-all="selectAll"
            :filtered-tags="filteredTags"
            :filtered-endpoint-count="filteredEndpointCount"
            @update:mode="(v) => (mode = v)"
            @update:search-text="(v) => (searchText = v)"
            @update:selected="(v) => (selectedEndpoints = v)"
            @update:expanded-tags="(v) => (expandedTags = v)"
            @update:select-all="(v) => (selectAll = v)"
          />
        </el-col>
        <el-col :span="15" class="generate-col">
          <PreviewPanel
            :generated-code="generatedCode"
            :is-generating="isGenerating"
            :is-saving="isSaving"
            :is-exporting="exportStore.isExporting"
            :progress-text="exportStore.progressText"
            :mode="mode"
            :selected-count="selectedEndpoints.length"
            :has-doc="!!docStore.doc"
            :endpoints-length="docStore.endpoints.length"
            :current-code="currentCode"
            :current-code-lines="currentCodeLines"
            :tab="previewTab"
            @generate="onGenerate"
            @save="onSave"
            @save-all="onSaveAll"
            @copy="onCopy"
            @copy-file="copyFile"
            @update:tab="(v) => (previewTab = v)"
          />
        </el-col>
      </el-row>
    </template>

    <UrlPrefixDialog
      v-model="urlPrefixDialogVisible"
      v-model:draft="urlPrefixDraft"
      @confirm="onConfirmUrlPrefix"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Generate.vue - 一键代码生成（编排层）
 * - 状态：mode、searchText、selectedEndpoints、generatedCode、urlPrefix
 * - 共用 composables：useEndpointFilter（搜索/筛选）、useExport（保存/全部导出）
 * - 页面级 handler：copy*（preview 区域）、openUrlPrefixDialog、onConfirmUrlPrefix、onGenerate
 * - 视图层已拆出：EndpointTree（左侧）/ PreviewPanel（右侧）/ UrlPrefixDialog
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { ElMessage } from "element-plus";
import { Setting } from "@element-plus/icons-vue";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import "highlight.js/styles/atom-one-light.css";
import { useDocStore } from "@/stores/doc";
import { useExportStore } from "@/stores/export";
import type { IGeneratedCode } from "@/core/types";
import { generateCode, generateCodeForMultipleEndpoints } from "@/core/generator";
import { inferUrlPrefixFromApiUrl, DEFAULT_URL_PREFIX } from "@/core/env";
import { escapeHtml } from "@/utils/escapeHtml";
import { copyToClipboard } from "@/utils/clipboard";
import { useEndpointFilter } from "@/composables/useEndpointFilter";
import { useExport } from "@/composables/useExport";
import EndpointTree from "@/components/generate/EndpointTree.vue";
import PreviewPanel from "@/components/generate/PreviewPanel.vue";
import UrlPrefixDialog from "@/components/generate/UrlPrefixDialog.vue";

hljs.registerLanguage("typescript", typescript);

const docStore = useDocStore();
const exportStore = useExportStore();

// ===== 状态 =====
const mode = ref<"module" | "single">("module");
const searchText = ref("");
const searchTextDebounced = ref("");
let _searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(searchText, (v) => {
  if (_searchTimer) clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => {
    searchTextDebounced.value = v;
  }, 200);
});
// 组件卸载时清理 debounce 定时器，避免 setState on unmounted component
onBeforeUnmount(() => {
  if (_searchTimer) {
    clearTimeout(_searchTimer);
    _searchTimer = null;
  }
});
const selectedEndpoints = ref<any[]>([]);
const previewTab = ref<"type" | "index">("type");
const expandedTags = ref<Record<string, boolean>>({});
const selectAll = ref(false);
const generatedCode = ref<IGeneratedCode | null>(null);
const isGenerating = ref(false);

const urlPrefix = ref(DEFAULT_URL_PREFIX);
const urlPrefixDialogVisible = ref(false);
const urlPrefixDraft = ref(DEFAULT_URL_PREFIX);

onMounted(() => {
  if (docStore.sourceUrl) {
    const inferred = inferUrlPrefixFromApiUrl(docStore.sourceUrl);
    if (inferred) urlPrefix.value = inferred;
  }
});

// ===== 共用 composables =====
const { filteredTags, filteredCount: filteredEndpointCount } = useEndpointFilter(
  computed(() => docStore.endpoints),
  searchTextDebounced,
);
const { isSaving, onSave, onSaveAll } = useExport({
  selectedEndpoints,
  generatedCode,
  urlPrefix,
});

// ===== 预览（type.ts / index.ts） =====
const currentCode = computed(() => {
  if (!generatedCode.value) return "";
  return previewTab.value === "type"
    ? generatedCode.value.typeFile
    : generatedCode.value.indexFile;
});

const currentCodeLines = computed(() => {
  if (!currentCode.value) return [] as string[];
  const src = currentCode.value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  try {
    return hljs.highlight(src, { language: "typescript" }).value.split("\n");
  } catch {
    return src.split("\n").map(escapeHtml);
  }
});

// ===== 复制（整段 / 单 tab） =====
async function copyFile(which: "type" | "index") {
  if (!generatedCode.value) return;
  const content = which === "type" ? generatedCode.value.typeFile : generatedCode.value.indexFile;
  await copyToClipboard(content, `已复制 ${which}.ts 到剪贴板`);
}
async function onCopy() {
  if (!currentCode.value) return;
  await copyToClipboard(currentCode.value, "已复制到剪贴板");
}

// ===== tag 折叠：filteredTags 变化时自动展开新 tag =====
watch(
  () => filteredTags.value,
  (groups) => {
    groups.forEach((t) => {
      if (expandedTags.value[t.name] === undefined)
        expandedTags.value[t.name] = true;
    });
  },
  { immediate: true },
);

// ===== URL 前缀弹窗 =====
function openUrlPrefixDialog() {
  urlPrefixDraft.value = urlPrefix.value;
  urlPrefixDialogVisible.value = true;
}
function onConfirmUrlPrefix() {
  urlPrefix.value = urlPrefixDraft.value || "/";
  urlPrefixDialogVisible.value = false;
  ElMessage.success("业务前缀已更新");
}

// ===== 手动触发生成（按钮触发 + setTimeout 50 让 loading 先渲染） =====
function onGenerate() {
  if (!docStore.doc || selectedEndpoints.value.length === 0) {
    ElMessage.warning("请先选择至少一个接口");
    return;
  }
  if (isGenerating.value) return;
  isGenerating.value = true;
  setTimeout(async () => {
    try {
      const doc = docStore.doc!;
      generatedCode.value =
        mode.value === "single" && selectedEndpoints.value.length === 1
          ? generateCode(doc, selectedEndpoints.value[0], urlPrefix.value)
          : await generateCodeForMultipleEndpoints(doc, selectedEndpoints.value, urlPrefix.value);
      ElMessage.success(`已生成 ${selectedEndpoints.value.length} 个接口的代码`);
    } catch (e) {
      ElMessage.error("生成失败：" + (e instanceof Error ? e.message : String(e)));
      generatedCode.value = null;
    } finally {
      isGenerating.value = false;
    }
  }, 50);
}
</script>

<style scoped>
/* 父级只保留布局类（卡片内部样式已下沉到子组件） */
.generate-main {
  height: calc(100% - 80px);
}
.generate-col {
  height: 100%;
}
</style>
