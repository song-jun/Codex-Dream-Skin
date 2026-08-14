<template>
  <el-card shadow="never" class="card-full endpoint-tree">
    <template #header>
      <div class="card-header">
        <span class="card-title">选择接口</span>
        <div class="header-meta">
          <el-tag v-if="newEndpointKeys.length > 0" size="small" type="success">{{ docViewerUi.newEndpointCount }} {{ newEndpointKeys.length }}</el-tag>
          <el-tag v-if="missingEndpointKeys.length > 0" size="small" type="danger">{{ docViewerUi.missingEndpointCount }} {{ missingEndpointKeys.length }}</el-tag>
          <el-tag size="small" type="info">{{ filteredTags.length }} 个分组 · 共 {{ filteredEndpointCount }} 个</el-tag>
        </div>
      </div>
    </template>

    <div class="card-toolbar">
      <el-radio-group :model-value="mode" size="small" @update:model-value="(v: any) => $emit('update:mode', v)">
        <el-radio-button value="module">按 Tag</el-radio-button>
        <el-radio-button value="single">单接口</el-radio-button>
      </el-radio-group>
    </div>

    <div class="card-toolbar">
      <el-input
        :model-value="searchText"
        placeholder="搜索 tag / summary / path"
        size="default"
        clearable
        class="search-input"
        @update:model-value="(v: any) => $emit('update:searchText', v)"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
    </div>

    <div class="card-toolbar card-toolbar-row">
      <el-checkbox
        v-if="newEndpointKeys.length > 0"
        :model-value="showOnlyNew"
        @update:model-value="(value: boolean) => $emit('update:showOnlyNew', value)"
      >{{ docViewerUi.showOnlyNew }}</el-checkbox>
      <el-checkbox
        v-if="missingEndpointKeys.length > 0"
        :model-value="showOnlyMissing"
        @update:model-value="(value: boolean) => $emit('update:showOnlyMissing', value)"
      >{{ docViewerUi.showOnlyMissing }}</el-checkbox>
      <el-checkbox
        v-if="mode === 'module'"
        :model-value="isAllFilteredSelected"
        :indeterminate="isFilteredIndeterminate"
        @change="onToggleSelectAll"
      >
        全选当前筛选
      </el-checkbox>
    </div>

    <div class="endpoint-scroll">
      <template v-for="t in filteredTags" :key="t.name">
        <div class="tag-block">
          <div class="tag-header">
            <el-checkbox
              class="tag-select"
              :model-value="isTagAllSelected(t)"
              :indeterminate="isTagIndeterminate(t)"
              @update:model-value="(v: unknown) => onToggleTagSelect(t, !!v)"
              @click.stop
            />
            <div class="tag-header-main" @click="toggleTag(t.name)">
              <el-icon v-if="expandedTags[t.name]" class="tag-toggle"><ArrowDown /></el-icon>
              <el-icon v-else class="tag-toggle"><ArrowRight /></el-icon>
              <span class="tag-name">{{ t.name || "[无分组]" }}</span>
              <el-tag size="small" type="info" round>{{ t.endpoints.length }}</el-tag>
            </div>
          </div>
          <div v-if="expandedTags[t.name]" class="tag-endpoints">
            <div v-if="t.endpoints.length <= 50">
              <el-checkbox
                v-for="ep in t.endpoints"
                :key="ep.path + ep.method"
                :model-value="isSelected(ep)"
                class="endpoint-item"
                @change="toggleSelect(ep)"
              >
                <span :class="methodClass(ep.method)">{{ ep.method.toUpperCase() }}</span>
                <span class="ep-summary">{{ ep.summary || ep.path }}</span>
                <span class="endpoint-status">
                  <el-tag v-if="isNewEndpoint(ep)" size="small" type="success">{{ docViewerUi.newEndpoint }}</el-tag>
                  <el-tag v-if="isMissingEndpoint(ep)" size="small" type="danger">{{ docViewerUi.missingEndpoint }}</el-tag>
                </span>
                <el-dropdown
                  trigger="hover"
                  @command="(action: EndpointCopyAction) => void onCopyCommand(ep, action)"
                >
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
              </el-checkbox>
            </div>
            <div v-else class="endpoint-vlist-wrap">
              <VirtualList :items="t.endpoints" :line-height="28" :buffer="6" v-slot="{ item: ep }">
                <label class="endpoint-row-v">
                  <input type="checkbox" class="ep-checkbox" :checked="isSelected(ep)" @change="toggleSelect(ep)" />
                  <span :class="methodClass(ep.method)">{{ ep.method.toUpperCase() }}</span>
                  <span class="ep-summary">{{ ep.summary || ep.path }}</span>
                  <span class="endpoint-status">
                    <el-tag v-if="isNewEndpoint(ep)" size="small" type="success">{{ docViewerUi.newEndpoint }}</el-tag>
                    <el-tag v-if="isMissingEndpoint(ep)" size="small" type="danger">{{ docViewerUi.missingEndpoint }}</el-tag>
                  </span>
                  <el-dropdown
                    trigger="hover"
                    @command="(action: EndpointCopyAction) => void onCopyCommand(ep, action)"
                  >
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
                </label>
              </VirtualList>
            </div>
          </div>
        </div>
      </template>
      <el-empty v-if="filteredTags.length === 0" :image-size="60" description="无匹配结果" />
    </div>
  </el-card>
