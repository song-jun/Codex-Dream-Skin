/*
 * Dream Skin 工作台控制器
 * 负责读取 Electron 状态、维护主题编辑草稿，并串行执行桌面端操作。
 * 页面组件只负责展示和绑定，不在模板中直接实现业务逻辑。
 */
import {
  computed,
  inject,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
  type ComputedRef,
  type InjectionKey,
  type Ref,
  type WritableComputedRef,
} from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type {
  CodexSessionRecord,
  RendererConnection,
  SessionState,
  Snapshot,
  ThemeRecord,
} from "../types";
import { analyzeImagePalette, type ImagePalette } from "../image-palette";

type ViewName = "overview" | "sessions";
type ThemeMode = "light" | "dark";
type CodexSessionGroup = {
  key: string;
  label: string;
  sessions: CodexSessionRecord[];
};
type ThemeSettingKey = "accent" | "accentInk" | "imageLuma";
type ThemeSettings = {
  maskOpacityLight: number;
  maskOpacityDark: number;
  caretColorLight: string;
  caretColorDark: string;
  accent: string | null;
  accentInk: string | null;
  imageLuma: number | null;
};

export type WorkbenchContext = {
  activeView: Ref<ViewName>;
  snapshot: Ref<Snapshot | null>;
  loading: Ref<boolean>;
  currentAction: Ref<string>;
  errorMessage: Ref<string>;
  activeTheme: ComputedRef<ThemeRecord | null>;
  themes: ComputedRef<ThemeRecord[]>;
  codexSessions: ComputedRef<CodexSessionRecord[]>;
  codexSessionGroups: ComputedRef<CodexSessionGroup[]>;
  art: ComputedRef<Record<string, unknown>>;
  installationMissing: ComputedRef<boolean>;
  statusLabel: ComputedRef<string>;
  statusTone: ComputedRef<string>;
  currentConnection: ComputedRef<RendererConnection | null>;
  canPause: ComputedRef<boolean>;
  canResume: ComputedRef<boolean>;
  operationText: ComputedRef<string>;
  managementThemeStyle: ComputedRef<Record<string, string>>;
  managementImageUrl: ComputedRef<string | null>;
  pendingImagePath: Ref<string | null>;
  pendingImageName: ComputedRef<string>;
  themeSettings: ThemeSettings;
  editingMode: Ref<ThemeMode>;
  editingModeLabel: ComputedRef<string>;
  editingOpacityVariable: ComputedRef<string>;
  editingCaretVariable: ComputedRef<string>;
  editingMaskOpacity: WritableComputedRef<number>;
  editingCaretColor: WritableComputedRef<string>;
  editingAccent: WritableComputedRef<string>;
  editingAccentInk: WritableComputedRef<string>;
  editingImageLuma: WritableComputedRef<number>;
  defaultEditingMaskOpacity: ComputedRef<number>;
  defaultCaretColor: ComputedRef<string>;
  themeAppearanceLabel: ComputedRef<string>;
  settingsDirty: Ref<boolean>;
  themeDefaults: Ref<ThemeRecord | null>;
  restoreConfirmVisible: Ref<boolean>;
  selectView: (key: string) => void;
  refresh: (showLoading?: boolean) => Promise<void>;
  runAction: (
    action: string,
    values?: string[],
    message?: string,
  ) => Promise<void>;
  installDreamSkin: () => Promise<void>;
  openStateFolder: () => Promise<void>;
  restoreSkin: () => Promise<void>;
  confirmRestore: () => Promise<void>;
  chooseTheme: (theme: ThemeRecord) => Promise<void>;
  chooseBackgroundImage: () => Promise<void>;
  applyThemeSettings: (message?: string) => Promise<void>;
  resetThemeSettings: () => Promise<void>;
  clearThemeSetting: (key: ThemeSettingKey) => void;
  saveCurrentTheme: () => Promise<void>;
  renameTheme: (theme: ThemeRecord) => Promise<void>;
  deleteTheme: (theme: ThemeRecord) => Promise<void>;
  deleteCodexSession: (session: CodexSessionRecord) => Promise<void>;
  chooseThemeId: Ref<string | null>;
  formatDate: (value?: string | null) => string;
  previewStyle: (
    theme: ThemeRecord | null | undefined,
    imageOverride?: string | null,
  ) => Record<string, string>;
  themeValue: (
    theme: ThemeRecord | null | undefined,
    key: string,
    fallback: string,
  ) => string;
};

export const WORKBENCH_KEY: InjectionKey<WorkbenchContext> = Symbol(
  "dream-skin-workbench",
);

