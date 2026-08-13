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
            <el-tag v-if="newEndpointKeys.length > 0" size="small" type="success"
              >{{ docViewerUi.newEndpointCount }} {{ newEndpointKeys.length }}</el-tag
            >
            <el-tag v-if="missingEndpointKeys.length > 0" size="small" type="danger"
              >{{ docViewerUi.missingEndpointCount }} {{ missingEndpointKeys.length }}</el-tag
            >
          </div>
        </div>
        <div class="header-controls">
          <el-checkbox
            v-if="newEndpointKeys.length > 0"
            :model-value="showOnlyNew"
            @update:model-value="(value: boolean) => emit('update:showOnlyNew', value)"
          >{{ docViewerUi.showOnlyNew }}</el-checkbox>
          <el-checkbox
            v-if="missingEndpointKeys.length > 0"
            :model-value="showOnlyMissing"
            @update:model-value="(value: boolean) => emit('update:showOnlyMissing', value)"
          >{{ docViewerUi.showOnlyMissing }}</el-checkbox>
          <el-input
            :model-value="searchText"
            @update:model-value="(v: string) => emit('update:searchText', v)"
            placeholder="搜索接口 (summary/path)"
            size="default"
            clearable
            class="endpoint-search"
          >
            <template #prefix
              ><el-icon><Search /></el-icon
            ></template>
          </el-input>
        </div>
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
              <el-tag v-if="isNewEndpoint(ep)" size="small" type="success">{{ docViewerUi.newEndpoint }}</el-tag>
              <el-tag v-if="isMissingEndpoint(ep)" size="small" type="danger">{{ docViewerUi.missingEndpoint }}</el-tag>
              <el-dropdown trigger="hover" @command="(action: EndpointCopyAction) => void onCopyCommand(ep, action)">
                <el-button size="small" link type="primary" class="ep-copy" @click.stop>
                  <el-icon><CopyDocument /></el-icon>
                  <span>复制</span>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="option in endpointCopyOptions"
                      :key="option.action"
                      :command="option.action"
                    >
                      {{ option.label }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
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
        <div class="raw-json-actions">
          <el-tooltip :content="docViewerUi.copyRawJson" placement="left">
            <el-button
              :icon="CopyDocument"
              text
              circle
              :disabled="!rawJson"
              :aria-label="docViewerUi.copyRawJson"
              @click="copyRawJson"
            />
          </el-tooltip>
        </div>
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
import { useEndpointCopy } from "@/composables/useEndpointCopy";
import { docViewerUi } from "@/components/docviewer/docViewerUi";
import {
  endpointCopyOptions,
  type EndpointCopyAction,
} from "@/components/generate/endpointCopyOptions";
import type { IOpenAPIDocument, IEndpointInfo } from "@/core/types";
import type { TagGroup } from "@/composables/useDocLoader";
import { copyToClipboard } from "@/utils/clipboard";

const props = defineProps<{
  doc: IOpenAPIDocument | null;
  endpoints: IEndpointInfo[];
  activeTab: "list" | "raw";
  listCollapseAll: boolean;
  expandedTags: Record<string, boolean>;
  selectedTag: string;
  searchText: string;
  showOnlyMine: boolean;
  newEndpointKeys: string[];
  missingEndpointKeys: string[];
  missingEndpoints: IEndpointInfo[];
  showOnlyNew: boolean;
  showOnlyMissing: boolean;
  rawJson: string;
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
  (e: "update:showOnlyNew", v: boolean): void;
  (e: "update:showOnlyMissing", v: boolean): void;
}>();

const endpointCount = computed(() => props.endpoints.length);
const { copyEndpoint } = useEndpointCopy();
const newEndpointKeySet = computed(() => new Set(props.newEndpointKeys));
const missingEndpointKeySet = computed(() => new Set(props.missingEndpointKeys));

/** 将当前接口和基线缺失接口合并为同一套分组，供列表和筛选复用。 */
const displayTagGroups = computed<TagGroup[]>(() => {
  const groups = new Map<string, IEndpointInfo[]>();
  for (const group of props.tagGroups) groups.set(group.name, [...group.endpoints]);
  for (const endpoint of props.missingEndpoints) {
    const endpoints = groups.get(endpoint.tag) ?? [];
    endpoints.push(endpoint);
    groups.set(endpoint.tag, endpoints);
  }
  return Array.from(groups.entries()).map(([name, endpoints]) => ({ name, endpoints }));
});

/** 按搜索关键字与新增筛选条件过滤接口分组。 */
const filteredTags = computed<TagGroup[]>(() => {
  const q = props.searchText.trim().toLowerCase();
  return displayTagGroups.value
    .map((t) => ({
      name: t.name,
      endpoints: t.endpoints.filter(
        (e) =>
          (!props.showOnlyNew || isNewEndpoint(e)) &&
          (!props.showOnlyMissing || isMissingEndpoint(e)) &&
          (!q ||
            (e.summary || "").toLowerCase().includes(q) ||
            e.path.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q)),
      ),
    }))
    .filter((t) => t.endpoints.length > 0);
});

/** 判断接口是否属于本次刷新中新出现的接口。 */
function isNewEndpoint(endpoint: IEndpointInfo): boolean {
  return newEndpointKeySet.value.has(`${endpoint.method.toUpperCase()}\u0000${endpoint.path}`);
}

/** 判断接口是否存在于上次基线、但已从当前文档移除。 */
function isMissingEndpoint(endpoint: IEndpointInfo): boolean {
  return missingEndpointKeySet.value.has(`${endpoint.method.toUpperCase()}\u0000${endpoint.path}`);
}

function methodClass(method: string) {
  return ["method-tag", `method-${method.toLowerCase()}`];
}

/** 验证复制动作，并委托共用的接口复制逻辑执行。 */
async function onCopyCommand(endpoint: IEndpointInfo, action: EndpointCopyAction) {
  await copyEndpoint(endpoint, action);
}

/** 复制当前已加载文档的原始 JSON。 */
function copyRawJson(): void {
  if (props.rawJson) void copyToClipboard(props.rawJson, docViewerUi.rawJsonCopied);
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
.header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.endpoint-search {
  width: 240px;
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
  position: relative;
  flex: 1;
  overflow: auto;
  background: var(--bg-code, #fafbfc);
}
.raw-json-actions {
  position: sticky;
  top: 8px;
  z-index: 1;
  display: flex;
  justify-content: flex-end;
  height: 0;
  padding-right: 10px;
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
