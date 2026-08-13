<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <h2 class="page-title">OpenAPI 文档</h2>
        <p class="sub-tip">
          支持 URL 拉取或直接粘贴 JSON
          文档，文档保存在内存中用于「生成」和「调用」页面
        </p>
      </div>
      <div class="header-actions">
        <el-button v-if="docStore.doc" type="danger" plain @click="onClearAll">
          <el-icon><Delete /></el-icon>
          <span>清空文档</span>
        </el-button>
      </div>
    </div>

    <el-row :gutter="16" class="doc-main">
      <!-- 左：加载文档 -->
      <el-col :span="9" class="doc-col">
        <DocLoaderCard
          ref="docLoaderCardRef"
          :url-value="urlValue"
          @update:url-value="(v) => (urlValue = v)"
          :preset-urls="presetUrls"
          :is-loading="isLoading"
          :is-parsing="isParsing"
          :has-error="hasError"
          :error-msg="errorMsg"
          :has-loaded="!!docStore.doc"
          :source-file-name="docStore.sourceFileName"
          :url-history="urlHistory"
          :json-history="jsonHistory"
          :custom-domain="customDomain"
          :custom-config-path="customConfigPath"
          :custom-service-url="customServiceUrl"
          :custom-services="customServices"
          :is-fetching-custom-services="isFetchingCustomServices"
          :has-fetched-custom-services="hasFetchedCustomServices"
          :is-favorite="isFavorite"
          :on-url-blur="onUrlBlur"
          :on-url-select-change="onUrlSelectChange"
          :on-url-history-select="onUrlHistorySelect"
          :on-url-history-del="onUrlHistoryDel"
          :on-toggle-favorite="onToggleFavorite"
          @load="onLoadUrl"
          @parse="onLoadJson"
          @format="onFormatJson"
          @file-loaded="onFileLoaded"
          @history-parse="onHistoryParse"
          @history-delete="deleteJsonHistoryItem"
          @history-clear="clearJsonHistory"
          @update:custom-domain="(value) => (customDomain = value)"
          @update:custom-config-path="(value) => (customConfigPath = value)"
          @update:custom-service-url="(value) => (customServiceUrl = value)"
          @fetch-custom-services="fetchCustomServices"
          @load-custom-document="onLoadCustomDocument"
          @generate="navigateToGenerate"
        />
      </el-col>

      <!-- 右：查看文档 -->
      <el-col :span="15" class="doc-col">
        <DocViewerCard
          :doc="docStore.doc"
          :endpoints="docStore.endpoints"
          :active-tab="activeTab"
          @update:active-tab="(v) => (activeTab = v)"
          :list-collapse-all="listCollapseAll"
          :expanded-tags="expandedTags"
          :selected-tag="selectedTag"
          :search-text="searchText"
          @update:search-text="(v) => (searchText = v)"
          :show-only-mine="showOnlyMine"
          :new-endpoint-keys="newEndpointKeys"
          :missing-endpoint-keys="missingEndpointKeys"
          :missing-endpoints="missingEndpoints"
          :show-only-new="showOnlyNewEndpoints"
          @update:show-only-new="(value) => { showOnlyNewEndpoints = value; if (value) showOnlyMissingEndpoints = false }"
          :show-only-missing="showOnlyMissingEndpoints"
          @update:show-only-missing="(value) => { showOnlyMissingEndpoints = value; if (value) showOnlyNewEndpoints = false }"
          :raw-json="docStore.rawJson"
          :highlight-lines="highlightLines"
          :tag-groups="tagGroups"
          @toggle-tag="toggleTag"
          @select-tag="(n) => (selectedTag = n)"
        />
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { Delete } from "@element-plus/icons-vue";
import router from "@/router";
import { useDocLoader } from "@/composables/useDocLoader";
import type { JsonParseHistoryItem } from "@/composables/useDocLoader";
import { getFileEndpointSnapshotKey } from "@/core/endpointDiff";
import DocLoaderCard from "@/components/docviewer/DocLoaderCard.vue";
import DocViewerCard from "@/components/docviewer/DocViewerCard.vue";
// 仅用主题色（.hljs-attr / .hljs-string / .hljs-number / .hljs-literal）
import "highlight.js/styles/atom-one-light.css";

