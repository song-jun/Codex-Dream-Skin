/** OpenAPI 文档刷新后的新增接口识别与本地基线持久化。 */
import type { IEndpointInfo, IOpenAPIDocument } from "@/core/types";

/** 用于在后续文档中展示缺失接口的最小接口快照。 */
interface EndpointSnapshotItem {
  key: string;
  path: string;
  method: string;
  tag: string;
  summary: string;
  endpoint?: IEndpointInfo;
}

/** 单个服务已成功加载过的接口快照及其最近更新时间。 */
interface EndpointSnapshotEntry {
  updatedAt: string;
  endpoints: EndpointSnapshotItem[];
  document?: IOpenAPIDocument;
  /** 本次快照实际用于对比的上一份快照键。 */
  previousSnapshotKey?: string;
}

/** 按服务地址保存的接口快照集合。 */
interface EndpointSnapshotStore {
  [serviceUrl: string]: EndpointSnapshotEntry;
}

/** 接口快照管理页使用的摘要信息。 */
export interface EndpointSnapshotRecord {
  key: string;
  endpointCount: number;
  updatedAt: string;
  hasDocument: boolean;
  /** 快照列表展示的上一份对比快照键。 */
  previousSnapshotKey?: string;
}

/** 当前文档相对上次成功加载版本的接口差异。 */
export interface EndpointDiff {
  newKeys: string[];
  missingKeys: string[];
  missingEndpoints: IEndpointInfo[];
  baselineKey: string;
}

/** 没有可复用基线时使用的空差异，防止界面延续上一份文件的筛选状态。 */
const ENDPOINT_SNAPSHOT_STORAGE_KEY = "apiWorkbench.endpointSnapshots";
const ENDPOINT_SNAPSHOT_SERVICE_LIMIT = 30;
const FILE_SNAPSHOT_PREFIX = "file:";
const CHINESE_CHARACTER_PATTERN = /[\u3400-\u9fff]/u;

/**
 * 去除文件扩展名，避免所有 JSON 文件仅因共同的 .json 后缀被视为同一来源。
 * @param fileName 用户选择的文件名。
 * @returns 用于文件名前缀比较的名称主体。
 */
function getFileNameStem(fileName: string): string {
  return fileName.trim().replace(/\.[^.]+$/, "");
}

/**
 * 判断两个本地 JSON 文件是否具有足以复用接口基线的同名前缀。
 * 仅比较文件名开头：连续两个中文字符，或连续四个非中文字符才算匹配。
 * @param leftFileName 当前选择的文件名。
 * @param rightFileName 已保存基线对应的文件名。
 * @returns 是否应作为同一份接口文档进行新增接口比较。
 */
export function hasComparableFileNamePrefix(
  leftFileName: string,
  rightFileName: string,
): boolean {
  const left = getFileNameStem(leftFileName);
  const right = getFileNameStem(rightFileName);
  const sharedCharacters: string[] = [];

  for (const [index, character] of Array.from(left).entries()) {
    if (character !== Array.from(right)[index]) break;
    sharedCharacters.push(character);
  }

  const firstCharacter = sharedCharacters[0];
  if (!firstCharacter) return false;

  const requiredLength = CHINESE_CHARACTER_PATTERN.test(firstCharacter) ? 2 : 4;
  return sharedCharacters.length >= requiredLength;
}

/** 生成不受标题或标签变更影响的接口唯一标识。 */
export function getEndpointKey(endpoint: IEndpointInfo): string {
  return `${endpoint.method.toUpperCase()}\u0000${endpoint.path}`;
}

/**
 * 将新旧快照格式统一转换为可展示的接口快照。
 * @param value localStorage 中保存的单条快照数据。
 * @returns 合法快照；旧版仅保存键时使用空的标签和摘要兼容展示。
 */
function parseSnapshotItem(value: unknown): EndpointSnapshotItem | null {
  if (typeof value === "string") {
    const [method, path] = value.split("\u0000");
    return method && path ? { key: value, method, path, tag: "", summary: "" } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<EndpointSnapshotItem>;
  if (
    typeof item.key !== "string" ||
    typeof item.path !== "string" ||
    typeof item.method !== "string" ||
    typeof item.tag !== "string" ||
    typeof item.summary !== "string" ||
    (item.endpoint !== undefined && !isValidSnapshotEndpoint(item.endpoint, item))
  ) {
    return null;
  }
  if (item.key !== `${item.method.toUpperCase()}\u0000${item.path}`) return null;
  return item as EndpointSnapshotItem;
}

/**
 * 校验 localStorage 恢复的接口定义是否满足代码生成所需的最小结构。
 * @param value 缓存中的接口定义。
 * @param item 同条快照的展示字段，用于阻止键与接口内容不一致的篡改数据。
 * @returns 是否可以安全作为缺失接口参与代码生成。
 */
function isValidSnapshotEndpoint(value: unknown, item: Partial<EndpointSnapshotItem>): value is IEndpointInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const endpoint = value as Partial<IEndpointInfo>;
  return endpoint.path === item.path &&
    endpoint.method === item.method &&
    endpoint.tag === item.tag &&
    endpoint.summary === item.summary &&
    typeof endpoint.operationId === "string" &&
    Array.isArray(endpoint.parameters) &&
    !!endpoint.response &&
    typeof endpoint.response === "object" &&
    !Array.isArray(endpoint.response) &&
    (endpoint.requestBody === undefined ||
      (!!endpoint.requestBody && typeof endpoint.requestBody === "object" && !Array.isArray(endpoint.requestBody)));
}

