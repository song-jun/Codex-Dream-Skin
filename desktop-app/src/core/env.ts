/**
 * 环境配置（浏览器/Electron 渲染进程版）
 *
 * 优先级：window.__RUNTIME_ENV__（由主进程 IPC 注入，可热更新）
 *        > import.meta.env（Vite 构建时从 .env 注入的 VITE_* 变量）
 *        > DEFAULTS（兜底）
 *
 * 关键点：
 * - 浏览器没有 process.env；这里只能通过 Vite 构建时变量或主进程 IPC 拿到配置
 * - 建议把 OPENAPI_* 变量在 .env 中改名为 VITE_OPENAPI_*，Vite 会自动注入
 * - 也可由主进程在启动时读取 .env 并通过 IPC 注入到 window.__RUNTIME_ENV__
 */
import type { IInvokeConfig } from './types';

const DEFAULTS = {
  PWD_ENC_KEY: 'xINC5ZFr35lBcvYv',
  OAUTH_CLIENT_ID: 'cqmyg',
  OAUTH_CLIENT_SECRET: 'project-unity',
  USER_INFO_PATH: '/admin/user/info',
  LOGIN_PATH: '/auth/oauth2/token',
  DEFAULT_URL_PREFIX: '/platform',
  DEFAULT_API_URL: [
    'http://grfd2e2a-9999-default.10.40.92.161.nip.io/platform/v3/api-docs',
    'http://127.0.0.1:4523/export/openapi/5?version=3.0'
  ],
  FETCH_TIMEOUT: 30000,
  INVOKE_TIMEOUT: 30000,
  DEFAULT_CONFIG_TIMEOUT: 30000,
  RESPONSE_TRUNCATE_THRESHOLD: 10000
} as const;

/** 统一取值：先看运行时注入（主进程 IPC / localStorage），再看 Vite 注入，最后默认值
 * 兼容两种 key 命名：传入 VITE_OPENAPI_X 时也查 OPENAPI_X，反之亦然
 * （.env 既支持 OPENAPI_* 也支持 VITE_OPENAPI_*；Vite 注入的 key 名取决于 envPrefix 配置）
 */
function getStr(name: string, fallback: string): string {
  const w: any = typeof window !== 'undefined' ? window : {};
  const altName = name.startsWith('VITE_') ? name.replace(/^VITE_/, '') : 'VITE_' + name;
  const runtime = w.__RUNTIME_ENV__?.[name] ?? w.__RUNTIME_ENV__?.[altName];
  if (runtime && String(runtime).length > 0) return String(runtime);
  const build = (import.meta as any).env?.[name] ?? (import.meta as any).env?.[altName];
  if (build && String(build).length > 0) return String(build);
  return fallback;
}

