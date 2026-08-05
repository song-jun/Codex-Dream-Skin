<template>
  <el-config-provider :locale="zhCn">
    <el-container class="app-container">
      <el-aside width="220px" class="app-aside">
        <div class="logo">
          <el-icon :size="22" color="#fff"><Tools /></el-icon>
          <span>API Workbench</span>
        </div>
        <el-menu
          :default-active="activeMenu"
          :router="true"
          background-color="#1e293b"
          text-color="#cbd5e1"
          active-text-color="#fff"
          class="app-menu"
        >
          <el-menu-item index="/api-workbench/doc">
            <el-icon><Document /></el-icon>
            <span>OpenAPI 文档</span>
          </el-menu-item>
          <el-menu-item index="/api-workbench/generate">
            <el-icon><MagicStick /></el-icon>
            <span>生成代码</span>
          </el-menu-item>
          <el-menu-item index="/api-workbench/invoke">
            <el-icon><Promotion /></el-icon>
            <span>调用接口</span>
          </el-menu-item>
        </el-menu>
        <div class="aside-footer">
          <!-- <el-button link type="primary" @click="emit('switch-skin')">
            <el-icon><Monitor /></el-icon>
            <span>Codex Dream Skin</span>
          </el-button> -->
          <el-button link type="primary" @click="openSettings">
            <el-icon><Setting /></el-icon>
            <span>设置</span>
          </el-button>
          <div class="version">
            <div>v{{ APP_VERSION }}</div>
            <el-tooltip content="返回Skin" placement="left">
              <el-button type="primary" size="small" :icon="Back" style="color: #fff;" circle @click="emit('switch-skin')" />
            </el-tooltip>
          </div>
        </div>
      </el-aside>

      <el-container>
        <el-header class="app-header">
          <span class="header-title">{{ currentTitle }}</span>
          <div class="header-right">
            <!-- 永久性导出状态条：跨页面持续，从 export store 读取 -->
            <transition name="export-fade">
              <div
                v-if="exportStore.isExporting"
                class="export-bar"
                :title="exportStore.progressText"
              >
                <el-icon class="export-bar-spin"><Loading /></el-icon>
                <span class="export-bar-text">{{
                  exportStore.progressText
                }}</span>
                <div class="export-bar-progress">
                  <div
                    class="export-bar-fill"
                    :style="{ width: exportStore.percent + '%' }"
                  ></div>
                </div>
              </div>
            </transition>
            <el-tag v-if="docStore.doc" type="success" size="small">
              文档已加载：{{ docStore.doc.info?.title || "N/A" }}
            </el-tag>
            <el-tag v-else type="info" size="small">未加载文档</el-tag>
          </div>
        </el-header>
        <el-main class="app-main">
          <router-view />
        </el-main>
      </el-container>

      <SettingsDialog v-model="settingsVisible" />
    </el-container>
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { useDocStore } from "@/stores/doc";
import { useExportStore } from "@/stores/export";
import {
  Document,
  Loading,
  MagicStick,
  Monitor,
  Promotion,
  Setting,
  Tools,
  Back,
} from "@element-plus/icons-vue";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import SettingsDialog from "@/components/SettingsDialog.vue";
import pkg from "../../package.json";

const APP_VERSION = pkg.version;
const APP_AUTHOR = pkg.author;

const route = useRoute();
const docStore = useDocStore();
const exportStore = useExportStore();
const activeMenu = computed(() => route.path);
const currentTitle = computed(
  () => (route.meta?.title as string) || "API Workbench",
);

const settingsVisible = ref(false);
const emit = defineEmits<{
  "switch-skin": [];
}>();
const openSettings = () => (settingsVisible.value = true);
</script>

<style scoped>
.app-container {
  height: 100%;
  min-height: 560px;
}
.app-aside {
  background: #1e293b;
  color: #fff;
  display: flex;
  flex-direction: column;
}
.logo {
  height: 60px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  border-bottom: 1px solid #334155;
}
.app-menu {
  flex: 1;
  border-right: none;
}
.app-menu :deep(.el-menu-item) {
  margin: 4px 8px;
  border-radius: 6px;
  height: 42px;
  line-height: 42px;
}
.app-menu :deep(.el-menu-item.is-active) {
  background: var(--brand-primary);
}
.app-menu :deep(.el-menu-item:hover) {
  background: #334155;
}
.aside-footer {
  padding: 12px 20px;
  border-top: 1px solid #334155;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.aside-footer :deep(.el-button) {
  color: #cbd5e1;
}
.version {
  width: 100%;
  color: #64748b;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.app-header {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.header-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

/* 永久性导出状态条：跨页面持续，主题色高亮
 * - 固定宽度（不随文本长度变化）
 * - 文本溢出省略
 * - 旋转图标 + 进度条 */
.export-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: var(--brand-primary, #2563eb);
  color: #fff;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
  width: 280px; /* 固定宽度，避免文本变化时跳动 */
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
}
.export-bar-spin {
  animation: spin 1s linear infinite;
  flex-shrink: 0;
}
.export-bar-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  z-index: 1;
  position: relative;
  flex: 1;
  min-width: 0; /* 配合 flex 省略 */
}
.export-bar-progress {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  width: 100%;
  background: rgba(255, 255, 255, 0.25);
}
.export-bar-fill {
  height: 100%;
  background: #fff;
  transition: width 0.2s ease-out;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.export-fade-enter-active,
.export-fade-leave-active {
  transition: opacity 0.2s ease;
}
.export-fade-enter-from,
.export-fade-leave-to {
  opacity: 0;
}
.app-main {
  padding: 0;
  background: var(--bg-soft);
}
</style>
