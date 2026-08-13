<template>
  <el-card shadow="never" class="card-full">
    <template #header>
      <div class="card-header">
        <span class="card-title">加载文档</span>
        <el-tag v-if="hasLoaded" size="small" type="success">
          <el-icon><Check /></el-icon>
          <span>已加载</span>
        </el-tag>
        <el-tag v-else size="small" type="info">未加载</el-tag>
      </div>
    </template>

    <div class="card-toolbar">
      <el-tabs v-model="tabLocal">
        <el-tab-pane label="JSON 编辑" name="json" />
        <el-tab-pane label="URL 拉取" name="url" />
        <el-tab-pane label="历史 JSON" name="history" />
      </el-tabs>
    </div>

    <div class="form-area">
      <div v-show="tabLocal === 'url'">
        <el-form label-position="top" size="default">
          <el-form-item label="API 文档 URL">
            <div class="url-input-wrap">
              <el-select
                v-model="urlModel"
                class="url-select"
                filterable
                allow-create
                default-first-option
                clearable
                placeholder="选择 .env 中的默认地址，或输入新 URL（自动记录到历史）"
                @change="onUrlSelectChange"
                @blur="onUrlBlur"
              >
                <template #prefix
                  ><el-icon><Link /></el-icon
                ></template>
                <el-option
                  v-for="u in presetUrls"
                  :key="u"
                  :label="u"
                  :value="u"
                />
              </el-select>
              <el-dropdown trigger="click" @command="onUrlHistorySelect">
                <el-button :icon="ArrowDown" title="历史/收藏">
                  <span>历史</span>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="h in urlHistory"
                      :key="h"
                      :command="h"
                      :disabled="h === urlModel"
                    >
                      <span class="url-history-item">
                        <el-icon v-if="isFavorite(h)" style="color: #e6a23c"
                          ><StarFilled
                        /></el-icon>
                        <el-icon v-else style="color: #c0c4cc"
                          ><Star
                        /></el-icon>
                        <span class="url-history-text">{{ h }}</span>
                        <el-icon
                          class="url-history-del"
                          @click.stop="onUrlHistoryDel(h)"
                          title="删除"
                          ><Close
                        /></el-icon>
                      </span>
                    </el-dropdown-item>
                    <el-dropdown-item v-if="urlHistory.length === 0" disabled>
                      暂无历史
                    </el-dropdown-item>
                    <el-dropdown-item
                      v-if="urlHistory.length > 0"
                      divided
                      command="__clear__"
                    >
                      <span style="color: #f56c6c">清空历史</span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-button
                :type="isFavorite(urlModel) ? 'warning' : 'default'"
                :icon="isFavorite(urlModel) ? StarFilled : Star"
                :disabled="!urlModel"
                @click="onToggleFavorite"
                title="收藏"
              />
            </div>
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary"
              :loading="isLoading"
              @click="emit('load')"
            >
              <el-icon><Download /></el-icon>
              <span>拉取文档</span>
            </el-button>
            <el-button
              type="primary"
              :loading="isLoading"
              :disabled="!hasLoaded"
              @click="emit('generate')"
            >
              <el-icon><MagicStick /></el-icon>
              <span>生成代码</span>
            </el-button>
            <el-button :disabled="!urlModel" @click="clearUrl">
              <el-icon><Refresh /></el-icon>
              <span>清空</span>
            </el-button>
          </el-form-item>
        </el-form>
      </div>
      <div v-show="tabLocal === 'json'">
        <div
          class="json-drop-zone"
          :class="{ 'is-drag-over': isDragOver }"
          @dragover.prevent="onDragOver"
          @dragenter.prevent="onDragOver"
          @dragleave="onDragLeave"
          @drop.prevent="onDrop"
        >
          <!-- 大文件（>500KB）模式：显示文件信息，不把内容塞进 textarea -->
          <div v-if="loadedFile" class="loaded-view">
            <el-icon class="loaded-icon"><Document /></el-icon>
            <div class="loaded-info">
              <div class="loaded-name" :title="loadedFile.name">
                {{ loadedFile.name }}
              </div>
              <div class="loaded-meta">
                <span>{{ formatSize(loadedFile.size) }}</span>
                <span class="loaded-dot">·</span>
                <span>内容过大未在编辑器中显示，避免浏览器卡顿</span>
              </div>
            </div>
            <div class="loaded-actions">
              <el-button size="small" @click="viewInEditor"
                >在编辑器中查看</el-button
              >
              <el-button
                size="small"
                type="primary"
                @click="emit('parse')"
                :loading="isParsing"
                >解析</el-button
              >
            </div>
          </div>
          <textarea
            v-else
            ref="textareaRef"
            class="json-textarea"
            :rows="14"
            placeholder="粘贴 OpenAPI 3.0 JSON 文档，或将 .json 文件拖拽到此处"
            spellcheck="false"
            @paste="onPaste"
          />
          <div v-if="isDragOver" class="drop-overlay">
            <el-icon class="drop-icon"><UploadFilled /></el-icon>
            <span>松开鼠标加载 JSON 文件</span>
          </div>
        </div>
        <div class="json-actions">
          <el-button
            v-if="!loadedFile"
            type="primary"
            :loading="isParsing"
            @click="emit('parse')"
          >
            <el-icon><Check /></el-icon>
            <span>解析</span>
          </el-button>
          <el-button v-if="!loadedFile" @click="emit('format')">
            <el-icon><Refresh /></el-icon>
            <span>格式化</span>
          </el-button>
          <el-upload
            :show-file-list="false"
            :auto-upload="false"
            accept=".json,application/json,text/json"
            :on-change="onPickFile"
          >
            <el-button>
              <el-icon><FolderOpened /></el-icon>
              <span>选择文件</span>
            </el-button>
          </el-upload>
          <el-button v-if="loadedFile" @click="clearLoadedFile">
            <el-icon><Refresh /></el-icon>
            <span>重新加载</span>
          </el-button>
          <el-button
            type="primary"
            :loading="isLoading"
            :disabled="!hasLoaded"
            @click="emit('generate')"
          >
            <el-icon><MagicStick /></el-icon>
            <span>生成代码</span>
          </el-button>
        </div>
      </div>
      <div v-show="tabLocal === 'history'">
        <JsonParseHistoryPanel
          :items="jsonHistory"
          @select="emit('historyParse', $event)"
          @delete="emit('historyDelete', $event)"
          @clear="emit('historyClear')"
        />
      </div>
      <el-alert
        v-if="hasError"
        :title="errorMsg"
        type="error"
        :closable="false"
        show-icon
        class="error-alert"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage } from "element-plus";
