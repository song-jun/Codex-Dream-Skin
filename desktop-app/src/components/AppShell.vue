<!--
  组件名称：AppShell
  组件职责：提供桌面应用外壳、导航、全局状态提示和全屏加载层。
  交互边界：导航与全局操作调用工作台控制器，主题和会话内容交给子组件。
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { Close, CollectionTag, Document, FolderOpened, Monitor, Refresh, RefreshRight, Setting, SwitchButton, WarningFilled } from "@element-plus/icons-vue";
import OverviewPanel from "./OverviewPanel.vue";
import SessionsPanel from "./SessionsPanel.vue";
import VersionHistoryPanel from "./VersionHistoryPanel.vue";
import ApiWorkbenchPanel from "../api-workbench/ApiWorkbenchPanel.vue";
import { useWorkbenchContext } from "../composables/useWorkbench";
import packageJson from "../../package.json";

const appVersion = packageJson.version;
type ApplicationMode = "skin" | "api";
const TRANSITION_LOADING_KEY = "codexDreamSkin:transition-loading";
const TRANSITION_LOADING_EVENT = "codexDreamSkin:transition-loading";
const TRANSITION_LOADING_END_EVENT = "codexDreamSkin:transition-loading-end";
const featureKeyDialogVisible = ref(false);
const featureKey = ref("");
const featureKeySubmitting = ref(false);
const route = useRoute();
const router = useRouter();
function isApiRoute(path: string): boolean {
  return path.startsWith("/api-workbench") || window.location.hash.startsWith("#/api-workbench");
}
const applicationMode = ref<ApplicationMode>(isApiRoute(route.path) ? "api" : "skin");
const transitionLoading = ref(
  typeof window !== "undefined" && sessionStorage.getItem(TRANSITION_LOADING_KEY) === "1",
);
let transitionLoadingTimer: number | null = null;
let stopFeatureCommand: (() => void) | null = null;

const {
  activeView,
  snapshot,
  featureUnlocked,
  loading,
  errorMessage,
  installationMissing,
  runtimeUpdateAvailable,
  statusLabel,
  statusTone,
  currentConnection,
  operationText,
  canPause,
  canResume,
  managementThemeStyle,
  selectView,
  refresh,
  runAction,
  installDreamSkin,
  updateRuntime,
  openStateFolder,
  restoreSkin,
  restoreConfirmVisible,
  confirmRestore,
} = useWorkbenchContext();

watch(
  () => route.path,
  (path) => {
    applicationMode.value = isApiRoute(path) ? "api" : "skin";
    if (isApiRoute(path) && transitionLoading.value) scheduleTransitionLoadingEnd();
  },
  { immediate: true },
);

function scheduleTransitionLoadingEnd() {
  if (transitionLoadingTimer !== null) window.clearTimeout(transitionLoadingTimer);
  transitionLoadingTimer = window.setTimeout(() => {
    if (isApiRoute(route.path)) {
      sessionStorage.removeItem(TRANSITION_LOADING_KEY);
      transitionLoading.value = false;
    }
    transitionLoadingTimer = null;
  }, 700);
}

function handleTransitionLoading() {
  transitionLoading.value = true;
  if (isApiRoute(route.path)) scheduleTransitionLoadingEnd();
}

function handleTransitionLoadingEnd() {
  if (transitionLoadingTimer !== null) window.clearTimeout(transitionLoadingTimer);
  transitionLoadingTimer = null;
  sessionStorage.removeItem(TRANSITION_LOADING_KEY);
  transitionLoading.value = false;
}

function openFeatureKeyDialog() {
  featureKey.value = "";
  featureKeyDialogVisible.value = true;
}

async function submitFeatureKey() {
  if (!window.dreamSkin || !featureKey.value.trim() || featureKeySubmitting.value) return;
  featureKeySubmitting.value = true;
  try {
    const result = await window.dreamSkin.activateFeature(featureKey.value.trim());
    if (snapshot.value) snapshot.value = { ...snapshot.value, featureUnlocked: result.featureUnlocked, featurePermanent: result.featurePermanent };
    featureKeyDialogVisible.value = false;
    featureKey.value = "";
    ElMessage.success("功能菜单已启用。");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "功能密钥无效。");
  } finally {
    featureKeySubmitting.value = false;
  }
}

async function restoreFeatureAccess() {
  if (!window.dreamSkin || featureKeySubmitting.value) return;
  featureKeySubmitting.value = true;
  try {
    const result = await window.dreamSkin.deactivateFeature();
    if (snapshot.value) snapshot.value = { ...snapshot.value, featureUnlocked: result.featureUnlocked, featurePermanent: result.featurePermanent };
    featureKeyDialogVisible.value = false;
    featureKey.value = "";
    ElMessage.success("功能菜单已隐藏。");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "撤销菜单失败。");
  } finally {
    featureKeySubmitting.value = false;
  }
}