</template>

<script setup lang="ts">
/** EndpointTree.vue - 左侧「选择接口」卡片：搜索/mode/全选/tag 折叠/endpoint 列表/curl 复制 */
import { computed } from "vue";
import { ElMessage } from "element-plus";
import { Search, ArrowDown, ArrowRight, CopyDocument } from "@element-plus/icons-vue";
import VirtualList from "@/components/VirtualList.vue";
import { useDocStore } from "@/stores/doc";
import { methodClass } from "@/types/http";
import { batchUpdateSet } from "@/utils/batchUpdate";
import { useEndpointCopy } from "@/composables/useEndpointCopy";
import { docViewerUi } from "@/components/docviewer/docViewerUi";
import {
  endpointCopyOptions,
  type EndpointCopyAction,
} from "@/components/generate/endpointCopyOptions";
import type { IEndpointInfo } from "@/core/types";
import type { TagGroup } from "@/composables/useEndpointFilter";

const props = defineProps<{
  mode: "module" | "single";
  searchText: string;
  selected: IEndpointInfo[];
  expandedTags: Record<string, boolean>;
  selectAll: boolean;
  filteredTags: TagGroup[];
  filteredEndpointCount: number;
  newEndpointKeys: string[];
  missingEndpointKeys: string[];
  showOnlyNew: boolean;
  showOnlyMissing: boolean;
}>();

const emit = defineEmits<{
  (e: "update:mode", v: "module" | "single"): void;
  (e: "update:searchText", v: string): void;
  (e: "update:selected", v: IEndpointInfo[]): void;
  (e: "update:expandedTags", v: Record<string, boolean>): void;
  (e: "update:selectAll", v: boolean): void;
  (e: "update:showOnlyNew", v: boolean): void;
  (e: "update:showOnlyMissing", v: boolean): void;
}>();

const docStore = useDocStore();
const { copyEndpoint } = useEndpointCopy();
const newEndpointKeySet = computed(() => new Set(props.newEndpointKeys));
const missingEndpointKeySet = computed(() => new Set(props.missingEndpointKeys));

/** 判断接口是否属于本次刷新中新出现的接口。 */
function isNewEndpoint(endpoint: IEndpointInfo): boolean {
  return newEndpointKeySet.value.has(`${endpoint.method.toUpperCase()}\u0000${endpoint.path}`);
}

/** 判断接口是否仅存在于上次基线中。 */
function isMissingEndpoint(endpoint: IEndpointInfo): boolean {
  return missingEndpointKeySet.value.has(`${endpoint.method.toUpperCase()}\u0000${endpoint.path}`);
}

function isSelected(ep: IEndpointInfo): boolean {
  return props.selected.some((s) => s.path === ep.path && s.method === ep.method);
}
function toggleSelect(ep: IEndpointInfo) {
  const next = [...props.selected];
  const i = next.findIndex((s) => s.path === ep.path && s.method === ep.method);
  if (i >= 0) next.splice(i, 1);
  else next.push(ep);
  emit("update:selected", next);
}

// ===== 全局「全选当前筛选」状态 =====
// 之前直接绑到 selectAll prop，但 selectAll 只在用户点击该 checkbox 时变化，
// 单选模块里的接口不会反向更新 selectAll，导致全选复选框不显示半选状态。
// 改为基于 selected × filteredTags 实时计算：
//   - 全部已选 → 勾选
//   - 部分已选 → 半选
//   - 全没选   → 空
const filteredKey = (ep: IEndpointInfo) => ep.path + "|" + ep.method;
const filteredEndpoints = computed<IEndpointInfo[]>(() =>
  props.filteredTags.flatMap((t) => t.endpoints),
);
const filteredSelectedCount = computed<number>(() => {
  const have = new Set(props.selected.map(filteredKey));
  let n = 0;
  for (const ep of filteredEndpoints.value) {
    if (have.has(filteredKey(ep))) n += 1;
  }
  return n;
});
const isAllFilteredSelected = computed<boolean>(
  () => filteredEndpoints.value.length > 0 && filteredSelectedCount.value === filteredEndpoints.value.length,
);
const isFilteredIndeterminate = computed<boolean>(
  () => filteredSelectedCount.value > 0 && filteredSelectedCount.value < filteredEndpoints.value.length,
);

function onToggleSelectAll() {
  // 统一行为：当前已"全选"则全不选；否则（含半选）→ 全选当前筛选
  if (isAllFilteredSelected.value) {
    emit("update:selectAll", false);
    emit("update:selected", []);
    return;
  }
  emit("update:selectAll", true);
  const updates = filteredEndpoints.value.map((ep) => ({ add: true, item: ep }));
  batchUpdateSet(
    updates,
    filteredKey,
    (set) => emit("update:selected", docStore.endpoints.filter((ep) => set.has(filteredKey(ep)))),
    () => ElMessage.success(`已选中当前筛选 ${updates.length} 个接口`),
  );
}