import type { UploadFile, UploadRawFile } from "element-plus";
import {
  ArrowDown,
  Star,
  StarFilled,
  Close,
  Link,
  Download,
  MagicStick,
  Refresh,
  Check,
  UploadFilled,
  FolderOpened,
  Document,
} from "@element-plus/icons-vue";
import JsonParseHistoryPanel from "@/components/docviewer/JsonParseHistoryPanel.vue";
import type { DocTab, JsonParseHistoryItem } from "@/composables/useDocLoader";
import { recordError } from "@/utils/errorRecords";
const props = defineProps<{
  urlValue: string;
  presetUrls: string[];
  isLoading: boolean;
  isParsing: boolean;
  hasError: boolean;
  errorMsg: string;
  hasLoaded: boolean;
  urlHistory: string[];
  jsonHistory: JsonParseHistoryItem[];
  isFavorite: (url: string) => boolean;
  onUrlBlur: () => void;
  onUrlSelectChange: (v: string) => void;
  onUrlHistorySelect: (cmd: string) => void;
  onUrlHistoryDel: (h: string) => void;
  onToggleFavorite: () => void;
}>();
const emit = defineEmits<{
  (e: "update:urlValue", v: string): void;
  (e: "load"): void;
  (e: "parse"): void;
  (e: "format"): void;
  (e: "generate"): void;
  (e: "historyParse", item: JsonParseHistoryItem): void;
  (e: "historyDelete", id: string): void;
  (e: "historyClear"): void;
  (e: "fileLoaded", payload: { name: string; text: string; size: number }): void;
}>();