function openFeatureCategory(category: "api" | "skin") {
  if (!featureUnlocked.value) return;
  if (category === "api") {
    applicationMode.value = "api";
    if (!route.path.startsWith("/api-workbench")) void router.push("/api-workbench/doc");
    return;
  }
  switchToSkin();
}

function switchToSkin() {
  applicationMode.value = "skin";
  selectView("overview");
  if (route.path !== "/") void router.replace("/");
}

onMounted(() => {
  window.addEventListener(TRANSITION_LOADING_EVENT, handleTransitionLoading);
  window.addEventListener(TRANSITION_LOADING_END_EVENT, handleTransitionLoadingEnd);
  if (window.dreamSkin) stopFeatureCommand = window.dreamSkin.onFeatureCommand(openFeatureCategory);
  if (transitionLoading.value && isApiRoute(route.path)) scheduleTransitionLoadingEnd();
});

onUnmounted(() => {
  window.removeEventListener(TRANSITION_LOADING_EVENT, handleTransitionLoading);
  window.removeEventListener(TRANSITION_LOADING_END_EVENT, handleTransitionLoadingEnd);
  if (transitionLoadingTimer !== null) window.clearTimeout(transitionLoadingTimer);
  stopFeatureCommand?.();
  stopFeatureCommand = null;
});
</script>

