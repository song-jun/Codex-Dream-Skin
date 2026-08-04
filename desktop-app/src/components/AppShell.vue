<!--
  组件名称：AppShell
  组件职责：提供桌面应用外壳、导航、全局状态提示和全屏加载层。
  交互边界：导航与全局操作调用工作台控制器，主题和会话内容交给子组件。
-->
<script setup lang="ts">
import { Close, CollectionTag, Document, FolderOpened, Monitor, Refresh, RefreshRight, Setting, WarningFilled } from "@element-plus/icons-vue";
import OverviewPanel from "./OverviewPanel.vue";
import SessionsPanel from "./SessionsPanel.vue";
import VersionHistoryPanel from "./VersionHistoryPanel.vue";
import { useWorkbenchContext } from "../composables/useWorkbench";
import packageJson from "../../package.json";

const appVersion = packageJson.version;

const {
  activeView,
  snapshot,
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
</script>

<template>
  <el-container class="app-shell" :style="managementThemeStyle">
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
        <div class="sidebar-version">v{{ snapshot?.version || appVersion }}</div>
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

        <OverviewPanel v-if="activeView === 'overview'" />
        <SessionsPanel v-else-if="activeView === 'sessions'" />
        <VersionHistoryPanel v-else />
      </el-main>
    </el-container>
  </el-container>
</template>