const tabLocal = ref<DocTab>("json");
const urlModel = computed<string>({
  get: () => props.urlValue,
  set: (v) => emit("update:urlValue", v),
});
function clearUrl() {
  emit("update:urlValue", "");
}

// ===== 拖拽 / 选择本地 JSON 文件 =====
// 视觉拖拽高亮（用 ref 不用 props，避免父组件传递）
const isDragOver = ref<boolean>(false);

function onDragOver() {
  // 仅在 JSON tab 下接受拖拽；URL tab 不响应
  if (tabLocal.value !== "json") return;
  isDragOver.value = true;
}

function onDragLeave() {
  isDragOver.value = false;
}

function onDrop(e: DragEvent) {
  isDragOver.value = false;
  if (tabLocal.value !== "json") return;
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  void readAndLoadFile(file);
}

function onPickFile(uploadFile: UploadFile) {
  // el-upload 拿到的 raw 是浏览器 File
  const raw = (uploadFile as UploadFile & { raw?: UploadRawFile }).raw;
  if (!raw) return;
  void readAndLoadFile(raw as unknown as File);
  // el-upload 内部 file list 暂不清空（auto-upload: false 时不会真的上传）
}

// ===== 大文件保护：>SIZE_LIMIT 字节的文件不写入 textarea =====
// 浏览器原生 <textarea> 渲染 1MB+ 文本会明显卡顿（每个按键 / 滚动 / 选中都要重排）
// 对这种文件：仅显示文件信息卡，文本只放进 loadedFile（响应式 ref）。
// getValue() 在 loaded 模式下返回 loadedFile.text，setValue() 在 loaded 模式下更新 loadedFile.text
const SIZE_LIMIT = 500 * 1024; // 500KB
const loadedFile = ref<{ name: string; size: number; text: string } | null>(
  null,
);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("读取失败"));
    reader.readAsText(file, "utf-8");
  });
}

async function readAndLoadFile(file: File) {
  const isJsonByExt = file.name.toLowerCase().endsWith(".json");
  const isJsonByMime =
    file.type === "application/json" || file.type === "text/json";
  if (!isJsonByExt && !isJsonByMime) {
    ElMessage.error("仅支持 .json 文件");
    return;
  }
  let text = "";
  try {
    text = await readFileAsText(file);
  } catch (e) {
    recordError(e, "读取 OpenAPI JSON 文件");
    ElMessage.error(`读取文件失败：${file.name}`);
    return;
  }
  if (file.size > SIZE_LIMIT) {
    // 大文件：不写入 textarea，存进 loadedFile
    loadedFile.value = { name: file.name, size: file.size, text };
    ElMessage.warning(
      `已加载 ${file.name}（${formatSize(file.size)}），未在编辑器中显示，避免浏览器卡顿`,
    );
  } else {
    // 小文件：写入 textarea
    if (textareaRef.value) textareaRef.value.value = text;
    loadedFile.value = null;
    ElMessage.success(`已加载 ${file.name}（${formatSize(file.size)}）`);
  }
  // 把读到的内容交给父级 parse（无论大小）
  emit("fileLoaded", { name: file.name, text, size: file.size });
}

function viewInEditor() {
  if (!loadedFile.value) return;
  if (textareaRef.value) textareaRef.value.value = loadedFile.value.text;
  loadedFile.value = null;
  ElMessage.warning("已切到编辑器模式，大文本可能导致浏览器卡顿");
}

