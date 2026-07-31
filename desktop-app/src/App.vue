<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  Check,
  Clock,
  CollectionTag,
  Delete,
  EditPen,
  FolderOpened,
  Link,
  Monitor,
  Moon,
  Picture,
  Refresh,
  RefreshRight,
  Setting,
  SwitchButton,
  VideoPause,
  VideoPlay,
} from "@element-plus/icons-vue";
import type {
  CodexSessionRecord,
  RendererConnection,
  SessionState,
  Snapshot,
  ThemeRecord,
} from "./types";

type ViewName = "overview" | "sessions";
type ThemeMode = "light" | "dark";
type Activity = {
  action: string;
  message: string;
  at: string;
  tone: "success" | "error";
};

const activeView = ref<ViewName>("overview");
const snapshot = ref<Snapshot | null>(null);
const loading = ref(false);
const currentAction = ref("");
const errorMessage = ref("");
const activities = ref<Activity[]>([]);
const switchingThemeId = ref<string | null>(null);
const settingsDirty = ref(false);
const pendingImagePath = ref<string | null>(null);
const themeDefaults = ref<ThemeRecord | null>(null);
const editingMode = ref<ThemeMode>("dark");
const themeSettings = reactive({
  maskOpacityLight: 0.7,
  maskOpacityDark: 0.5,
  caretColorLight: "#C84F70",
  caretColorDark: "#6C7EEB",
});
let refreshTimer: number | undefined;

const statusLabel = computed(
  () =>
    (
      ({
        active: "运行中",
        paused: "已暂停",
        off: "未启动",
        stale: "状态过期",
        unknown: "连接中",
      }) as Record<SessionState, string>
    )[snapshot.value?.session ?? "unknown"],
);
const statusTone = computed(() =>
  snapshot.value?.session === "active"
    ? "is-online"
    : snapshot.value?.session === "paused"
      ? "is-paused"
      : "is-offline",
);
const activeTheme = computed(() => snapshot.value?.active ?? null);
const themes = computed(() => snapshot.value?.themes ?? []);
const codexSessions = computed(() => snapshot.value?.codexSessions ?? []);
const art = computed(
  () => (activeTheme.value?.theme?.art ?? {}) as Record<string, unknown>,
);
const artVariables = computed(
  () =>
    snapshot.value?.variables ?? {
      maskOpacityLight: 0.7,
      maskOpacityDark: 0.5,
      caretColorLight: "#C84F70",
      caretColorDark: "#6C7EEB",
    },
);
const defaultArt = computed(
  () => (themeDefaults.value?.theme?.art ?? {}) as Record<string, unknown>,
);
const themeAppearanceLabel = computed(() => {
  const appearance = activeTheme.value?.theme?.appearance;
  return appearance === "light"
    ? "浅色模式"
    : appearance === "dark"
      ? "暗色模式"
      : "跟随 Codex";
});
const editingModeLabel = computed(() =>
  editingMode.value === "light" ? "浅色模式" : "暗色模式",
);
const editingOpacityVariable = computed(() =>
  editingMode.value === "light"
    ? "--dream-mask-opacity-light"
    : "--dream-mask-opacity-dark",
);
const editingCaretVariable = computed(() =>
  editingMode.value === "light"
    ? "--dream-caret-color-light"
    : "--dream-caret-color-dark",
);
function resolveCaretColor(value: unknown, mode: ThemeMode): string {
  const fallback =
    mode === "light"
      ? artVariables.value.caretColorLight
      : artVariables.value.caretColorDark;
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  const color = value.trim();
  const reference = /^var\((?:--dream-caret-color(?:-(light|dark))?|--dream-send-bg)\)$/i.exec(color);
  if (!reference) return color;
  if (reference[1] === "light") return artVariables.value.caretColorLight;
  if (reference[1] === "dark") return artVariables.value.caretColorDark;
  return fallback;
}
const editingMaskOpacity = computed({
  get: (): number =>
    editingMode.value === "light"
      ? themeSettings.maskOpacityLight
      : themeSettings.maskOpacityDark,
  set: (value: number) => {
    if (editingMode.value === "light") themeSettings.maskOpacityLight = value;
    else themeSettings.maskOpacityDark = value;
    scheduleThemeSettings();
  },
});
const editingCaretColor = computed({
  get: (): string =>
    editingMode.value === "light"
      ? themeSettings.caretColorLight
      : themeSettings.caretColorDark,
  set: (value: string) => {
    if (editingMode.value === "light") themeSettings.caretColorLight = value;
    else themeSettings.caretColorDark = value;
    scheduleThemeSettings();
  },
});
const defaultEditingMaskOpacity = computed(() => {
  const legacy = Number(defaultArt.value.maskOpacity);
  const value = Number(
    defaultArt.value[
      editingMode.value === "light" ? "maskOpacityLight" : "maskOpacityDark"
    ] ?? legacy,
  );
  const fallback =
    editingMode.value === "light"
      ? artVariables.value.maskOpacityLight
      : artVariables.value.maskOpacityDark;
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
});
const defaultCaretColor = computed(() =>
  resolveCaretColor(
    defaultArt.value[
      editingMode.value === "light" ? "caretColorLight" : "caretColorDark"
    ] ?? defaultArt.value.caretColor,
    editingMode.value,
  ),
);
const pendingImageName = computed(() => {
  if (!pendingImagePath.value) return "";
  return pendingImagePath.value.split(/[\\/]/).pop() ?? pendingImagePath.value;
});
const currentConnection = computed<RendererConnection | null>(
  () => snapshot.value?.connection ?? null,
);
const canPause = computed(() => snapshot.value?.session === "active");
const canResume = computed(() => snapshot.value?.session === "paused");
const operationText = computed(
  () =>
    (
      ({
        refresh: "正在刷新 Dream Skin 状态",
        "use-theme": "正在将主题应用到 Codex renderer",
        "update-theme": "正在实时应用外观参数",
        "apply-theme": "正在应用外观参数和背景图片",
        "choose-image": "正在准备背景图片",
        "delete-codex-session": "正在删除 Codex 会话",
        start: "正在启动或重启 Codex Dream Skin",
        pause: "正在暂停皮肤注入",
        resume: "正在恢复皮肤注入",
        restore: "正在恢复官方外观",
        "save-theme": "正在保存主题",
        "rename-theme": "正在修改主题名称",
        "delete-theme": "正在删除主题",
        "open-state-folder": "正在打开状态目录",
      }) as Record<string, string>
    )[currentAction.value] ?? "正在处理，请稍候",
);

