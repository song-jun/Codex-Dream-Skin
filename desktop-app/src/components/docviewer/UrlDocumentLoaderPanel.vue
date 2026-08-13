<!-- URL 文档加载面板：选择或输入 OpenAPI URL，并提供历史记录与收藏操作。 -->
<template>
  <el-form label-position="top" size="default">
    <el-form-item label="API 文档 URL">
      <div class="url-input-wrap">
        <el-select
          :model-value="urlValue"
          class="url-select"
          filterable
          allow-create
          default-first-option
          clearable
          placeholder="选择默认地址或输入新的 URL"
          @update:model-value="emit('update:urlValue', $event)"
          @change="onUrlSelectChange"
          @blur="onUrlBlur"
        >
          <template #prefix><el-icon><Link /></el-icon></template>
          <el-option v-for="url in presetUrls" :key="url" :label="url" :value="url" />
        </el-select>
        <el-dropdown trigger="click" @command="onUrlHistorySelect">
          <el-button :icon="ArrowDown" title="历史与收藏">历史</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="history in urlHistory"
                :key="history"
                :command="history"
                :disabled="history === urlValue"
              >
                <span class="url-history-item">
                  <el-icon v-if="isFavorite(history)" class="favorite-icon"><StarFilled /></el-icon>
                  <el-icon v-else class="empty-favorite-icon"><Star /></el-icon>
                  <span class="url-history-text">{{ history }}</span>
                  <el-icon class="url-history-del" title="删除" @click.stop="onUrlHistoryDel(history)"><Close /></el-icon>
                </span>
              </el-dropdown-item>
              <el-dropdown-item v-if="urlHistory.length === 0" disabled>暂无历史</el-dropdown-item>
              <el-dropdown-item v-else divided command="__clear__"><span class="clear-history">清空历史</span></el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button
          :type="isFavorite(urlValue) ? 'warning' : 'default'"
          :icon="isFavorite(urlValue) ? StarFilled : Star"
          :disabled="!urlValue"
          title="收藏"
          @click="onToggleFavorite"
        />
      </div>
    </el-form-item>
    <el-form-item>
      <el-button type="primary" :loading="isLoading" @click="emit('load')"><el-icon><Download /></el-icon><span>拉取文档</span></el-button>
      <el-button type="primary" :loading="isLoading" :disabled="!hasLoaded" @click="emit('generate')"><el-icon><MagicStick /></el-icon><span>生成代码</span></el-button>
      <el-button :disabled="!urlValue" @click="emit('update:urlValue', '')"><el-icon><Refresh /></el-icon><span>清空</span></el-button>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
/** URL 文档加载面板的输入、历史和收藏事件定义。 */
import { ArrowDown, Close, Download, Link, MagicStick, Refresh, Star, StarFilled } from "@element-plus/icons-vue";

defineProps<{
  urlValue: string;
  presetUrls: string[];
  urlHistory: string[];
  isLoading: boolean;
  hasLoaded: boolean;
  isFavorite: (url: string) => boolean;
  onUrlBlur: () => void;
  onUrlSelectChange: (value: string) => void;
  onUrlHistorySelect: (value: string) => void;
  onUrlHistoryDel: (value: string) => void;
  onToggleFavorite: () => void;
}>();

const emit = defineEmits<{
  (e: "update:urlValue", value: string): void;
  (e: "load"): void;
  (e: "generate"): void;
}>();
</script>

<style scoped>
.url-input-wrap { display: flex; align-items: center; width: 100%; gap: 8px; }
.url-select { flex: 1; min-width: 0; }
.url-history-item { display: inline-flex; align-items: center; width: 100%; max-width: 480px; gap: 6px; }
.url-history-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.favorite-icon { color: #e6a23c; }
.empty-favorite-icon, .url-history-del { color: #c0c4cc; }
.url-history-del { cursor: pointer; }
.url-history-del:hover, .clear-history { color: #f56c6c; }
</style>
