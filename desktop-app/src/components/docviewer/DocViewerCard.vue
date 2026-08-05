<template>
  <el-card v-if="doc" shadow="never" class="card-full">
    <template #header>
      <div class="card-header">
        <div class="doc-info">
          <div class="card-title">
            {{ (doc.info && doc.info.title) || "未命名" }}
          </div>
          <div class="doc-meta">
            <el-tag size="small" type="info"
              >OpenAPI {{ doc.openapi }}</el-tag
            >
            <el-tag size="small" type="info"
              >{{ endpointCount }} 个接口</el-tag
            >
            <el-tag size="small" type="info"
              >{{ tagGroups.length }} 个分组</el-tag
            >
            <el-tag
              v-if="doc.info && doc.info.version"
              size="small"
              type="info"
              >v{{ doc.info.version }}</el-tag
            >
          </div>
        </div>
        <el-input
          :model-value="searchText"
          @update:model-value="(v: string) => emit('update:searchText', v)"
          placeholder="搜索接口 (summary/path)"
          size="default"
          clearable
          style="width: 240px"
        >
          <template #prefix
            ><el-icon><Search /></el-icon
          ></template>
        </el-input>
      </div>
    </template>

    <div class="card-toolbar">
      <el-tabs
        :model-value="activeTab"
        @update:model-value="(v: 'list' | 'raw') => emit('update:activeTab', v)"
      >
        <el-tab-pane label="接口列表" name="list" />
        <el-tab-pane label="原始 JSON" name="raw" />
      </el-tabs>
    </div>

    <div class="tab-content">
      <div v-show="activeTab === 'list'" class="endpoint-scroll">
        <div
          v-for="t in filteredTags"
          :key="t.name"
          class="tag-block"
        >
          <div class="tag-header" @click="emit('toggle-tag', t.name)">
            <el-icon
              v-if="expandedTags[t.name]"
              class="tag-toggle"
              ><ArrowDown
            /></el-icon>
            <el-icon v-else class="tag-toggle"><ArrowRight /></el-icon>
            <span class="tag-name">{{ t.name || "[无分组]" }}</span>
            <el-tag size="small" type="info" round>{{
              t.endpoints.length
            }}</el-tag>
          </div>
          <div v-show="expandedTags[t.name]" class="tag-endpoints">
            <div
              v-for="ep in t.endpoints"
              :key="ep.path + ep.method"
              class="endpoint-row"
            >
              <span :class="methodClass(ep.method)">{{
                ep.method.toUpperCase()
              }}</span>
              <span class="ep-summary">{{ ep.summary || ep.path }}</span>
              <span class="ep-path">{{ ep.path }}</span>
              <el-button
                size="small"
                link
                type="primary"
                class="ep-copy"
                @click="emit('copy-curl', ep)"
              >
                <el-icon><CopyDocument /></el-icon>
                <span>复制</span>
              </el-button>
            </div>
          </div>
        </div>
        <el-empty
          v-if="filteredTags.length === 0"
          :image-size="60"
          description="无匹配结果"
        />
      </div>
      <div v-show="activeTab === 'raw'" class="json-scroll">
        <VirtualList
          :items="highlightLines"
          :line-height="20"
          v-slot="{ item, index }"
        >
          <span class="json-lineno">{{ index + 1 }}</span>
          <span class="json-line" v-html="item"></span>
        </VirtualList>
      </div>
    </div>
  </el-card>
  <el-card v-else shadow="never" class="card-full">
    <el-empty description="尚未加载文档" />
  </el-card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  ArrowDown,
  ArrowRight,
  Search,
  CopyDocument,
} from "@element-plus/icons-vue";
import VirtualList from "@/components/VirtualList.vue";
import type { IOpenAPIDocument, IEndpointInfo } from "@/core/types";
import type { TagGroup } from "@/composables/useDocLoader";

const props = defineProps<{
  doc: IOpenAPIDocument | null;
  endpoints: IEndpointInfo[];
  activeTab: "list" | "raw";
  listCollapseAll: boolean;
  expandedTags: Record<string, boolean>;
  selectedTag: string;
  searchText: string;
  showOnlyMine: boolean;
  highlightLines: string[];
  tagGroups: TagGroup[];
}>();

const emit = defineEmits<{
  (e: "update:activeTab", v: "list" | "raw"): void;
  (e: "toggle-tag", name: string): void;
  (e: "select-tag", name: string): void;
  (e: "update:listCollapseAll", v: boolean): void;
  (e: "update:expandedTags", v: Record<string, boolean>): void;
  (e: "update:searchText", v: string): void;
  (e: "update:showOnlyMine", v: boolean): void;
  (e: "copy-curl", ep: IEndpointInfo): void;
}>();

const endpointCount = computed(() => props.endpoints.length);

/** 按 searchText 过滤后的 tag 分组 */
const filteredTags = computed<TagGroup[]>(() => {
  const q = props.searchText.trim().toLowerCase();
  if (!q) return props.tagGroups;
  return props.tagGroups
    .map((t) => ({
      name: t.name,
      endpoints: t.endpoints.filter(
        (e) =>
          (e.summary || "").toLowerCase().includes(q) ||
          e.path.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q),
      ),
    }))
    .filter((t) => t.endpoints.length > 0);
});

function methodClass(method: string) {
  return ["method-tag", `method-${method.toLowerCase()}`];
}
</script>

<style scoped>
.card-full {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.card-full :deep(.el-card__header) {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}
.card-full :deep(.el-card__body) {
  flex: 1;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}
.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #111827);
}
.doc-info {
  flex: 1;
  min-width: 0;
}
.doc-meta {
  display: flex;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}
.card-toolbar :deep(.el-tabs__header) {
  margin: 0;
}
.card-toolbar :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}
.tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}
.endpoint-scroll {
  flex: 1;
  overflow: auto;
  padding: 8px 16px 16px;
}
.endpoint-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--border-light, #f1f5f9);
}
.endpoint-row:last-child {
  border-bottom: none;
}
.ep-summary {
  font-size: 13px;
  flex: 1;
  color: var(--text-primary, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ep-path {
  font-family: "Fira Code", "Consolas", monospace;
  font-size: 12px;
  color: var(--text-tertiary, #94a3b8);
  max-width: 50%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.json-scroll {
  flex: 1;
  overflow: auto;
  background: var(--bg-code, #fafbfc);
}
.json-lineno {
  flex-shrink: 0;
  width: 48px;
  color: #94a3b8;
  text-align: right;
  padding-right: 12px;
  user-select: none;
  border-right: 1px solid #e5e7eb;
  margin-right: 12px;
}
.json-line {
  color: #1f2937;
  white-space: pre;
  overflow: visible;
}
</style>
