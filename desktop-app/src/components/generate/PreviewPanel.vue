<template>
  <el-card shadow="never" class="card-full preview-panel">
    <template #header>
      <div class="card-header">
        <span class="card-title">预览</span>
        <div class="header-actions">
          <el-button :disabled="!currentCode" size="small" @click="$emit('copy')">
            <el-icon><CopyDocument /></el-icon>
            <span>复制</span>
          </el-button>
          <el-button
            v-if="mode === 'module'"
            size="small"
            :loading="isExporting"
            :disabled="isExporting || !hasDoc || endpointsLength === 0"
            class="export-all-btn"
            @click="$emit('save-all')"
          >
            <el-icon v-if="!isExporting"><Files /></el-icon>
            <span class="export-all-text">{{ isExporting ? progressText : "一键全部导出" }}</span>
          </el-button>
          <el-button :disabled="!generatedCode" type="primary" size="small" :loading="isSaving" @click="$emit('save')">
            <el-icon v-if="!isSaving"><Folder /></el-icon>
            <span>{{ isSaving ? "保存中…" : "保存到目录" }}</span>
          </el-button>
        </div>
      </div>
    </template>

    <div class="action-bar">
      <div class="stats">
        <el-icon class="stats-icon"><Document /></el-icon>
        <span>已选 <b>{{ selectedCount }}</b> 个接口</span>
        <el-tag v-if="generatedCode" size="small" type="success">
          <el-icon><Check /></el-icon>
          <span>已生成 · {{ generatedCode.typeFile.length + generatedCode.indexFile.length }} 字符</span>
        </el-tag>
        <el-tag v-else-if="selectedCount > 0" size="small" type="warning">未生成</el-tag>
      </div>
      <el-button type="primary" :loading="isGenerating" :disabled="selectedCount === 0" @click="$emit('generate')">
        <el-icon><MagicStick /></el-icon>
        <span>生成预览</span>
      </el-button>
    </div>

    <el-tabs :model-value="tab" class="preview-tabs" @update:model-value="(v: any) => $emit('update:tab', v)">
      <el-tab-pane name="type">
        <template #label>
          <span class="tab-label">
            <span>type.ts</span>
            <el-button size="small" link type="primary" :disabled="!generatedCode" class="tab-copy" @click.stop="$emit('copy-file', 'type')">
              <el-icon><CopyDocument /></el-icon><span>复制</span>
            </el-button>
          </span>
        </template>
      </el-tab-pane>
      <el-tab-pane name="index">
        <template #label>
          <span class="tab-label">
            <span>index.ts</span>
            <el-button size="small" link type="primary" :disabled="!generatedCode" class="tab-copy" @click.stop="$emit('copy-file', 'index')">
              <el-icon><CopyDocument /></el-icon><span>复制</span>
            </el-button>
          </span>
        </template>
      </el-tab-pane>
    </el-tabs>

    <div class="code-preview">
      <VirtualList v-if="currentCode" :items="currentCodeLines" :line-height="20" :buffer="10" v-slot="{ item, index }" class="code-vlist">
        <span class="code-lineno">{{ index + 1 }}</span>
        <span class="code-line" v-html="item"></span>
      </VirtualList>
      <el-empty v-else :image-size="100" :description="isGenerating ? '正在生成代码…' : '选择接口后点击「生成预览」'" />
    </div>
  </el-card>
</template>

<script setup lang="ts">
/** PreviewPanel.vue - 右侧「预览」卡片：header actions + stats + tabs + code preview */
import { CopyDocument, Document, Files, Folder, Check, MagicStick } from "@element-plus/icons-vue";
import VirtualList from "@/components/VirtualList.vue";
import type { IGeneratedCode } from "@/core/types";

defineProps<{
  generatedCode: IGeneratedCode | null;
  isGenerating: boolean;
  isSaving: boolean;
  isExporting: boolean;
  progressText: string;
  mode: "module" | "single";
  selectedCount: number;
  hasDoc: boolean;
  endpointsLength: number;
  currentCode: string;
  currentCodeLines: string[];
  tab: "type" | "index";
}>();

defineEmits<{
  (e: "generate"): void;
  (e: "save"): void;
  (e: "save-all"): void;
  (e: "copy"): void;
  (e: "copy-file", which: "type" | "index"): void;
  (e: "update:tab", v: "type" | "index"): void;
}>();
</script>

<style scoped>
.preview-panel { height: 100%; display: flex; flex-direction: column; }
.preview-panel :deep(.el-card__header) { padding: 12px 16px; border-bottom: 1px solid var(--border-color, #e5e7eb); }
.preview-panel :deep(.el-card__body) { flex: 1; padding: 0; display: flex; flex-direction: column; overflow: hidden; }
.card-header { display: flex; align-items: center; justify-content: space-between; }
.card-title { font-size: 14px; font-weight: 600; color: var(--text-primary, #111827); }
.header-actions { display: flex; gap: 8px; }
.action-bar { padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--border-light, #f1f5f9); background: #fafbfc; }
.stats { display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--text-secondary, #475569); }
.stats-icon { color: var(--brand-primary, #2563eb); }
.preview-tabs { padding: 0 16px; border-bottom: 1px solid var(--border-light, #f1f5f9); }
.preview-tabs :deep(.el-tabs__header) { margin: 0; }
.preview-tabs :deep(.el-tabs__nav-wrap::after) { height: 1px; }
.tab-label { display: inline-flex; align-items: center; gap: 4px; }
.tab-copy { padding: 0 4px; font-size: 12px; margin-left: 2px; }
.export-all-btn { width: 200px; flex-shrink: 0; }
.export-all-text { display: inline-block; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
.code-preview { flex: 1; overflow: auto; background: #fafbfc; }
.code-preview pre { margin: 0; padding: 16px; background: #fafbfc; font-family: "Fira Code", "Consolas", "Monaco", monospace; font-size: 12.5px; line-height: 1.6; min-height: 100%; }
.code-preview code { background: transparent !important; padding: 0 !important; }
.code-preview pre code.hljs { background: transparent; color: #1f2937; }
.code-vlist { height: 100%; background: #fafbfc; }
.code-lineno { flex-shrink: 0; width: 48px; color: #94a3b8; text-align: right; padding-right: 12px; user-select: none; border-right: 1px solid #e5e7eb; margin-right: 12px; }
.code-line { color: #1f2937; white-space: pre; overflow: visible; }
</style>