function selectView(key: string) {
  if (key === "overview" || key === "sessions") activeView.value = key;
}

function formatDate(value?: string | null): string {
  if (!value) return "未知时间";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间不可用"
    : date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function addActivity(
  action: string,
  message: string,
  tone: Activity["tone"] = "success",
) {
  activities.value.unshift({
    action,
    message,
    tone,
    at: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
  });
  activities.value = activities.value.slice(0, 8);
}

function ensureBridge() {
  if (window.dreamSkin) return true;
  errorMessage.value =
    "当前是浏览器预览，尚未连接 Electron bridge，请使用 npm run dev 启动桌面应用。";
  return false;
}

function hydrateThemeSettings() {
  if (settingsDirty.value) return;
  const appearance = activeTheme.value?.theme?.appearance;
  if (appearance === "light" || appearance === "dark") {
    editingMode.value = appearance;
  }
  const legacy = Number(art.value.maskOpacity);
  const light = Number(art.value.maskOpacityLight ?? legacy);
  const dark = Number(art.value.maskOpacityDark ?? legacy);
  themeSettings.maskOpacityLight =
    Number.isFinite(light) && light >= 0 && light <= 1
      ? light
      : artVariables.value.maskOpacityLight;
  themeSettings.maskOpacityDark =
    Number.isFinite(dark) && dark >= 0 && dark <= 1
      ? dark
      : artVariables.value.maskOpacityDark;
  themeSettings.caretColorLight = resolveCaretColor(
    art.value.caretColorLight ?? art.value.caretColor,
    "light",
  );
  themeSettings.caretColorDark = resolveCaretColor(
    art.value.caretColorDark ?? art.value.caretColor,
    "dark",
  );
  pendingImagePath.value = null;
}

function syncThemeDefaults() {
  const active = snapshot.value?.active;
  if (!active || themeDefaults.value?.id === active.id) return;
  themeDefaults.value =
    themes.value.find((theme) => theme.id === active.id) ?? active;
}

async function refresh(showLoading = false) {
  if (!ensureBridge() || (loading.value && !showLoading)) return;
  if (showLoading) {
    loading.value = true;
    currentAction.value = "refresh";
  }
  try {
    errorMessage.value = "";
    snapshot.value = await window.dreamSkin.snapshot();
    syncThemeDefaults();
    hydrateThemeSettings();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "无法读取 Dream Skin 状态。";
  } finally {
    if (showLoading) {
      loading.value = false;
      currentAction.value = "";
    }
  }
}

function actionLabel(action: string): string {
  return (
    (
      {
        start: "启动 / 重启",
        pause: "暂停皮肤",
        resume: "恢复皮肤",
        restore: "恢复官方外观",
        "use-theme": "切换主题",
        "save-theme": "保存主题",
        "rename-theme": "修改主题名称",
        "delete-theme": "删除主题",
        "delete-codex-session": "删除 Codex 会话",
      } as Record<string, string>
    )[action] ?? action
  );
}

async function runAction(
  action: string,
  values: string[] = [],
  message = "操作已完成",
) {
  if (loading.value || !ensureBridge()) return;
  loading.value = true;
  currentAction.value = action;
  errorMessage.value = "";
  try {
    snapshot.value = await window.dreamSkin.action(action, values);
    syncThemeDefaults();
    hydrateThemeSettings();
    addActivity(actionLabel(action), message);
    ElMessage.success(message);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "操作失败。";
    errorMessage.value = messageText;
    addActivity(actionLabel(action), messageText, "error");
    ElMessage.error(messageText);
  } finally {
    loading.value = false;
    currentAction.value = "";
  }
}

async function chooseTheme(theme: ThemeRecord) {
  if (loading.value || theme.id === activeTheme.value?.id) return;
  if (settingsDirty.value) {
    try {
      await ElMessageBox.confirm(
        "当前有尚未应用的外观参数，切换主题会放弃这些修改。继续吗？",
        "放弃未应用修改",
        { confirmButtonText: "继续切换", cancelButtonText: "取消", type: "warning" },
      );
    } catch {
      return;
    }
    settingsDirty.value = false;
    pendingImagePath.value = null;
    hydrateThemeSettings();
  }
  switchingThemeId.value = theme.id;
  try {
    await runAction(
      "use-theme",
      [theme.id],
      `已切换到“${theme.name}”，Codex 正在实时更新。`,
    );
  } finally {
    switchingThemeId.value = null;
  }
}

function scheduleThemeSettings() {
  settingsDirty.value = true;
}

async function applyThemeSettings(activityMessage = "外观参数和背景图片已应用。") {
  if (!settingsDirty.value || !ensureBridge()) return;
  if (loading.value) return;
  loading.value = true;
  currentAction.value = "apply-theme";
  try {
    if (pendingImagePath.value) {
      snapshot.value = await window.dreamSkin.action("set-image", [
        pendingImagePath.value,
      ]);
    }
    snapshot.value = await window.dreamSkin.action("update-theme", [
      JSON.stringify({
        art: {
          maskOpacityLight: themeSettings.maskOpacityLight,
          maskOpacityDark: themeSettings.maskOpacityDark,
          caretColorLight: themeSettings.caretColorLight,
          caretColorDark: themeSettings.caretColorDark,
        },
      }),
    ]);
    settingsDirty.value = false;
    pendingImagePath.value = null;
    syncThemeDefaults();
    hydrateThemeSettings();
    addActivity("应用外观参数", activityMessage);
    ElMessage.success(activityMessage);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "外观参数更新失败。";
    ElMessage.error(errorMessage.value);
  } finally {
    loading.value = false;
    currentAction.value = "";
  }
}

async function resetThemeSettings() {
  if (!ensureBridge() || loading.value) return;
  const defaults = themeDefaults.value ?? activeTheme.value;
  if (!defaults) return;
  const source = (defaults.theme?.art ?? {}) as Record<string, unknown>;
  const legacy = Number(source.maskOpacity);
  const light = Number(source.maskOpacityLight ?? legacy);
  const dark = Number(source.maskOpacityDark ?? legacy);
  themeSettings.maskOpacityLight =
    Number.isFinite(light) && light >= 0 && light <= 1
      ? light
      : artVariables.value.maskOpacityLight;
  themeSettings.maskOpacityDark =
    Number.isFinite(dark) && dark >= 0 && dark <= 1
      ? dark
      : artVariables.value.maskOpacityDark;
  themeSettings.caretColorLight = resolveCaretColor(
    source.caretColorLight ?? source.caretColor,
    "light",
  );
  themeSettings.caretColorDark = resolveCaretColor(
    source.caretColorDark ?? source.caretColor,
    "dark",
  );
  pendingImagePath.value =
    defaults.imagePath && defaults.imagePath !== activeTheme.value?.imagePath
      ? defaults.imagePath
      : null;
  settingsDirty.value = true;
  await applyThemeSettings("当前主题已重置为默认参数和背景图片。");
}

async function chooseBackgroundImage() {
  if (!ensureBridge() || loading.value) return;
  loading.value = true;
  currentAction.value = "choose-image";
  try {
    const filePath = await window.dreamSkin.chooseImage();
    if (filePath) {
      pendingImagePath.value = filePath;
      settingsDirty.value = true;
      ElMessage.info("背景图片已选择，点击“应用”后更新 Codex。");
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "背景图片选择失败。";
    ElMessage.error(errorMessage.value);
  } finally {
    loading.value = false;
    currentAction.value = "";
  }
}

async function openStateFolder() {
  if (!ensureBridge() || loading.value) return;
  loading.value = true;
  currentAction.value = "open-state-folder";
  try {
    await window.dreamSkin.openStateFolder();
  } finally {
    loading.value = false;
    currentAction.value = "";
  }
}

async function restoreSkin() {
  if (
    !ensureBridge() ||
    loading.value ||
    !(await window.dreamSkin.confirmRestore())
  )
    return;
  await runAction("restore", [], "官方外观已恢复。");
}

async function saveCurrentTheme() {
  try {
    const result = await ElMessageBox.prompt(
      "将当前主题保存到 Dream Skin 主题库。",
      "保存主题",
      {
        confirmButtonText: "保存",
        cancelButtonText: "取消",
        inputPlaceholder: "主题名称",
        inputPattern: /^[^\u0000-\u001f]{1,80}$/,
        inputErrorMessage: "请输入 1 到 80 个可见字符。",
      },
    );
    await runAction(
      "save-theme",
      [result.value],
      `主题“${result.value}”已保存。`,
    );
  } catch {
    /* 用户取消 */
  }
}

async function renameTheme(theme: ThemeRecord) {
  try {
    const result = await ElMessageBox.prompt(
      "修改主题在主题库中的显示名称。",
      "修改主题名称",
      {
        confirmButtonText: "保存",
        cancelButtonText: "取消",
        inputValue: theme.name,
        inputPattern: /^[^\u0000-\u001f]{1,80}$/,
        inputErrorMessage: "请输入 1 到 80 个可见字符。",
      },
    );
    await runAction(
      "rename-theme",
      [theme.id, result.value],
      `主题已改名为“${result.value}”。`,
    );
  } catch {
    /* 用户取消 */
  }
}

async function deleteTheme(theme: ThemeRecord) {
  try {
    await ElMessageBox.confirm(
      `确定删除主题“${theme.name}”吗？此操作会删除主题文件和主题图片。`,
      "删除主题",
      {
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        type: "warning",
      },
    );
    await runAction("delete-theme", [theme.id], `主题“${theme.name}”已删除。`);
  } catch {
    /* 用户取消 */
  }
}

async function deleteCodexSession(session: CodexSessionRecord) {
  try {
    await ElMessageBox.confirm(
      `确定删除会话“${session.title}”吗？这会删除本地 Codex 会话记录文件。`,
      "删除 Codex 会话",
      {
        confirmButtonText: "删除会话",
        cancelButtonText: "取消",
        type: "warning",
      },
    );
    await runAction("delete-codex-session", [session.id], "Codex 会话已删除。");
  } catch {
    /* 用户取消 */
  }
}

function previewStyle(theme: ThemeRecord | null | undefined) {
  return theme?.preview ? { backgroundImage: `url(${theme.preview})` } : {};
}

function themeValue(
  theme: ThemeRecord | null | undefined,
  key: string,
  fallback: string,
) {
  const value = theme?.theme?.[key];
  return typeof value === "string" && value ? value : fallback;
}

onMounted(async () => {
  await refresh();
  refreshTimer = window.setInterval(() => {
    void refresh();
  }, 5000);
});
onUnmounted(() => {
  if (refreshTimer) window.clearInterval(refreshTimer);
});
</script>

<template>
  <el-container class="app-shell">
    <el-aside class="sidebar" width="252px">
      <div class="brand-block">
        <div class="brand-mark"><Monitor /></div>
        <div class="brand-copy">
          <strong>Codex Dream Skin</strong><span>视觉主题工作台</span>
        </div>
      </div>
      <div class="nav-label">工作区</div>
      <el-menu
        :default-active="activeView"
        class="nav-menu"
        @select="selectView"
      >
        <el-menu-item index="overview"
          ><el-icon><Monitor /></el-icon><span>主题控制</span
          ><small>01</small></el-menu-item
        >
        <el-menu-item index="sessions"
          ><el-icon><CollectionTag /></el-icon><span>Codex 会话</span
          ><small>02</small></el-menu-item
        >
      </el-menu>
      <div class="sidebar-session">
        <div class="nav-label">当前状态</div>
        <div class="session-summary">
          <span class="status-dot" :class="statusTone" /><strong>{{
            statusLabel
          }}</strong
          ><small>{{
            currentConnection
              ? `renderer · ${currentConnection.endpoint}`
              : "等待 Dream Skin renderer"
          }}</small>
        </div>
        <div class="guard-line"><span class="guard-mark" />本机 CDP 连接</div>
        <div class="guard-line"><span class="guard-mark" />官方 Codex 窗口</div>
      </div>
    </el-aside>

    <el-container class="content-shell">
      <el-header class="topbar" height="78px">
        <div class="topbar-title">
          <div class="breadcrumb">
            DREAM SKIN /
            {{ snapshot?.platform === "darwin" ? "MACOS" : "WINDOWS" }}
          </div>
          <h1>{{ activeView === "overview" ? "主题控制" : "Codex 会话" }}</h1>
        </div>
        <div class="top-actions">
          <div class="status-chip" :class="statusTone">
            <span class="status-dot" />{{ statusLabel }}
          </div>
          <el-tooltip content="刷新状态" placement="bottom"
            ><el-button
              class="icon-button"
              :icon="Refresh"
              circle
              @click="refresh(true)"
          /></el-tooltip>
          <el-button
            class="secondary-button"
            :icon="FolderOpened"
            @click="openStateFolder"
            >打开状态目录</el-button
          >
        </div>
      </el-header>
      <el-main class="main-area">
        <el-alert
          v-if="errorMessage"
          :title="errorMessage"
          type="error"
          :closable="false"
          show-icon
          class="error-alert"
        />
        <div
          v-if="loading"
          class="fullscreen-loading"
          role="status"
          aria-live="polite"
        >
          <div class="fullscreen-loading-panel">
            <span class="loading-ring" /><strong>{{ operationText }}</strong
            ><span>完成后会自动刷新 Codex 状态</span>
          </div>
        </div>

        <template v-if="activeView === 'overview'">
          <section class="hero-row">
            <div class="hero-copy">
              <div class="eyebrow accent-text">主题工作台</div>
              <h2>让 Codex 更像你的工作台</h2>
              <p>
                主题、背景图和阅读保护层会通过现有 watcher 实时同步到
                Codex，原生侧栏、项目选择、输入框和任务内容保持可交互。
              </p>
            </div>
            <div class="hero-actions">
              <el-button
                type="primary"
                :icon="RefreshRight"
                @click="
                  runAction('start', [], 'Codex Dream Skin 已启动或重启。')
                "
                >启动 / 重启</el-button
              ><el-button
                v-if="canPause"
                class="warning-button"
                :icon="VideoPause"
                @click="runAction('pause', [], '皮肤已暂停，Codex 保持运行。')"
                >暂停皮肤</el-button
              ><el-button
                v-else-if="canResume"
                type="primary"
                plain
                :icon="VideoPlay"
                @click="runAction('resume', [], '皮肤已恢复。')"
                >恢复皮肤</el-button
              ><el-button
                class="danger-button"
                :icon="SwitchButton"
                @click="restoreSkin"
                >恢复官方外观</el-button
              >
            </div>
          </section>
          <section class="stat-strip">
            <div class="stat-cell">
              <span>当前主题</span
              ><strong>{{ activeTheme?.name ?? "未读取" }}</strong
              ><small>ACTIVE THEME</small>
            </div>
            <div class="stat-cell">
              <span>Codex 进程</span
              ><strong>{{
                snapshot?.codexRunning ? "运行中" : "未检测到"
              }}</strong
              ><small>OFFICIAL APP</small>
            </div>
            <div class="stat-cell">
              <span>Codex 会话</span><strong>{{ codexSessions.length }}</strong
              ><small>SESSION INDEX</small>
            </div>
            <div class="stat-cell">
              <span>最后状态</span
              ><strong>{{
                snapshot?.stateUpdatedAt
                  ? formatDate(snapshot.stateUpdatedAt)
                  : "未知"
              }}</strong
              ><small>STATE.JSON</small>
            </div>
          </section>
          <section class="workspace-grid">
            <div class="panel preview-panel">
              <div class="panel-head">
                <div>
                  <div class="eyebrow">当前预览</div>
                  <h3>{{ activeTheme?.name ?? "等待主题状态" }}</h3>
                </div>
                <el-tag
                  effect="plain"
                  :type="snapshot?.session === 'active' ? 'success' : 'info'"
                  >{{
                    snapshot?.session === "active" ? "实时应用" : "待应用"
                  }}</el-tag
                >
              </div>
              <div
                class="preview-frame"
                :class="{ empty: !activeTheme?.preview }"
                :style="previewStyle(activeTheme)"
              >
                <div v-if="activeTheme?.preview" class="preview-shade" />
                <div v-if="activeTheme?.preview" class="preview-caption">
                  <span>当前主题</span
                  ><strong>{{
                    themeValue(activeTheme, "tagline", "Codex Dream Skin")
                  }}</strong
                  ><small>{{ themeValue(activeTheme, "image", "") }}</small>
                </div>
                <div v-else class="preview-empty">
                  <span class="preview-empty-icon"><Picture /></span
                  ><strong>没有可显示的主题预览</strong
                  ><small>连接 Dream Skin 后，这里会显示当前背景图片。</small>
                </div>
              </div>
              <div class="preview-meta">
                <span
                  ><Picture />{{
                    themeValue(activeTheme, "image", "未选择背景图")
                  }}</span
                ><span
                  ><Moon />{{ themeAppearanceLabel }}</span
                ><span><Setting />{{ String(art.taskMode ?? "auto") }}</span>
              </div>
            </div>
            <div class="panel inspector-panel">
              <div class="panel-head">
                <div>
                  <div class="eyebrow">主题信息</div>
                  <h3>外观参数</h3>
                </div>
                <div class="inspector-actions">
                  <el-button
                    v-if="snapshot?.platform !== 'darwin'"
                    class="text-button"
                    :icon="Setting"
                    @click="saveCurrentTheme"
                    >保存当前主题</el-button
                  >
                </div>
              </div>
              <div class="variable-controls">
                <div class="variable-control background-variable-control">
                  <div class="variable-label">
                    <span>背景图片</span>
                    <code>{{ pendingImagePath ? "待应用" : "当前主题" }}</code>
                  </div>
                  <div class="variable-input background-input">
                    <el-button
                      class="text-button"
                      :icon="Picture"
                      @click="chooseBackgroundImage"
                      >选择图片</el-button>
                    <span class="background-name">{{
                      pendingImageName ||
                      themeValue(activeTheme, "image", "未选择背景图片")
                    }}</span>
                  </div>
                  <small>选择后不会立即更新 Codex，点击下方“应用”后才会生效。</small>
                </div>
                <div class="variable-control">
                  <div class="variable-label">
                    <span>编辑模式</span><code>主题参数</code>
                  </div>
                  <div class="variable-input mode-input">
                    <el-select v-model="editingMode" class="mode-select">
                      <el-option label="浅色模式" value="light" />
                      <el-option label="暗色模式" value="dark" />
                    </el-select>
                    <span class="mode-current"
                      >当前主题：{{ themeAppearanceLabel }}</span
                    >
                  </div>
                  <small>选择要编辑的遮罩透明度和输入框光标颜色。</small>
                </div>
                <div class="variable-control">
                  <div class="variable-label">
                    <span>{{ editingModeLabel }}遮罩透明度</span
                    ><code>{{ editingOpacityVariable }}</code>
                  </div>
                  <div class="variable-input">
                    <el-slider
                      v-model="editingMaskOpacity"
                      :min="0"
                      :max="1"
                      :step="0.01"
                    /><strong
                      >{{
                        Math.round(editingMaskOpacity * 100)
                      }}%</strong
                    >
                  </div>
                  <small
                    >当前主题默认值：{{
                      Math.round(defaultEditingMaskOpacity * 100)
                    }}%</small
                  >
                </div>
                <div class="variable-control">
                  <div class="variable-label">
                    <span>{{ editingModeLabel }}输入框光标颜色</span
                    ><code>{{ editingCaretVariable }}</code>
                  </div>
                  <div class="variable-input color-input">
                    <el-color-picker
                      v-model="editingCaretColor"
                    /><code>{{ editingCaretColor }}</code>
                  </div>
                  <small
                    >当前主题默认值：{{
                      defaultCaretColor
                    }}</small
                  >
                </div>
              </div>
              <div class="inspector-footer">
                <div class="inspector-dirty-state">
                  <span
                    class="status-dot"
                    :class="settingsDirty ? 'is-paused' : 'is-online'"
                  />
                  {{ settingsDirty ? "有未应用修改" : "参数已应用" }}
                </div>
                <div class="inspector-footer-actions">
                  <el-button
                    class="secondary-button"
                    :icon="Refresh"
                    :disabled="!themeDefaults"
                    @click="resetThemeSettings"
                    >重置当前主题</el-button>
                  <el-button
                    type="primary"
                    :icon="Check"
                    :disabled="!settingsDirty"
                    @click="applyThemeSettings()"
                    >应用</el-button>
                </div>
              </div>
            </div>
          </section>
          <section class="theme-library">
            <div class="section-head">
              <div>
                <div class="eyebrow">已保存主题 / {{ themes.length }}</div>
                <h3>主题库</h3>
              </div>
              <span class="section-rule" />
            </div>
            <div class="theme-grid">
              <article
                v-for="theme in themes"
                :key="theme.id"
                class="theme-card"
                :class="{
                  selected: theme.id === activeTheme?.id,
                  switching: switchingThemeId === theme.id,
                }"
                @click="chooseTheme(theme)"
              >
                <div class="theme-art" :style="previewStyle(theme)">
                  <span v-if="theme.id === activeTheme?.id" class="live-label"
                    >当前使用</span
                  >
                </div>
                <div class="theme-card-body">
                  <strong>{{ theme.name }}</strong>
                  <div class="theme-card-meta">
                    <span>{{ theme.id }}</span>
                    <div class="theme-card-actions">
                      <el-tooltip content="修改名称"
                        ><el-button
                          circle
                          text
                          :icon="EditPen"
                          @click.stop="renameTheme(theme)" /></el-tooltip
                      ><el-tooltip content="删除主题"
                        ><el-button
                          circle
                          text
                          class="delete-button"
                          :icon="Delete"
                          @click.stop="deleteTheme(theme)"
                      /></el-tooltip>
                    </div>
                  </div>
                  <el-icon
                    v-if="theme.id === activeTheme?.id"
                    class="theme-selected-mark"
                    ><Check
                  /></el-icon>
                </div>
              </article>
              <div v-if="!themes.length" class="empty-state">
                主题库为空，请先完成 Dream Skin 安装。
              </div>
            </div>
          </section>
        </template>

        <template v-else>
          <section class="hero-row session-hero">
            <div class="hero-copy">
              <div class="eyebrow accent-text">Codex 会话</div>
              <h2>读取真实的 Codex 会话记录</h2>
              <p>
                列表来自本机 Codex 的
                session_index.jsonl，显示会话标题和更新时间。删除操作会同步移除对应的本地会话记录文件。
              </p>
            </div>
            <div class="session-state">
              <span class="status-dot" :class="statusTone" /><strong
                >{{ codexSessions.length }} 个会话</strong
              ><small>实时读取本地 Codex 索引</small>
            </div>
          </section>
          <section class="session-layout">
            <div class="panel current-session-panel">
              <div class="panel-head">
                <div>
                  <div class="eyebrow">当前皮肤连接</div>
                  <h3>Dream Skin renderer</h3>
                </div>
                <el-tag
                  effect="plain"
                  :type="currentConnection ? 'success' : 'info'"
                  >{{ currentConnection ? "已连接" : "未连接" }}</el-tag
                >
              </div>
              <div v-if="currentConnection" class="connection-body">
                <div class="connection-identity">
                  <span class="connection-icon"><Link /></span>
                  <div>
                    <strong>{{ currentConnection.endpoint }}</strong
                    ><span
                      >{{
                        snapshot?.platform === "darwin" ? "macOS" : "Windows"
                      }}
                      · 官方 Codex renderer</span
                    >
                  </div>
                </div>
                <div class="session-row">
                  <span>浏览器标识</span
                  ><code>{{
                    currentConnection.browserId ?? "由平台状态管理"
                  }}</code>
                </div>
                <div class="session-row">
                  <span>injector PID</span
                  ><code>{{ currentConnection.injectorPid ?? "—" }}</code>
                </div>
                <div class="session-row">
                  <span>连接开始</span
                  ><strong>{{
                    formatDate(currentConnection.startedAt)
                  }}</strong>
                </div>
                <div class="session-actions">
                  <el-button
                    type="primary"
                    :icon="RefreshRight"
                    @click="
                      runAction('start', [], 'Codex Dream Skin 已启动或重启。')
                    "
                    >重启并应用</el-button
                  >
                </div>
              </div>
              <el-empty
                v-else
                description="启动 Dream Skin 后，这里会显示 renderer 连接。"
                :image-size="58"
              />
            </div>
            <div class="panel history-panel">
              <div class="panel-head">
                <div>
                  <div class="eyebrow">Codex 原生记录</div>
                  <h3>会话列表</h3>
                </div>
                <el-icon class="muted-icon"><Clock /></el-icon>
              </div>
              <div class="history-note">
                标题和时间来自 Codex 会话索引，不读取消息正文。
              </div>
              <div v-if="codexSessions.length" class="codex-session-list">
                <div
                  v-for="session in codexSessions"
                  :key="session.id"
                  class="codex-session-item"
                >
                  <span class="session-index-mark"><CollectionTag /></span>
                  <div class="history-copy">
                    <strong>{{ session.title }}</strong
                    ><span
                      >{{ formatDate(session.updatedAt) }} ·
                      {{ session.id }}</span
                    >
                  </div>
                  <el-tooltip content="删除 Codex 会话" placement="left"
                    ><el-button
                      class="delete-button"
                      :icon="Delete"
                      circle
                      @click="deleteCodexSession(session)"
                  /></el-tooltip>
                </div>
              </div>
              <el-empty
                v-else
                description="没有找到 Codex 会话记录"
                :image-size="52"
              />
            </div>
          </section>
        </template>
      </el-main>
    </el-container>
  </el-container>
</template>