const {
  docStore,
  urlValue,
  presetUrls,
  isLoading,
  isParsing,
  hasError,
  errorMsg,
  activeTab,
  listCollapseAll,
  expandedTags,
  selectedTag,
  searchText,
  showOnlyMine,
  newEndpointKeys,
  missingEndpointKeys,
  missingEndpoints,
  showOnlyNewEndpoints,
  showOnlyMissingEndpoints,
  highlightLines,
  tagGroups,
  urlHistory,
  jsonHistory,
  customDomain,
  customConfigPath,
  customServiceUrl,
  customServices,
  isFetchingCustomServices,
  hasFetchedCustomServices,
  isFavorite,
  onUrlBlur,
  onUrlSelectChange,
  onUrlHistorySelect,
  onUrlHistoryDel,
  toggleFavorite,
  loadFromUrl,
  fetchCustomServices,
  loadCustomServiceDocument,
  loadFromJson,
  loadHistoryItem,
  deleteJsonHistoryItem,
  clearJsonHistory,
  prettyJson,
  clearAll,
  toggleTag,
} = useDocLoader();

// DocLoaderCard 引用 — 用来直接读写 textarea（避开 Vue 响应式追踪）
const docLoaderCardRef = ref<InstanceType<typeof DocLoaderCard> | null>(null);

function getEditorValue(): string {
  return docLoaderCardRef.value?.getValue() ?? "";
}

function setEditorValue(v: string) {
  docLoaderCardRef.value?.setValue(v);
}

function clearEditor() {
  docLoaderCardRef.value?.clearEditor();
}

function onToggleFavorite() {
  toggleFavorite(urlValue.value);
}

async function onLoadUrl() {
  const ok = await loadFromUrl();
  // URL 加载成功后，把格式化后的 JSON 写回编辑器
  if (ok && docStore.rawJson) {
    setEditorValue(docStore.rawJson);
  }
}

/** 从自定义 Swagger 服务列表加载用户选择的 OpenAPI 文档。 */
async function onLoadCustomDocument() {
  const ok = await loadCustomServiceDocument();
  if (ok && docStore.rawJson) setEditorValue(docStore.rawJson);
}

function onLoadJson() {
  const ok = loadFromJson(getEditorValue());
  if (ok) navigateToGenerate();
}

function onFormatJson() {
  const formatted = prettyJson(getEditorValue());
  if (formatted !== null) {
    setEditorValue(formatted);
  }
}

/**
 * 文件读取由 DocLoaderCard 自己完成（避免父级中间环节），
 * 这里只负责解析：把读到的 text 喂给 docStore。
 */
function onFileLoaded(payload: { name: string; text: string; size: number }) {
  loadFromJson(payload.text, payload.name, getFileEndpointSnapshotKey(payload.name));
}

/** 点击历史记录后重新解析，成功时进入代码生成页面。 */
function onHistoryParse(item: JsonParseHistoryItem) {
  setEditorValue(item.content);
  const ok = loadHistoryItem(item);
  if (ok) navigateToGenerate();
}

/**
 * API Workbench 使用 Hash 路由；所有进入代码生成页的入口统一写 Hash，
 * 让 Electron 渲染进程和 Vue Router 在同一个路由源上切换视图。
 */
function navigateToGenerate() {
  const target = "#/api-workbench/generate";
  if (window.location.hash !== target) {
    window.location.hash = target;
    return;
  }
  void router.replace({ name: "api-workbench-generate" });
}

// 外部清空（清空文档按钮）→ 编辑器也要清空
function onClearAll() {
  clearAll();
  clearEditor();
  urlValue.value = "";
}

// 监听 docStore.doc 变化（loadFromJson / loadFromUrl / clear）
// 兜底：保证编辑器内容与已加载文档同步（用户不会"看着编辑器有内容但解析失败"）
watch(
  () => docStore.rawJson,
  (v) => {
    if (!v) return;
    const cur = getEditorValue();
    if (!cur) {
      setEditorValue(v);
    }
  },
);
</script>

<style scoped lang="scss">
.doc-main {
  height: calc(100% - 80px);
  min-height: 0;
  :deep(.el-tabs__item) {
    padding: 0 10px;
  }
}
.doc-col {
  height: 100%;
}
.header-actions {
  display: flex;
  gap: 8px;
}
</style>
