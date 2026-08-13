/**
 * 文档加载 composable
 * 负责：URL 拉取、JSON 编辑（textarea 完全非受控，composable 不持有 draft 状态）、
 *       URL 历史/收藏（localStorage）、接口 tag 分组、JSON 行级高亮、
 *       curl 复制、路由 query 处理
 *
 * 设计：textarea 内容由 DocLoaderCard 自己管理（getValue/setValue），
 *       composable 只在"显式动作"（loadFromJson / prettyJson / loadFromFile /
 *       loadFromUrl）被调用时接收或返回文本，不参与每次按键的响应式追踪。
 */
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { storeToRefs } from "pinia";
import { ElMessage } from "element-plus";
import { useRoute } from "vue-router";
import { useDocStore } from "@/stores/doc";
import { useConfigStore } from "@/stores/config";
import { DEFAULT_API_URL } from "@/core/env";
import { copyToClipboard } from "@/utils/clipboard";
import { updateEndpointSnapshot } from "@/core/endpointDiff";
import { formatJson } from "@/utils/formatJson";
import { recordError, showFriendlyError } from "@/utils/errorRecords";
import {
  buildSwaggerUrl,
  DEFAULT_SWAGGER_CONFIG_PATH,
  DEFAULT_SWAGGER_DOMAIN,
  fetchSwaggerServices,
  type SwaggerServiceOption,
} from "@/core/swaggerConfig";
import type { IEndpointInfo, IOpenAPIDocument } from "@/core/types";

export type DocViewTab = "list" | "raw";
export type DocTab = "custom" | "json" | "history" | "url";

/** 当日成功解析的 OpenAPI JSON 历史记录。 */
export interface JsonParseHistoryItem {
  id: string;
  content: string;
  updatedAt: string;
  title: string;
  sourceName?: string;
  endpointCount: number;
}

export interface TagGroup {
  name: string;
  endpoints: IEndpointInfo[];
}

const HISTORY_KEY = "apiWorkbench.docUrlHistory";
const FAV_KEY = "apiWorkbench.docUrlFavorites";
const JSON_HISTORY_KEY = "apiWorkbench.jsonParseHistory";
const JSON_HISTORY_LIMIT = 20;

/** localStorage 安全读取（数组内只保留 string） */
function loadList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
}

