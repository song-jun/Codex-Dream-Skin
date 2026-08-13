<template>
  <el-config-provider :locale="zhCn">
    <el-container class="app-container api-workbench-scope">
      <el-aside width="252px" class="app-aside">
        <div class="logo">
          <div class="logo-mark"><el-icon><Tools /></el-icon></div>
          <div class="logo-copy">
            <strong>API Workbench</strong>
            <span>DEVELOPER TOOLS</span>
          </div>
        </div>
        <div class="sidebar-section-label">工作区</div>
        <el-menu
          :default-active="activeMenu"
          :router="true"
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
        <div class="sidebar-context">
          <span class="context-label">当前文档</span>
          <strong>{{ docStore.doc?.info?.title || "尚未加载" }}</strong>
          <span class="context-meta">{{ docStore.doc ? `${docStore.endpoints.length} 个接口` : "等待 OpenAPI 文档" }}</span>
        </div>
        <div class="aside-footer">
          <!-- <el-button link type="primary" @click="emit('switch-skin')">
            <el-icon><Monitor /></el-icon>
            <span>Codex Dream Skin</span>
          </el-button> -->
          <el-button class="settings-button" link @click="openSettings">
            <el-icon><Setting /></el-icon>
            <span>环境设置</span>
          </el-button>
          <div class="version">
            <span>版本 v{{ APP_VERSION }}</span>
            <el-tooltip content="返回Skin" placement="left">
              <el-button class="back-button" type="primary" size="small" style="color: #fff;" :icon="Back" circle aria-label="返回 Dream Skin" @click="emit('switch-skin')" />
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
          <router-view v-slot="{ Component }">
            <keep-alive include="DocViewer,Generate">
              <component :is="Component" />
            </keep-alive>
          </router-view>
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
  --el-menu-bg-color: transparent;
  --el-menu-text-color: var(--text-secondary);
  --el-menu-hover-text-color: var(--text-primary);
  --el-menu-active-color: var(--brand-primary);
}
.app-aside {
  background: #101827;
  color: #f8fafc;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #24324a;
}
.logo {
  height: 78px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 20px;
  color: #f8fafc;
  border-bottom: 1px solid #24324a;
}
.logo-mark {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  color: #fff;
  border: 1px solid #5f9bff;
  border-radius: 10px;
  background: #2f7ff0;
  box-shadow: 0 5px 14px rgba(28, 100, 218, 0.35);
}
.logo-mark .el-icon {
  width: 19px;
  height: 19px;
  font-size: 19px;
}
.logo-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  line-height: 1.1;
}
.logo-copy strong {
  font-size: 15px;
  font-weight: 650;
  letter-spacing: 0;
}
.logo-copy span {
  color: #7f8da5;
  font-size: 9px;
  font-weight: 650;
  letter-spacing: 0.12em;
}
.sidebar-section-label {
  padding: 22px 20px 9px;
  color: #71809a;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.app-menu {
  flex: 1;
  padding: 0 10px;
  background: transparent;
  border-right: none;
}
.app-menu :deep(.el-menu-item) {
  height: 44px;
  margin: 3px 0;
  padding: 0 12px !important;
  color: #aebbd0;
  border-radius: 8px;
  line-height: 44px;
  transition: color 0.15s ease, background 0.15s ease;
}
.app-menu :deep(.el-menu-item .el-icon) {
  width: 18px;
  height: 18px;
  margin-right: 10px;
  color: #7f8da5;
  font-size: 17px;
}
.app-menu :deep(.el-menu-item:hover) {
  color: #f8fafc;
  background: #1b2a42;
}
.app-menu :deep(.el-menu-item:hover .el-icon) {
  color: #bcd4ff;
}
.app-menu :deep(.el-menu-item.is-active) {
  color: #fff;
  background: #245fd0;
  box-shadow: 0 5px 14px rgba(25, 86, 193, 0.25);
}
.app-menu :deep(.el-menu-item.is-active .el-icon) {
  color: #fff;
}
.sidebar-context {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 16px 20px;
  padding: 13px 14px;
  overflow: hidden;
  border: 1px solid #263650;
  border-radius: 8px;
  background: #162237;
}
.context-label {
  color: #74839b;
  font-size: 11px;
}
.sidebar-context strong {
  overflow: hidden;
  color: #eef4ff;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.context-meta {
  overflow: hidden;
  color: #8d9bb1;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aside-footer {
  padding: 14px 16px 16px;
  border-top: 1px solid #24324a;
  background: #0c1422;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}
.aside-footer :deep(.el-button) {
  color: #aebbd0;
}
.aside-footer :deep(.settings-button) {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 34px;
  margin: 0;
  padding: 0 10px;
  gap: 6px;
  border-radius: 6px;
}
.aside-footer :deep(.settings-button:hover) {
  color: #fff;
  background: #1b2a42;
}
.aside-footer :deep(.settings-button .el-icon) {
  width: 16px;
  height: 16px;
  margin: 0;
  font-size: 16px;
  line-height: 1;
}
.version {
  width: 100%;
  color: #71809a;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.back-button {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  background: #2f7ff0;
}
.back-button:hover {
  background: #5598ff;
}
.app-header {
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
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
  color: var(--text-primary);
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
  background: var(--brand-primary);
  color: #fff;
  border-radius: 8px;
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
  background: var(--bg-page);
}
</style>