<template>
  <div v-if="transitionLoading" class="fullscreen-loading transition-loading" role="status" aria-live="polite">
    <div class="fullscreen-loading-panel">
      <span class="loading-ring" /><strong>正在加载 API Workbench</strong>
      <span>配置已保存，正在恢复当前工作区</span>
    </div>
  </div>
  <ApiWorkbenchPanel v-if="applicationMode === 'api'" @switch-skin="switchToSkin" />

  <el-container v-else class="app-shell" :style="managementThemeStyle">
    <el-aside class="sidebar" width="252px">
      <div class="brand-block">
        <div class="brand-mark"><Monitor /></div>
        <div class="brand-copy">
          <strong>Codex Dream Skin</strong><span>视觉主题工作台</span>
        </div>
      </div>
      <div class="nav-label">工作区</div>
      <el-menu :default-active="activeView" class="nav-menu" @select="selectView">
        <el-menu-item index="overview">
          <el-icon><Monitor /></el-icon><span>主题控制</span>
        </el-menu-item>
        <el-menu-item index="sessions">
          <el-icon><CollectionTag /></el-icon><span>Codex 会话</span>
        </el-menu-item>
        <el-menu-item index="history">
          <el-icon><Document /></el-icon><span>版本记录</span>
        </el-menu-item>
      </el-menu>
      <div class="sidebar-session">
        <div class="nav-label">当前状态</div>
        <div class="session-summary">
          <span class="status-dot" :class="statusTone" /><strong>{{ statusLabel }}</strong>
          <small>{{ currentConnection ? `renderer · ${currentConnection.endpoint}` : "等待 Dream Skin renderer" }}</small>
        </div>
        <div class="guard-line"><span class="guard-mark" />本机 CDP 连接</div>
        <div class="guard-line"><span class="guard-mark" />官方 Codex 窗口</div>
        <div class="sidebar-version-row">
          <span>v{{ appVersion }}</span>
          <el-tooltip content="设置功能密钥" placement="right">
            <el-button class="sidebar-settings-button" :icon="Setting" circle aria-label="设置功能密钥" @click="openFeatureKeyDialog" />
          </el-tooltip>
        </div>
      </div>
    </el-aside>

    <el-container class="content-shell">
      <el-header class="topbar" height="78px">
        <div class="topbar-title">
          <div class="breadcrumb">DREAM SKIN / {{ snapshot?.platform === "darwin" ? "MACOS" : "WINDOWS" }}</div>
          <h1>{{ activeView === "overview" ? "主题控制" : activeView === "sessions" ? "Codex 会话" : "版本记录" }}</h1>
        </div>
        <div class="top-actions">
          <div class="status-chip" :class="statusTone"><span class="status-dot" />{{ statusLabel }}</div>
          <el-tooltip content="刷新状态" placement="bottom">
            <el-button class="icon-button" :icon="Refresh" circle @click="refresh(true)" />
          </el-tooltip>
          <el-button class="secondary-button" :icon="FolderOpened" @click="openStateFolder">打开状态目录</el-button>
          <el-button
            class="secondary-button"
            :icon="SwitchButton"
            type="danger"
            @click="runAction(snapshot?.codexRunning ? 'stop-codex' : 'start-codex', [], snapshot?.codexRunning ? 'Codex 已关闭。' : 'Codex 已开启。')"
          >{{ snapshot?.codexRunning ? "关闭 Codex" : "开启 Codex" }}</el-button>
        </div>
      </el-header>

      <el-main class="main-area">
        <el-alert v-if="errorMessage" :title="errorMessage" type="error" :closable="false" show-icon class="error-alert" />
        <div v-if="installationMissing" class="installation-alert">
          <el-alert title="Dream Skin 运行时尚未安装" description="请先安装 Dream Skin 运行时，再启动皮肤或修改主题。安装过程不会修改官方 Codex 安装文件。" type="warning" :closable="false" show-icon />
          <el-button type="primary" :icon="Setting" @click="installDreamSkin">安装 Dream Skin 运行时</el-button>
        </div>
        <div v-else-if="runtimeUpdateAvailable" class="installation-alert">
          <el-alert :title="snapshot?.runtimeUpdateKind === 'development' ? '检测到开发版样式更新' : '检测到新的皮肤资源'" :description="snapshot?.runtimeUpdateKind === 'development' ? '当前 Codex 仍由旧 watcher 控制，重新注入后会使用仓库中的最新样式。' : '安装包内的 CSS 和注入器比本机运行时更新，同步后会保留主题库和图片。'" type="warning" :closable="false" show-icon />
          <el-button type="primary" :icon="RefreshRight" @click="updateRuntime">{{ snapshot?.runtimeUpdateKind === 'development' ? '应用开发版样式' : '更新运行时' }}</el-button>
        </div>
        <div v-if="loading" class="fullscreen-loading" role="status" aria-live="polite">
          <div class="fullscreen-loading-panel">
            <span class="loading-ring" /><strong>{{ operationText }}</strong>
            <span>完成后会自动刷新 Codex 状态</span>
          </div>
        </div>
        <div v-if="restoreConfirmVisible" class="restore-dialog-backdrop" role="presentation" @click.self="restoreConfirmVisible = false">
          <section class="restore-dialog" role="dialog" aria-modal="true" aria-labelledby="restore-dialog-title">
            <button class="restore-dialog-close" type="button" aria-label="关闭" @click="restoreConfirmVisible = false"><Close /></button>
            <div class="restore-dialog-icon"><WarningFilled /></div>
            <div class="restore-dialog-content">
              <div class="eyebrow">外观恢复</div>
              <h3 id="restore-dialog-title">恢复官方 Codex 外观？</h3>
              <p>这会关闭并重新打开官方 Codex，移除当前 Dream Skin 注入。未保存的 Codex 输入可能丢失。</p>
            </div>
            <div class="restore-dialog-actions">
              <el-button class="secondary-button" :icon="Close" @click="restoreConfirmVisible = false">取消</el-button>
              <el-button type="primary" :icon="RefreshRight" @click="confirmRestore">恢复官方外观</el-button>
            </div>
          </section>
        </div>
        <div v-if="featureKeyDialogVisible" class="restore-dialog-backdrop" role="presentation" @click.self="featureKeyDialogVisible = false">
          <section class="feature-dialog" role="dialog" aria-modal="true" aria-labelledby="feature-dialog-title">
            <button class="restore-dialog-close" type="button" aria-label="关闭" @click="featureKeyDialogVisible = false"><Close /></button>
            <div class="feature-dialog-header">
              <div class="eyebrow">FEATURE ACCESS</div>
              <h3 id="feature-dialog-title">设置功能密钥</h3>
              <p v-if="snapshot?.featurePermanent === true">验证后启用桌面端“功能”菜单。格式：sj 加 10000 到 99999；永久密钥：sj520。</p>
            </div>
            <el-form class="feature-key-form" @submit.prevent="submitFeatureKey">
              <el-form-item label="功能密钥">
                <el-input v-model="featureKey" type="password" show-password maxlength="16" autocomplete="off" placeholder="请输入功能密钥" @keyup.enter="submitFeatureKey" />
              </el-form-item>
              <div class="feature-dialog-actions">
                <el-button @click="featureKeyDialogVisible = false">取消</el-button>
                <el-button v-if="featureUnlocked" type="warning" plain :loading="featureKeySubmitting" @click="restoreFeatureAccess">撤销</el-button>
                <el-button type="primary" :loading="featureKeySubmitting" @click="submitFeatureKey">验证并启用</el-button>
              </div>
            </el-form>
          </section>
        </div>

        <OverviewPanel v-if="activeView === 'overview'" />
        <SessionsPanel v-else-if="activeView === 'sessions'" />
        <VersionHistoryPanel v-else-if="activeView === 'history'" />
      </el-main>
    </el-container>
  </el-container>
</template>