/**
 * 将新旧两种 localStorage 快照格式统一为带时间的条目。
 * @param value 缓存中的服务快照；旧格式直接为接口数组。
 * @returns 合法的快照条目；任一接口损坏时丢弃整条基线，避免生成错误差异。
 */
function parseSnapshotEntry(value: unknown): EndpointSnapshotEntry | null {
  const rawEndpoints = Array.isArray(value)
    ? value
    : value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<EndpointSnapshotEntry>).endpoints
      : undefined;
  if (!Array.isArray(rawEndpoints)) return null;

  const endpoints = rawEndpoints.map(parseSnapshotItem).filter((item): item is EndpointSnapshotItem => !!item);
  if (endpoints.length !== rawEndpoints.length) return null;

  const updatedAt = !Array.isArray(value) && value && typeof value === "object"
    ? (value as Partial<EndpointSnapshotEntry>).updatedAt
    : "";
  const document = !Array.isArray(value) && value && typeof value === "object"
    ? (value as Partial<EndpointSnapshotEntry>).document
    : undefined;
  const previousSnapshotKey = !Array.isArray(value) && value && typeof value === "object"
    ? (value as Partial<EndpointSnapshotEntry>).previousSnapshotKey
    : undefined;
  return {
    updatedAt: typeof updatedAt === "string" && !Number.isNaN(Date.parse(updatedAt)) ? updatedAt : "",
    endpoints,
    ...(isValidSnapshotDocument(document) ? { document } : {}),
    ...(typeof previousSnapshotKey === "string" && previousSnapshotKey ? { previousSnapshotKey } : {}),
  };
}

/**
 * 校验快照中的完整 OpenAPI 文档，避免缓存数据直接覆盖当前工作区。
 * @param value localStorage 恢复的文档数据。
 * @returns 是否满足工作区恢复的最小 OpenAPI 3 文档结构。
 */
function isValidSnapshotDocument(value: unknown): value is IOpenAPIDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const document = value as Partial<IOpenAPIDocument>;
  return typeof document.openapi === "string" &&
    document.openapi.startsWith("3.") &&
    !!document.info &&
    typeof document.info === "object" &&
    typeof document.info.title === "string" &&
    !!document.paths &&
    typeof document.paths === "object" &&
    !Array.isArray(document.paths);
}

/**
 * 将当前接口转为可持久化的差异快照。
 * @param endpoint 当前 OpenAPI 文档中的接口。
 * @returns 不含请求与响应详情的轻量快照。
 */
function toSnapshotItem(endpoint: IEndpointInfo): EndpointSnapshotItem {
  return {
    key: getEndpointKey(endpoint),
    path: endpoint.path,
    method: endpoint.method,
    tag: endpoint.tag,
    summary: endpoint.summary,
    endpoint,
  };
}

/**
 * 将缺失快照恢复为只读展示用接口，避免它参与代码生成。
 * @param item 上次文档保存的接口快照。
 * @returns 可复用现有接口列表组件的最小接口对象。
 */
function toMissingEndpoint(item: EndpointSnapshotItem): IEndpointInfo {
  if (item.endpoint) return item.endpoint;
  return {
    path: item.path,
    method: item.method,
    tag: item.tag,
    summary: item.summary,
    operationId: "",
    parameters: [],
    response: {},
  };
}

/** 从本地存储读取已加载服务的接口基线，忽略不符合格式的数据。 */
function loadEndpointSnapshots(): EndpointSnapshotStore {
  try {
    const raw = localStorage.getItem(ENDPOINT_SNAPSHOT_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([serviceUrl, value]) => {
      const entry = parseSnapshotEntry(value);
      return entry ? [[serviceUrl, entry]] : [];
    }));
  } catch {
    return {};
  }
}

/** 保存最近使用服务的接口基线，存储不可用时仅影响跨刷新对比。 */
function saveEndpointSnapshots(snapshots: EndpointSnapshotStore): void {
  try {
    localStorage.setItem(ENDPOINT_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshots));
  } catch {
    /* 本地存储不可用时保留本次会话中的对比结果。 */
  }
}

/**
 * 获取当前已保存的接口对比基线摘要。
 * @returns 按最近使用顺序排列的快照列表。
 */
export function listEndpointSnapshots(): EndpointSnapshotRecord[] {
  return Object.entries(loadEndpointSnapshots())
    .map(([key, entry]) => ({
      key,
      endpointCount: entry.endpoints.length,
      updatedAt: entry.updatedAt,
      hasDocument: !!entry.document,
      previousSnapshotKey: entry.previousSnapshotKey,
    }))
    .sort((left, right) => getSnapshotTimestamp(right.updatedAt) - getSnapshotTimestamp(left.updatedAt));
}