// ===== 按模块（tag）全选 / 全不选 =====
function isTagAllSelected(t: TagGroup): boolean {
  if (!t.endpoints.length) return false;
  return t.endpoints.every((ep) => isSelected(ep));
}
function isTagIndeterminate(t: TagGroup): boolean {
  if (!t.endpoints.length) return false;
  // 至少 1 个选中 + 不是全部选中 = 半选
  let cnt = 0;
  for (const ep of t.endpoints) {
    if (isSelected(ep)) cnt += 1;
  }
  return cnt > 0 && cnt < t.endpoints.length;
}
function onToggleTagSelect(t: TagGroup, checked: boolean) {
  // checked=true  → 全选该模块；checked=false → 全不选该模块
  const next = props.selected.filter(
    (s) => !t.endpoints.some((ep) => ep.path === s.path && ep.method === s.method),
  );
  if (checked) {
    // 保留原顺序，再追加该模块的 endpoints（去重）
    const have = new Set(next.map(filteredKey));
    for (const ep of t.endpoints) {
      if (!have.has(filteredKey(ep))) next.push(ep);
    }
  }
  emit("update:selected", next);
}
function toggleTag(name: string) {
  emit("update:expandedTags", { ...props.expandedTags, [name]: !props.expandedTags[name] });
}
/** 校验 Element Plus 下拉菜单命令并执行对应复制操作。 */
async function onCopyCommand(ep: IEndpointInfo, action: unknown) {
  if (action !== "title" && action !== "endpoint" && action !== "curl") return;
  await copyEndpoint(ep, action as EndpointCopyAction);
}
</script>

<style scoped>
.endpoint-tree { height: 100%; display: flex; flex-direction: column; }
.endpoint-tree :deep(.el-card__header) { padding: 12px 16px; border-bottom: 1px solid var(--border-color, #e5e7eb); }
.endpoint-tree :deep(.el-card__body) { flex: 1; padding: 0; display: flex; flex-direction: column; overflow: hidden; }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.header-meta { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
.card-title { font-size: 14px; font-weight: 600; color: var(--text-primary, #111827); }
.card-toolbar { padding: 8px 16px; border-bottom: 1px solid var(--border-light, #f1f5f9); }
.card-toolbar-row { display: flex; align-items: center; gap: 12px; justify-content: space-between; }
.search-input :deep(.el-input__wrapper) { border-radius: 6px; }
.endpoint-scroll { flex: 1; overflow: auto; padding: 8px 16px 16px; }
.tag-block { margin-bottom: 6px; border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; overflow: hidden; }
.tag-header { display: flex; align-items: center; gap: 6px; padding: 8px 12px; background: var(--bg-soft, #f8fafc); user-select: none; transition: background 0.15s; }
.tag-header:hover { background: #f1f5f9; }
.tag-header-main { display: flex; align-items: center; gap: 6px; flex: 1; cursor: pointer; min-width: 0; }
.tag-select { flex-shrink: 0; margin-right: 2px; }
.tag-toggle { color: #94a3b8; font-size: 12px; }
.tag-name { flex: 1; font-weight: 500; font-size: 13px; color: #334155; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag-endpoints { padding: 6px 12px 8px; background: #fff; }
.endpoint-vlist-wrap { height: 240px; border: 1px solid var(--border-light, #f1f5f9); border-radius: 4px; }
.endpoint-row-v { display: grid; grid-template-columns: 14px 48px minmax(0, 1fr) minmax(40px, max-content) 52px; align-items: center; gap: 8px; width: 100%; cursor: pointer; }
.endpoint-row-v:hover { background: #f8fafc; }
.ep-checkbox { flex-shrink: 0; width: 14px; height: 14px; cursor: pointer; }
.ep-copy { min-width: 52px; margin: 0; font-size: 12px; }
.endpoint-item { display: flex !important; align-items: center; gap: 8px; margin-bottom: 4px; white-space: normal; height: auto !important; padding: 4px 0; width: 100%; }
.endpoint-item :deep(.el-checkbox__label) { display: grid; grid-template-columns: 48px minmax(0, 1fr) minmax(40px, max-content) 52px; align-items: center; width: auto; min-width: 0; flex: 1; gap: 8px; white-space: normal; }
.endpoint-item :deep(.el-checkbox__label > .el-dropdown) { justify-self: end; }
.endpoint-status { display: inline-flex; align-items: center; justify-content: flex-end; min-width: 40px; gap: 4px; }
.method-tag { display: inline-block; font-size: 10px; padding: 2px 6px; border-radius: 3px; font-weight: 600; color: #fff; min-width: 48px; text-align: center; flex-shrink: 0; }
/* .method-get/post/put/patch/delete 颜色统一在 styles/main.css 中定义（设计系统） */
.method-head, .method-options { background: #6b7280; }
.ep-summary { min-width: 0; overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
</style>