/** 将日期转换为本地日期键，避免 UTC 跨日时显示错误的当天记录。 */
function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 从本地存储读取当天有效的 JSON 解析历史。 */
function loadJsonHistory(): JsonParseHistoryItem[] {
  try {
    const raw = localStorage.getItem(JSON_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const today = getLocalDateKey(new Date());
    return parsed
      .filter((item): item is JsonParseHistoryItem => {
        if (!item || typeof item !== "object") return false;
        const value = item as Partial<JsonParseHistoryItem>;
        if (
          typeof value.id !== "string" ||
          typeof value.content !== "string" ||
          typeof value.updatedAt !== "string" ||
          typeof value.title !== "string" ||
          typeof value.endpointCount !== "number"
        ) {
          return false;
        }
        const updatedAt = new Date(value.updatedAt);
        return !Number.isNaN(updatedAt.getTime()) && getLocalDateKey(updatedAt) === today;
      })
      .slice(0, JSON_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

/** 持久化 JSON 历史；存储不可用时保留本次会话的内存记录。 */
function saveJsonHistory(items: JsonParseHistoryItem[]) {
  try {
    localStorage.setItem(JSON_HISTORY_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota */
  }
}

function isValidUrl(s: string) {
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function useDocLoader() {
  const route = useRoute();
  const docStore = useDocStore();
  const {
    newEndpointKeys,
    missingEndpointKeys,
    missingEndpoints,
    comparedSnapshotKey,
    showOnlyNewEndpoints,
    showOnlyMissingEndpoints,
  } = storeToRefs(docStore);
  const configStore = useConfigStore();

  // ===== 加载卡片本地状态 =====
  const urlValue = ref<string>(DEFAULT_API_URL[0] || "");
  const friendlyErrorMsg = ref<string>("");
  // 注：JSON 编辑器内容由 DocLoaderCard 完全非受控管理（getValue/setValue），
  //     composable 不持有任何 draft 状态，避免每次按键触发响应式追踪
  const tab = ref<DocTab>("custom");
  const customDomain = ref(DEFAULT_SWAGGER_DOMAIN);
  const customConfigPath = ref(DEFAULT_SWAGGER_CONFIG_PATH);
  const customServices = ref<SwaggerServiceOption[]>([]);
  const customServiceUrl = ref("");
  const isFetchingCustomServices = ref(false);
  const hasFetchedCustomServices = ref(false);

  // ===== 查看卡片本地状态 =====
  const activeTab = ref<DocViewTab>("list");
  const listCollapseAll = ref<boolean>(false);
  const expandedTags = ref<Record<string, boolean>>({});
  const selectedTag = ref<string>("");
  const searchText = ref<string>("");
  const showOnlyMine = ref<boolean>(false);

  // ===== 接口 tag 分组（按 tag 名排序）=====
  const tagGroups = computed<TagGroup[]>(() => {
    const map = new Map<string, IEndpointInfo[]>();
    for (const ep of docStore.endpoints) {
      const key = ep.tag || "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ep);
    }
    return Array.from(map.entries())
      .map(([name, endpoints]) => ({ name, endpoints }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  });

  // ===== URL 历史 / 收藏（持久化到 localStorage）=====
  const urlHistory = ref<string[]>(loadList(HISTORY_KEY));
  const favorites = ref<string[]>(loadList(FAV_KEY));
  const jsonHistory = ref<JsonParseHistoryItem[]>(loadJsonHistory());

  // 预设地址（来自 .env OPENAPI_DEFAULT_API_URL）
  // 注意：DEFAULT_API_URL 是模块级 let，computed 追踪不到引用变化
  // 用 ref 镜像 + 监听 apiworkbench:env-changed 事件，env 保存后强制刷新
  const presetUrls = ref<string[]>([...DEFAULT_API_URL]);
  const _envHandler = () => {
    presetUrls.value = [...DEFAULT_API_URL];
  };
  window.addEventListener("apiworkbench:env-changed", _envHandler);

  // ===== 统一清理：组件卸载时释放所有定时器 + 事件监听 =====
  onBeforeUnmount(() => {
    window.removeEventListener("apiworkbench:env-changed", _envHandler);
  });

  // 默认展开所有 tag 分组
  watch(
    tagGroups,
    (groups) => {
      groups.forEach((t) => {
        if (expandedTags.value[t.name] === undefined) {
          expandedTags.value[t.name] = true;
        }
      });
    },
    { immediate: true },
  );

  // ===== prettyJson + 行级高亮 =====
  function escapeHtml(s: string) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  const _hlCache = new Map<string, string>();
  function highlightJsonLine(line: string): string {
    if (line === "") return "&nbsp;";
    const cached = _hlCache.get(line);
    if (cached !== undefined) return cached;
    let html = escapeHtml(line);
    // 字符串 "..." + 可选冒号
    html = html.replace(
      /&quot;((?:[^&]|&amp;|&lt;|&gt;)*?)&quot;(\s*:)?/g,
      (_m, _s, colon) =>
        colon
          ? `<span class="hljs-attr">&quot;${_s}&quot;</span>${colon}`
          : `<span class="hljs-string">&quot;${_s}&quot;</span>`,
    );
    // 数字
    html = html.replace(
      /\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g,
      '<span class="hljs-number">$1</span>',
    );
    // bool / null
    html = html.replace(
      /\b(true|false|null)\b/g,
      '<span class="hljs-literal">$1</span>',
    );
    if (_hlCache.size > 5000) _hlCache.clear();
    _hlCache.set(line, html);
    return html;
  }

  const highlightLines = computed<string[]>(() => {
    if (!docStore.doc) return [];
    const pretty = formatJson(docStore.doc);
    if (!pretty) return [];
    // normalize CRLF/CR，避免 \r 在 white-space: pre 下触发回车覆盖
    const src = pretty.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    return src.split("\n").map(highlightJsonLine);
  });

  /** 当前选中的接口（按 selectedTag 过滤后的第一个，未选中时为 null） */
  const selectedEndpoint = computed<IEndpointInfo | null>(() => {
    if (!selectedTag.value) return null;
    const g = tagGroups.value.find((t) => t.name === selectedTag.value);
    return g && g.endpoints.length ? g.endpoints[0] : null;
  });

  /** 当前文档（来自 docStore） */
  const currentDoc = computed<IOpenAPIDocument | null>(() => docStore.doc);

  // ===== 路由 query 处理 =====
  // 进入页面时如果 ?url=xxx，自动填入并触发拉取
  watch(
    () => route.query?.url,
    (q) => {
      if (typeof q === "string" && q && isValidUrl(q)) {
        urlValue.value = q;
      }
    },
    { immediate: true },
  );

  // ===== URL 历史 / 收藏操作 =====
  function onUrlBlur() {
    const v = urlValue.value.trim();
    if (!isValidUrl(v)) return;
    urlHistory.value = [v, ...urlHistory.value.filter((x) => x !== v)].slice(
      0,
      20,
    );
    saveList(HISTORY_KEY, urlHistory.value);
  }

  function onUrlSelectChange(v: string) {
    if (!v) return;
    if (!isValidUrl(v)) return;
    if (urlHistory.value.includes(v)) return;
    urlHistory.value = [v, ...urlHistory.value].slice(0, 20);
    saveList(HISTORY_KEY, urlHistory.value);
  }

  function onUrlHistorySelect(cmd: string) {
    if (cmd === "__clear__") {
      urlHistory.value = [];
      saveList(HISTORY_KEY, []);
      return;
    }
    urlValue.value = cmd;
    // 选中历史后自动拉取（与原行为一致）
    void loadFromUrl(cmd);
  }

  function onUrlHistoryDel(h: string) {
    urlHistory.value = urlHistory.value.filter((x) => x !== h);
    saveList(HISTORY_KEY, urlHistory.value);
  }

  function toggleFavorite(url: string) {
    const v = (url ?? "").trim();
    if (!v) return;
    if (favorites.value.includes(v)) {
      favorites.value = favorites.value.filter((x) => x !== v);
      ElMessage.success("已取消收藏");
    } else {
      favorites.value = [v, ...favorites.value.filter((x) => x !== v)].slice(
        0,
        20,
      );
      ElMessage.success("已收藏");
    }
    saveList(FAV_KEY, favorites.value);
  }

  function isFavorite(url: string) {
    return favorites.value.includes(url);
  }

  // ===== 加载 / 解析 / 格式化 =====
  async function loadFromUrl(url?: string) {
    const u = url ?? urlValue.value;
    friendlyErrorMsg.value = "";
    const ok = await docStore.loadFromUrl(u);
    if (ok) {
      friendlyErrorMsg.value = "";
      const serviceUrl = docStore.sourceUrl;
      const diff = serviceUrl && docStore.doc
        ? updateEndpointSnapshot(serviceUrl, docStore.endpoints, docStore.doc)
        : null;
      newEndpointKeys.value = diff?.newKeys ?? [];
      missingEndpointKeys.value = diff?.missingKeys ?? [];
      missingEndpoints.value = diff?.missingEndpoints ?? [];
      comparedSnapshotKey.value = diff?.baselineKey ?? "";
      showOnlyNewEndpoints.value = newEndpointKeys.value.length > 0;
      showOnlyMissingEndpoints.value = !showOnlyNewEndpoints.value && missingEndpointKeys.value.length > 0;
      ElMessage.success(
        newEndpointKeys.value.length > 0
          ? `文档加载成功，发现 ${newEndpointKeys.value.length} 个新增接口`
          : missingEndpointKeys.value.length > 0
            ? `文档加载成功，发现 ${missingEndpointKeys.value.length} 个缺失接口`
          : "文档加载成功",
      );
    } else {
      friendlyErrorMsg.value = "文档加载失败，请检查地址后重试。";
      showFriendlyError(docStore.error || "加载失败", "加载 OpenAPI 文档", friendlyErrorMsg.value);
    }
    return ok;
  }

  /** 测试 Swagger 配置连接，并提取服务下拉列表。 */
  async function fetchCustomServices() {
    if (isFetchingCustomServices.value) return;
    isFetchingCustomServices.value = true;
    hasFetchedCustomServices.value = false;
    customServices.value = [];
    customServiceUrl.value = "";
    try {
      customServices.value = await fetchSwaggerServices(
        customDomain.value,
        customConfigPath.value,
      );
      hasFetchedCustomServices.value = true;
      if (customServices.value.length > 0) {
        customServiceUrl.value = customServices.value[0].url;
        ElMessage.success("连接成功，已获取接口文档服务。");
      }
    } catch (error) {
      hasFetchedCustomServices.value = true;
      recordError(error, "获取 Swagger 服务列表");
      ElMessage.error("连接失败，请检查域名和配置路径后重试。");
    } finally {
      isFetchingCustomServices.value = false;
    }
  }

  /** 使用自定义域名与所选服务路径加载对应的 OpenAPI 文档。 */
  async function loadCustomServiceDocument() {
    if (!customServiceUrl.value) return false;
    try {
      const url = buildSwaggerUrl(customDomain.value, customServiceUrl.value);
      urlValue.value = url;
      return await loadFromUrl(url);
    } catch (error) {
      recordError(error, "拼接 Swagger 服务地址");
      ElMessage.error("接口地址无效，请检查域名和服务路径后重试。");
      return false;
    }
  }

  /**
   * 解析 JSON 文档；仅本地文件导入传入 snapshotKey，以文件名追踪新增接口。
   * @param text 待解析的 OpenAPI JSON 文本。
   * @param sourceName 用于 JSON 历史显示的来源名称。
   * @param snapshotKey 本地文件的稳定对比键，未提供时不执行差异追踪。
   */
  function loadFromJson(
    text: string,
    sourceName?: string,
    snapshotKey?: string,
    /** 同名或同前缀历史文件的快照键，仅用于计算差异。 */
    baselineKey?: string,
  ) {
    friendlyErrorMsg.value = "";
    const ok = docStore.loadFromJson(text, snapshotKey ? sourceName : undefined);
    if (ok) {
      friendlyErrorMsg.value = "";
      const diff = snapshotKey && docStore.doc
        ? updateEndpointSnapshot(snapshotKey, docStore.endpoints, docStore.doc, baselineKey)
        : null;
      newEndpointKeys.value = diff?.newKeys ?? [];
      missingEndpointKeys.value = diff?.missingKeys ?? [];
      missingEndpoints.value = diff?.missingEndpoints ?? [];
      comparedSnapshotKey.value = diff?.baselineKey ?? "";
      showOnlyNewEndpoints.value = newEndpointKeys.value.length > 0;
      showOnlyMissingEndpoints.value = !showOnlyNewEndpoints.value && missingEndpointKeys.value.length > 0;
      recordJsonHistory(sourceName);
      ElMessage.success(
        newEndpointKeys.value.length > 0
          ? `JSON 解析成功，发现 ${newEndpointKeys.value.length} 个新增接口`
          : missingEndpointKeys.value.length > 0
            ? `JSON 解析成功，发现 ${missingEndpointKeys.value.length} 个缺失接口`
          : "JSON 解析成功",
      );
    } else {
      friendlyErrorMsg.value = "JSON 解析失败，请检查文档格式后重试。";
      showFriendlyError(docStore.error || "解析失败", "解析 OpenAPI JSON", friendlyErrorMsg.value);
    }
    return ok;
  }

  /** 记录成功解析的 JSON，并以规范化内容覆盖当天的重复记录。 */
  function recordJsonHistory(sourceName?: string) {
    const content = docStore.rawJson;
    if (!content || !docStore.doc) return;
    const now = new Date();
    const title =
      typeof docStore.doc.info?.title === "string" && docStore.doc.info.title.trim()
        ? docStore.doc.info.title.trim()
        : "默认模块";
    const item: JsonParseHistoryItem = {
      id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      content,
      updatedAt: now.toISOString(),
      title,
      sourceName: sourceName?.trim() || undefined,
      endpointCount: docStore.endpoints.length,
    };
    jsonHistory.value = [
      item,
      ...jsonHistory.value.filter((historyItem) => historyItem.content !== content),
    ].slice(0, JSON_HISTORY_LIMIT);
    saveJsonHistory(jsonHistory.value);
  }

  /** 点击历史记录后使用同一套校验和解析流程重新加载。 */
  function loadHistoryItem(item: JsonParseHistoryItem) {
    return loadFromJson(item.content, item.sourceName || item.title);
  }

  /** 删除一条 JSON 解析历史，并立即同步到本地存储。 */
  function deleteJsonHistoryItem(id: string) {
    jsonHistory.value = jsonHistory.value.filter((item) => item.id !== id);
    saveJsonHistory(jsonHistory.value);
  }

  /** 清空当天的全部 JSON 解析历史。 */
  function clearJsonHistory() {
    jsonHistory.value = [];
    saveJsonHistory(jsonHistory.value);
  }

  function prettyJson(text: string): string | null {
    try {
      const parsed = JSON.parse(text);
      return formatJson(parsed);
    } catch (e) {
      recordError(e, "格式化 OpenAPI JSON");
      ElMessage.error("JSON 格式不正确，请检查内容后重试。");
      return null;
    }
  }

  function refresh() {
    return loadFromUrl();
  }

  /** 清空全部（外部按钮触发） */
  function clearAll() {
    docStore.clear();
    ElMessage.success("已清空文档");
  }

  // ===== curl 复制 =====
  function buildCurl(ep: IEndpointInfo): string {
    const base =
      configStore.config.baseUrl ||
      (docStore.sourceUrl
        ? new URL(docStore.sourceUrl).origin
        : "https://your-host");
    const path = ep.path;
    const url = base.replace(/\/$/, "") + path;
    return `curl -X ${ep.method.toUpperCase()} '${url}'`;
  }

  function copyCurl(ep: IEndpointInfo) {
    const text = buildCurl(ep);
    // 注意：copyToClipboard 内部已 await writeText，不能再 fire-and-forget
    copyToClipboard(text, `已复制：${ep.method.toUpperCase()} ${ep.path}`);
  }

  function toggleTag(name: string) {
    expandedTags.value[name] = !expandedTags.value[name];
  }

  return {
    // 状态
    docStore,
    urlValue,
    presetUrls,
    isLoading: computed(() => docStore.loading),
    isParsing: computed(() => docStore.loading),
    hasError: computed(() => !!friendlyErrorMsg.value),
    errorMsg: computed(() => friendlyErrorMsg.value),
    activeTab,
    listCollapseAll,
    expandedTags,
    selectedTag,
    searchText,
    showOnlyMine,
    newEndpointKeys,
    missingEndpointKeys,
    missingEndpoints,
    comparedSnapshotKey,
    showOnlyNewEndpoints,
    showOnlyMissingEndpoints,
    highlightLines,
    tagGroups,
    selectedEndpoint,
    currentDoc,
    // URL 历史 / 收藏
    urlHistory,
    favorites,
    jsonHistory,
    onUrlBlur,
    onUrlSelectChange,
    onUrlHistorySelect,
    onUrlHistoryDel,
    toggleFavorite,
    isFavorite,
    // JSON 编辑
    tab,
    customDomain,
    customConfigPath,
    customServices,
    customServiceUrl,
    isFetchingCustomServices,
    hasFetchedCustomServices,
    prettyJson,
    loadHistoryItem,
    deleteJsonHistoryItem,
    clearJsonHistory,
    // 加载 / 解析
    loadFromUrl,
    fetchCustomServices,
    loadCustomServiceDocument,
    loadFromJson,
    refresh,
    copyCurl,
    clearAll,
    toggleTag,
  };
}