/** 创建桌面工作台的唯一状态实例。 */
export function createWorkbench(): WorkbenchContext {
  const activeView = ref<ViewName>("overview");
  const snapshot = ref<Snapshot | null>(null);
  const loading = ref(false);
  const currentAction = ref("");
  const errorMessage = ref("");
  const switchingThemeId = ref<string | null>(null);
  const settingsDirty = ref(false);
  const pendingImagePath = ref<string | null>(null);
  const pendingImagePreview = ref<string | null>(null);
  const managementPalette = ref<ImagePalette | null>(null);
  const themeDefaults = ref<ThemeRecord | null>(null);
  const restoreConfirmVisible = ref(false);
  const editingMode = ref<ThemeMode>("dark");
  const themeSettings = reactive<ThemeSettings>({
    maskOpacityLight: 0.7,
    maskOpacityDark: 0.5,
    caretColorLight: "#C84F70",
    caretColorDark: "#6C7EEB",
    accent: null,
    accentInk: null,
    imageLuma: null,
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
          uninstalled: "未安装",
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
  const installationMissing = computed(
    () => snapshot.value?.installation === "missing",
  );
  const codexSessionGroups = computed<CodexSessionGroup[]>(() => {
    const groups = new Map<string, CodexSessionGroup>();
    for (const session of codexSessions.value) {
      // 使用实际工作目录作为键，避免同名项目被合并。
      const key = session.projectPath ?? session.project ?? "recent";
      const group = groups.get(key) ?? {
        key,
        label: session.project ?? "最近",
        sessions: [],
      };
      group.sessions.push(session);
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) => {
      if (left.key === "recent") return 1;
      if (right.key === "recent") return -1;
      return left.label.localeCompare(right.label, "zh-CN");
    });
  });
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
  const themeAppearanceLabel = computed(() =>
    activeTheme.value?.theme?.appearance === "light"
      ? "浅色模式"
      : activeTheme.value?.theme?.appearance === "dark"
        ? "暗色模式"
        : "跟随 Codex",
  );
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
    if (typeof value !== "string" || !value.trim()) return fallback;
    const reference =
      /^var\((?:--dream-caret-color(?:-(light|dark))?|--dream-send-bg)\)$/i.exec(
        value.trim(),
      );
    if (!reference) return value.trim();
    if (reference[1] === "light") return artVariables.value.caretColorLight;
    if (reference[1] === "dark") return artVariables.value.caretColorDark;
    return fallback;
  }

  const editingMaskOpacity = computed({
    get: () =>
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
    get: () =>
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
    return Number.isFinite(value) && value >= 0 && value <= 1
      ? value
      : fallback;
  });
  const defaultCaretColor = computed(() =>
    resolveCaretColor(
      defaultArt.value[
        editingMode.value === "light" ? "caretColorLight" : "caretColorDark"
      ] ?? defaultArt.value.caretColor,
      editingMode.value,
    ),
  );
  const pendingImageName = computed(() =>
    pendingImagePath.value
      ? (pendingImagePath.value.split(/[\\/]/).pop() ?? pendingImagePath.value)
      : "",
  );
  const managementImageUrl = computed(
    () => pendingImagePreview.value ?? activeTheme.value?.preview ?? null,
  );
  const committedAccent = computed<string>(() => {
    const value = art.value.accent;
    if (typeof value === "string" && value.trim()) return value.trim();
    const theme = activeTheme.value?.theme;
    const legacyPalette = theme?.palette as Record<string, unknown> | undefined;
    const legacyColors = theme?.colors as Record<string, unknown> | undefined;
    if (legacyPalette && typeof legacyPalette.accent === "string")
      return legacyPalette.accent.trim();
    if (legacyColors && typeof legacyColors.accent === "string")
      return legacyColors.accent.trim();
    const palette = managementPalette.value;
    return palette?.accent ?? "#54707E";
  });
  const committedAccentInk = computed<string>(() =>
    typeof art.value.accentInk === "string" && art.value.accentInk.trim()
      ? art.value.accentInk.trim()
      : (managementPalette.value?.accentInk ?? "#FFFFFF"),
  );
  const committedImageLuma = computed<number>(() => {
    const value = Number(art.value.imageLuma);
    return Number.isFinite(value) && value >= 0 && value <= 1
      ? value
      : (managementPalette.value?.luma ?? 0.32);
  });
  const editingAccent = computed({
    get: () => themeSettings.accent ?? committedAccent.value,
    set: (value: string) => {
      themeSettings.accent = value;
      scheduleThemeSettings();
    },
  });
  const editingAccentInk = computed({
    get: () => themeSettings.accentInk ?? committedAccentInk.value,
    set: (value: string) => {
      themeSettings.accentInk = value;
      scheduleThemeSettings();
    },
  });
  const editingImageLuma = computed({
    get: () => themeSettings.imageLuma ?? committedImageLuma.value,
    set: (value: number) => {
      themeSettings.imageLuma = value;
      scheduleThemeSettings();
    },
  });
  const managementThemeStyle = computed<Record<string, string>>(() => {
    if (!managementPalette.value && !art.value.accent) return {};
    const accent = committedAccent.value;
    return {
      "--dream-accent": accent,
      "--dream-accent-ink": committedAccentInk.value,
      "--dream-image-luma": committedImageLuma.value.toFixed(3),
      "--accent-ink": "var(--dream-accent-ink)",
      "--image-luma": "var(--dream-image-luma)",
      "--primary": accent,
      "--primary-dark": `color-mix(in oklab, ${accent} 76%, #163eac)`,
      "--primary-soft": `color-mix(in oklab, ${accent} 14%, #edf3ff)`,
      "--canvas": `color-mix(in oklab, ${accent} 4%, #f5f7fa)`,
      "--surface": `color-mix(in oklab, ${accent} 2%, #ffffff)`,
      "--surface-soft": `color-mix(in oklab, ${accent} 5%, #f8fafd)`,
      "--sidebar": `color-mix(in oklab, ${accent} 7%, #edf1f6)`,
      "--line": `color-mix(in oklab, ${accent} 12%, #e1e6ee)`,
      "--line-strong": `color-mix(in oklab, ${accent} 22%, #c5cedb)`,
      "--el-color-primary": accent,
      "--el-color-primary-light-3": `color-mix(in oklab, ${accent} 58%, #ffffff)`,
      "--el-color-primary-dark-2": `color-mix(in oklab, ${accent} 78%, #163eac)`,
      "--el-bg-color": `color-mix(in oklab, ${accent} 2%, #ffffff)`,
      "--el-bg-color-page": `color-mix(in oklab, ${accent} 4%, #f5f7fa)`,
      "--el-fill-color-blank": `color-mix(in oklab, ${accent} 2%, #ffffff)`,
      "--el-border-color": `color-mix(in oklab, ${accent} 12%, #e1e6ee)`,
      "--el-border-color-light": `color-mix(in oklab, ${accent} 9%, #e1e6ee)`,
    };
  });
  let paletteRequest = 0;
  async function updateManagementPalette(dataUrl: string | null) {
    const request = ++paletteRequest;
    if (!dataUrl) {
      managementPalette.value = null;
      return;
    }
    const palette = await analyzeImagePalette(dataUrl);
    if (request === paletteRequest) managementPalette.value = palette;
  }
  watch(
    managementImageUrl,
    (dataUrl) => {
      void updateManagementPalette(dataUrl);
    },
    { immediate: true },
  );

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
          "use-theme": "正在将主题应用到 Codex 界面",
          "update-theme": "正在应用外观参数",
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
          install: "正在安装 Dream Skin 运行时",
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
  function ensureBridge() {
    if (window.dreamSkin) return true;
    errorMessage.value =
      "当前是浏览器预览，尚未连接 Electron bridge，请使用 npm run dev 启动桌面应用。";
    return false;
  }
  function hydrateThemeSettings() {
    if (settingsDirty.value) return;
    const appearance = activeTheme.value?.theme?.appearance;
    if (appearance === "light" || appearance === "dark")
      editingMode.value = appearance;
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
    themeSettings.accent =
      typeof art.value.accent === "string" && art.value.accent.trim()
        ? art.value.accent.trim()
        : null;
    themeSettings.accentInk =
      typeof art.value.accentInk === "string" && art.value.accentInk.trim()
        ? art.value.accentInk.trim()
        : null;
    const imageLuma = Number(art.value.imageLuma);
    themeSettings.imageLuma =
      Number.isFinite(imageLuma) && imageLuma >= 0 && imageLuma <= 1
        ? imageLuma
        : null;
    pendingImagePath.value = null;
    pendingImagePreview.value = null;
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
      ElMessage.success(message);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "操作失败。";
      errorMessage.value = messageText;
      ElMessage.error(messageText);
    } finally {
      loading.value = false;
      currentAction.value = "";
    }
  }
  async function installDreamSkin() {
    if (loading.value) return;
    try {
      await ElMessageBox.confirm(
        "Dream Skin 运行时尚未安装。安装过程会准备主题目录，并可能要求关闭正在运行的 Codex。继续吗？",
        "安装 Dream Skin",
        {
          confirmButtonText: "开始安装",
          cancelButtonText: "取消",
          type: "warning",
        },
      );
      await runAction(
        "install",
        [],
        "Dream Skin 运行时安装完成，请重新启动皮肤。",
      );
    } catch {
      /* 用户取消安装 */
    }
  }
  async function chooseTheme(theme: ThemeRecord) {
    if (loading.value || theme.id === activeTheme.value?.id) return;
    if (settingsDirty.value) {
      try {
        await ElMessageBox.confirm(
          "当前有尚未应用的外观参数，切换主题会放弃这些修改。继续吗？",
          "放弃未应用修改",
          {
            confirmButtonText: "继续切换",
            cancelButtonText: "取消",
            type: "warning",
          },
        );
      } catch {
        return;
      }
      settingsDirty.value = false;
      pendingImagePath.value = null;
      pendingImagePreview.value = null;
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
  function clearThemeSetting(key: ThemeSettingKey) {
    themeSettings[key] = null;
    scheduleThemeSettings();
  }
  async function applyThemeSettings(message = "外观参数和背景图片已应用。") {
    if (!settingsDirty.value || !ensureBridge() || loading.value) return;
    loading.value = true;
    currentAction.value = "apply-theme";
    try {
      if (pendingImagePath.value)
        snapshot.value = await window.dreamSkin.action("set-image", [
          pendingImagePath.value,
        ]);
      snapshot.value = await window.dreamSkin.action("update-theme", [
        JSON.stringify({
          art: {
            maskOpacityLight: themeSettings.maskOpacityLight,
            maskOpacityDark: themeSettings.maskOpacityDark,
            caretColorLight: themeSettings.caretColorLight,
            caretColorDark: themeSettings.caretColorDark,
            accent: themeSettings.accent,
            accentInk: themeSettings.accentInk,
            imageLuma: themeSettings.imageLuma,
          },
        }),
      ]);
      settingsDirty.value = false;
      pendingImagePath.value = null;
      pendingImagePreview.value = null;
      syncThemeDefaults();
      hydrateThemeSettings();
      ElMessage.success(message);
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
    themeSettings.accent =
      typeof source.accent === "string" && source.accent.trim()
        ? source.accent.trim()
        : null;
    themeSettings.accentInk =
      typeof source.accentInk === "string" && source.accentInk.trim()
        ? source.accentInk.trim()
        : null;
    const imageLuma = Number(source.imageLuma);
    themeSettings.imageLuma =
      Number.isFinite(imageLuma) && imageLuma >= 0 && imageLuma <= 1
        ? imageLuma
        : null;
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
        pendingImagePreview.value =
          await window.dreamSkin.previewImage(filePath);
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
    if (!ensureBridge() || loading.value) return;
    restoreConfirmVisible.value = true;
  }
  async function confirmRestore() {
    if (!ensureBridge() || loading.value) return;
    restoreConfirmVisible.value = false;
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
      /* 用户取消保存 */
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
      /* 用户取消改名 */
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
      await runAction(
        "delete-theme",
        [theme.id],
        `主题“${theme.name}”已删除。`,
      );
    } catch {
      /* 用户取消删除 */
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
      await runAction(
        "delete-codex-session",
        [session.id],
        "Codex 会话已删除。",
      );
    } catch {
      /* 用户取消删除 */
    }
  }
  function previewStyle(
    theme: ThemeRecord | null | undefined,
    imageOverride?: string | null,
  ): Record<string, string> {
    const image = imageOverride ?? theme?.preview;
    if (!image) return {};
    return { backgroundImage: `url(${image})` };
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

  return {
    activeView,
    snapshot,
    loading,
    currentAction,
    errorMessage,
    activeTheme,
    themes,
    codexSessions,
    codexSessionGroups,
    installationMissing,
    statusLabel,
    statusTone,
    currentConnection,
    canPause,
    canResume,
    operationText,
    managementThemeStyle,
    managementImageUrl,
    pendingImagePath,
    pendingImageName,
    themeSettings,
    editingMode,
    editingModeLabel,
    editingOpacityVariable,
    editingCaretVariable,
    editingMaskOpacity,
    editingCaretColor,
    editingAccent,
    editingAccentInk,
    editingImageLuma,
    defaultEditingMaskOpacity,
    defaultCaretColor,
    themeAppearanceLabel,
    settingsDirty,
    themeDefaults,
    restoreConfirmVisible,
    art,
    selectView,
    refresh,
    runAction,
    installDreamSkin,
    openStateFolder,
    restoreSkin,
    confirmRestore,
    chooseTheme,
    chooseBackgroundImage,
    applyThemeSettings,
    resetThemeSettings,
    clearThemeSetting,
    saveCurrentTheme,
    renameTheme,
    deleteTheme,
    deleteCodexSession,
    chooseThemeId: switchingThemeId,
    formatDate,
    previewStyle,
    themeValue,
  };
}

/** 在页面组件中获取由 App 提供的共享工作台状态。 */
export function useWorkbenchContext(): WorkbenchContext {
  const context = inject(WORKBENCH_KEY);
  if (!context) throw new Error("Dream Skin 工作台上下文未初始化。");
  return context;
}