function clearLoadedFile() {
  loadedFile.value = null;
  if (textareaRef.value) textareaRef.value.value = "";
}

// ===== 粘贴大文件警告 =====
function onPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData("text") ?? "";
  if (text.length > SIZE_LIMIT) {
    ElMessage.warning(
      `粘贴内容较大（${formatSize(text.length)}），编辑器可能卡顿。建议点击「选择文件」从磁盘加载`,
    );
  }
}

// ===== JSON 编辑器：textarea 非受控 + 大文件走 loadedFile 旁路 =====
// getValue / setValue / clearEditor 三件套：
//   - 小文件 / 手动输入：读写 textarea.value
//   - 大文件：读写 loadedFile.text（不进 DOM，浏览器零渲染开销）
const textareaRef = ref<HTMLTextAreaElement | null>(null);

function getValue(): string {
  if (loadedFile.value) return loadedFile.value.text;
  return textareaRef.value?.value ?? "";
}

function setValue(v: string): void {
  if (loadedFile.value) {
    // 大文件模式：更新 loadedFile.text（不会触发 DOM 重排）
    loadedFile.value = { ...loadedFile.value, text: v ?? "" };
  } else if (textareaRef.value) {
    textareaRef.value.value = v ?? "";
  }
}

function clearEditor(): void {
  loadedFile.value = null;
  if (textareaRef.value) textareaRef.value.value = "";
}

defineExpose({ getValue, setValue, clearEditor });
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
.card-toolbar :deep(.el-tabs__header) {
  margin: 0;
}
.card-toolbar :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}
.form-area {
  padding: 16px;
  flex: 1;
  overflow: auto;
}
.error-alert {
  margin-top: 12px;
}
.json-textarea {
  width: 100%;
  display: block;
  box-sizing: border-box;
  resize: vertical;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 4px;
  background-color: var(--el-input-bg-color, #ffffff);
  color: var(--el-input-text-color, #303133);
  outline: none;
  transition: border-color 0.2s;
  font-family: "Fira Code", "Consolas", "Monaco", monospace;
  font-size: 12.5px;
  line-height: 1.5;
}
.json-textarea:hover {
  border-color: var(--el-border-color-hover, #c0c4cc);
}
.json-textarea:focus {
  border-color: var(--el-color-primary, #409eff);
  box-shadow: 0 0 0 1px var(--el-color-primary, #409eff) inset;
}

/* 大文件信息卡：替代 textarea 展示，避免 1MB+ 文本进 DOM */
.loaded-view {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 4px;
  background: var(--bg-soft, #f8fafc);
  min-height: 88px;
}
.loaded-icon {
  font-size: 32px;
  color: var(--el-color-primary, #409eff);
  flex-shrink: 0;
}
.loaded-info {
  flex: 1;
  min-width: 0;
}
.loaded-name {
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.loaded-meta {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
  display: flex;
  gap: 6px;
  align-items: center;
}
.loaded-dot {
  color: #d1d5db;
}
.loaded-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.url-input-wrap {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}
.url-input-wrap .el-input {
  flex: 1;
}
.url-history-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  max-width: 480px;
}
.url-history-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.url-history-del {
  cursor: pointer;
  color: #c0c4cc;
}
.url-history-del:hover {
  color: #f56c6c;
}
.json-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.json-drop-zone {
  position: relative;
  border: 1px dashed transparent;
  border-radius: 4px;
  transition:
    border-color 0.15s,
    background-color 0.15s;
}
.json-drop-zone.is-drag-over {
  border-color: var(--el-color-primary, #409eff);
  background-color: rgba(64, 158, 255, 0.06);
}
.drop-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(64, 158, 255, 0.08);
  border-radius: 4px;
  color: var(--el-color-primary, #409eff);
  font-size: 14px;
  font-weight: 500;
  pointer-events: none;
  z-index: 2;
}
.drop-icon {
  font-size: 28px;
}
</style>