/** 将可选更新时间转换为排序用的毫秒时间戳。 */
function getSnapshotTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

/**
 * 删除一份接口对比基线。
 * @param key 要删除的快照键。
 */
export function removeEndpointSnapshot(key: string): void {
  const snapshots = loadEndpointSnapshots();
  delete snapshots[key];
  saveEndpointSnapshots(snapshots);
}

/** 清空全部接口对比基线。 */
export function clearEndpointSnapshots(): void {
  saveEndpointSnapshots({});
}

/**
 * 读取快照对应的完整 OpenAPI 文档，用于恢复到代码生成工作区。
 * @param key 快照唯一键。
 * @returns 完整文档；旧版仅有接口差异的快照返回 null。
 */
export function getEndpointSnapshotDocument(key: string): IOpenAPIDocument | null {
  return loadEndpointSnapshots()[key]?.document ?? null;
}

/**
 * 写入本次成功加载的接口基线，并返回相对上次加载新增的接口标识。
 * @param serviceUrl 当前接口文档的完整地址。
 * @param endpoints 本次文档中解析出的接口。
 * @param document 本次成功解析的完整 OpenAPI 文档，用于快照恢复与代码生成。
 * @returns 当前文档相对上次成功加载版本的新增和缺失接口。
 */
export function updateEndpointSnapshot(
  serviceUrl: string,
  endpoints: IEndpointInfo[],
  document?: IOpenAPIDocument,
  /** 本地相近文件的历史快照键；仅用于比较，最终仍以当前地址写入。 */
  baselineKey?: string,
): EndpointDiff {
  const snapshots = loadEndpointSnapshots();
  const resolvedBaselineKey = baselineKey && snapshots[baselineKey] ? baselineKey : serviceUrl;
  const previous = snapshots[resolvedBaselineKey];
  const currentByKey = new Map<string, EndpointSnapshotItem>();
  for (const endpoint of endpoints) {
    const snapshot = toSnapshotItem(endpoint);
    currentByKey.set(snapshot.key, snapshot);
  }
  const previousByKey = new Map(previous?.endpoints.map((item) => [item.key, item]));
  const newKeys: string[] = [];
  if (previous) {
    for (const key of currentByKey.keys()) {
      if (!previousByKey.has(key)) newKeys.push(key);
    }
  }
  const missingItems: EndpointSnapshotItem[] = [];
  for (const [key, item] of previousByKey) {
    if (!currentByKey.has(key)) missingItems.push(item);
  }
  const retainedEntries = Object.entries(snapshots)
    .filter(([url]) => url !== serviceUrl && url !== resolvedBaselineKey)
    .slice(0, ENDPOINT_SNAPSHOT_SERVICE_LIMIT - 1);

  saveEndpointSnapshots({
    [serviceUrl]: {
      updatedAt: new Date().toISOString(),
      endpoints: [...currentByKey.values()],
      ...(document ? { document } : {}),
      ...(previous ? { previousSnapshotKey: resolvedBaselineKey } : {}),
    },
    ...Object.fromEntries(retainedEntries),
  });
  return {
    newKeys,
    missingKeys: missingItems.map((item) => item.key),
    missingEndpoints: missingItems.map(toMissingEndpoint),
    // 首次导入没有历史差异，但已建立可追溯的初始快照，界面也应显示其基线来源。
    baselineKey: previous ? resolvedBaselineKey : "",
  };
}


/**
 * 为本地 JSON 文件获取稳定的接口基线键。
 * 按文件名开头的受限同名前缀复用最近保存的文件基线。
 * 快照写入时会被置于存储首位，因此不能让同名的历史快照抢占刚导入的版本。
 * @param fileName 当前选择的 JSON 文件名。
 * @returns 可传入 updateEndpointSnapshot 的本地文件基线键。
 */
export function getFileEndpointSnapshotKey(fileName: string): string {
  return `${FILE_SNAPSHOT_PREFIX}${fileName}`;
}

/**
 * 查找本地 JSON 文件可复用的历史差异基线。
 * 同名文件优先；未命中时才按受限同名前缀匹配最近快照。
 * @param fileName 当前选择的 JSON 文件名。
 * @returns 历史快照键；没有匹配项时为空字符串。
 */
export function findFileEndpointSnapshotBaselineKey(fileName: string): string {
  const exactKey = getFileEndpointSnapshotKey(fileName);
  const snapshots = loadEndpointSnapshots();
  if (snapshots[exactKey]) return exactKey;
  const comparableKey = Object.keys(snapshots).find((key) => {
    if (!key.startsWith(FILE_SNAPSHOT_PREFIX)) return false;
    return hasComparableFileNamePrefix(fileName, key.slice(FILE_SNAPSHOT_PREFIX.length));
  });
  return comparableKey || "";
}