function getInt(name: string, fallback: number): number {
  const v = getStr(name, '');
  if (v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 注意：以下导出全部用 `let`（非 `const`），依赖 ES Module 的 live binding，
 * 配合 `reloadEnv()` 可在运行时刷新所有 env 值，无需刷新页面。
 * 调用方代码（PWD_ENC_KEY / OAUTH_CLIENT_ID 等）保持不变。
 */
export let PWD_ENC_KEY = getStr('VITE_OPENAPI_PWD_ENC_KEY', DEFAULTS.PWD_ENC_KEY);

/** OAuth2 客户端 ID */
export let OAUTH_CLIENT_ID = getStr('VITE_OPENAPI_OAUTH_CLIENT_ID', DEFAULTS.OAUTH_CLIENT_ID);

/** OAuth2 客户端密钥 */
export let OAUTH_CLIENT_SECRET = getStr('VITE_OPENAPI_OAUTH_CLIENT_SECRET', DEFAULTS.OAUTH_CLIENT_SECRET);

/** OAuth2 客户端凭证（Base64） */
export let OAUTH_CLIENT_CREDENTIALS = btoa(`${OAUTH_CLIENT_ID}:${OAUTH_CLIENT_SECRET}`);

/** 用户信息接口路径 */
export let USER_INFO_PATH = getStr('VITE_OPENAPI_USER_INFO_PATH', DEFAULTS.USER_INFO_PATH);

/** 登录接口路径 */
export let LOGIN_PATH = getStr('VITE_OPENAPI_LOGIN_PATH', DEFAULTS.LOGIN_PATH);

/** 默认 URL 前缀（生成模式用） */
export let DEFAULT_URL_PREFIX = getStr('VITE_OPENAPI_URL_PREFIX', DEFAULTS.DEFAULT_URL_PREFIX);

/** 默认 API 文档地址（多值，逗号分隔） */
export let DEFAULT_API_URL: string[] = (() => {
  const raw = getStr('VITE_OPENAPI_DEFAULT_API_URL', '');
  if (raw) return raw.split(',').map((s) => s.trim()).filter(Boolean);
  return [...DEFAULTS.DEFAULT_API_URL];
})();

/** 文档获取超时 */
export let FETCH_TIMEOUT = getInt('VITE_OPENAPI_FETCH_TIMEOUT', DEFAULTS.FETCH_TIMEOUT);

/** 接口调用超时 */
export let INVOKE_TIMEOUT = getInt('VITE_OPENAPI_INVOKE_TIMEOUT', DEFAULTS.INVOKE_TIMEOUT);

/** 配置默认超时 */
export let DEFAULT_CONFIG_TIMEOUT = getInt('VITE_OPENAPI_CONFIG_TIMEOUT', DEFAULTS.DEFAULT_CONFIG_TIMEOUT);

/** 响应截断阈值 */
export let RESPONSE_TRUNCATE_THRESHOLD = getInt('VITE_OPENAPI_RESPONSE_TRUNCATE_THRESHOLD', DEFAULTS.RESPONSE_TRUNCATE_THRESHOLD);

/**
 * 重新求值所有 env 变量（依赖 ES Module live binding 自动同步到 import 端）
 * 调用方：SettingsDialog 保存 / 重置环境变量后
 * 同时派发 'apiworkbench:env-changed' 事件，让 DocViewer 等响应式组件能强制刷新
 */
export function reloadEnv(): void {
  PWD_ENC_KEY = getStr('VITE_OPENAPI_PWD_ENC_KEY', DEFAULTS.PWD_ENC_KEY);
  OAUTH_CLIENT_ID = getStr('VITE_OPENAPI_OAUTH_CLIENT_ID', DEFAULTS.OAUTH_CLIENT_ID);
  OAUTH_CLIENT_SECRET = getStr('VITE_OPENAPI_OAUTH_CLIENT_SECRET', DEFAULTS.OAUTH_CLIENT_SECRET);
  OAUTH_CLIENT_CREDENTIALS = btoa(`${OAUTH_CLIENT_ID}:${OAUTH_CLIENT_SECRET}`);
  USER_INFO_PATH = getStr('VITE_OPENAPI_USER_INFO_PATH', DEFAULTS.USER_INFO_PATH);
  LOGIN_PATH = getStr('VITE_OPENAPI_LOGIN_PATH', DEFAULTS.LOGIN_PATH);
  DEFAULT_URL_PREFIX = getStr('VITE_OPENAPI_URL_PREFIX', DEFAULTS.DEFAULT_URL_PREFIX);
  const raw = getStr('VITE_OPENAPI_DEFAULT_API_URL', '');
  DEFAULT_API_URL = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [...DEFAULTS.DEFAULT_API_URL];
  FETCH_TIMEOUT = getInt('VITE_OPENAPI_FETCH_TIMEOUT', DEFAULTS.FETCH_TIMEOUT);
  INVOKE_TIMEOUT = getInt('VITE_OPENAPI_INVOKE_TIMEOUT', DEFAULTS.INVOKE_TIMEOUT);
  DEFAULT_CONFIG_TIMEOUT = getInt('VITE_OPENAPI_CONFIG_TIMEOUT', DEFAULTS.DEFAULT_CONFIG_TIMEOUT);
  RESPONSE_TRUNCATE_THRESHOLD = getInt('VITE_OPENAPI_RESPONSE_TRUNCATE_THRESHOLD', DEFAULTS.RESPONSE_TRUNCATE_THRESHOLD);
  // 通知响应式组件：env 已变
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('apiworkbench:env-changed'));
  }
}

/** OpenAPI 文档路径后缀（用于推断业务前缀） */
export const DOC_PATH_SUFFIXES = [
  '/v3/api-docs', '/v2/api-docs', '/v3/api-docs/swagger-config',
  '/swagger/v1/swagger.json', '/swagger/v2/swagger.json', '/swagger-resources',
  '/doc.html', '/api-docs', '/apidocs', '/swagger.json', '/openapi.json'
] as const;

const DOC_PATH_SEGMENT_KEYWORDS: ReadonlySet<string> = new Set([
  'openapi', 'swagger', 'api-docs', 'apidocs', 'doc.html', 'swagger-config', 'swagger-resources'
]);

function containsDocPathSegment(path: string): boolean {
  if (!path) return false;
  const segs = path.toLowerCase().split('/').filter(Boolean);
  return segs.some((s) => DOC_PATH_SEGMENT_KEYWORDS.has(s));
}

export function inferUrlPrefixFromApiUrl(apiUrl: string): string | null {
  if (!apiUrl) return null;
  let pathname = '';
  try {
    const u = new URL(apiUrl);
    pathname = u.pathname || '';
  } catch {
    return null;
  }
  if (!pathname) return null;
  pathname = pathname.replace(/\/+$/, '');
  for (const s of DOC_PATH_SUFFIXES) {
    if (pathname.endsWith(s)) {
      pathname = pathname.slice(0, -s.length);
      break;
    }
  }
  pathname = pathname.replace(/\/+$/, '');
  if (!pathname || pathname === '/') return null;
  if (containsDocPathSegment(pathname)) return null;
  if (!pathname.startsWith('/')) pathname = '/' + pathname;
  return pathname;
}

/** 默认调用模式配置（供 invoke 页读取）
 * 注意：返回的是新对象，调用方读取的就是实时值（不是模块加载时的快照）
 */
export function getDefaultInvokeConfig(): IInvokeConfig {
  return {
    invokeToken: '',
    baseUrl: '',
    urlPrefix: '',
    timeout: DEFAULT_CONFIG_TIMEOUT,
    userInfoPath: USER_INFO_PATH,
    loginPath: LOGIN_PATH,
    authBaseUrl: '',
    pwdEncKey: PWD_ENC_KEY
  };
}
