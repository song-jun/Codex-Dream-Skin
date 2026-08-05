/**
 * 调用页面 composable
 *
 * 封装 Invoke 页面所有非视图逻辑：
 * - 认证状态（token / userInfo / 登录登出 / 自动校验）
 * - 接口列表（tag 分组 / 搜索过滤 / 选中）
 * - 参数编辑（从 OpenAPI 提取 → 表单值 → 构建 ParamEditResult）
 * - 调用执行（构造 ApiInvoker → 捕获响应/错误）
 *
 * 视图层只负责把状态绑定到组件、把交互透传给本 composable。
 */
import { ref, computed, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useConfigStore } from '@/stores/config';
import { useDocStore } from '@/stores/doc';
import type {
  IEndpointInfo,
  IInvokeResponse,
  IParamDisplayInfo,
  IUserInfo,
} from '@/core/types';
import { AuthManager } from '@/core/authManager';
import { ParamEditor } from '@/core/paramEditor';
import { ApiInvoker } from '@/core/invoker';
import { inferUrlPrefixFromApiUrl } from '@/core/env';
import { formatJson } from '@/utils/formatJson';

/** 结构化的"请求表单"快照（用于 RequestForm 组件展示/编辑） */
export interface IRequestForm {
  method: string;
  url: string;
  headers: Record<string, string>;
  params: Record<string, any>;
  body: Record<string, any>;
}

const TOKEN_STORAGE_KEY = 'apiWorkbench.invokeToken';

/** 读取已持久化的 Token（先 IPC，再 localStorage 兜底） */
async function readStoredToken(): Promise<string> {
  if (window.electronAPI?.loadToken) {
    try {
      return await window.electronAPI.loadToken();
    } catch {
      /* ignore */
    }
  }
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

/** 持久化/清理 Token（IPC + localStorage 同步） */
async function persistToken(token: string | null): Promise<void> {
  if (token) {
    if (window.electronAPI?.saveToken) {
      try {
        const result = await window.electronAPI.saveToken(token);
        if (!result.success) throw new Error(result.error || 'Token 保存失败');
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        return;
      } catch {
        throw new Error('Token 未能安全保存，请检查系统安全存储设置');
      }
    }
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      /* ignore */
    }
  } else {
    if (window.electronAPI?.clearToken) {
      try {
        await window.electronAPI.clearToken();
      } catch {
        /* ignore */
      }
    }
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function useInvoke() {
  const configStore = useConfigStore();
  const docStore = useDocStore();

  // ============ 认证状态 ============
  const token = ref('');
  const userInfo = ref<IUserInfo | null>(null);
  const showLoginDialog = ref(false);
  const loginTab = ref<'login' | 'token'>('login');
  const loginForm = ref({ username: '', password: '' });
  const tokenInput = ref('');
  const loginLoading = ref(false);
  let authManager: AuthManager | null = null;

  const isLoggedIn = computed(() => !!token.value);

  // ============ 接口选择 ============
  const searchText = ref('');
  const expandedTags = ref<Record<string, boolean>>({});
  const selectedEndpoint = ref<IEndpointInfo | null>(null);

  const tagGroups = computed(() => {
    const map = new Map<string, IEndpointInfo[]>();
    for (const ep of docStore.endpoints) {
      const key = ep.tag || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ep);
    }
    return Array.from(map.entries())
      .map(([name, endpoints]) => ({ name, endpoints }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  });

  const filteredTags = computed(() => {
    const q = searchText.value.trim().toLowerCase();
    if (!q) return tagGroups.value;
    return tagGroups.value
      .map((t) => ({
        name: t.name,
        endpoints: t.endpoints.filter(
          (e) =>
            e.summary.toLowerCase().includes(q) ||
            e.path.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q)
        )
      }))
      .filter((t) => t.endpoints.length > 0);
  });

  // 默认全部展开
  watch(
    () => tagGroups.value,
    (groups) => {
      groups.forEach((t) => {
        if (expandedTags.value[t.name] === undefined) expandedTags.value[t.name] = true;
      });
    },
    { immediate: true }
  );

  function toggleTag(name: string) {
    expandedTags.value[name] = !expandedTags.value[name];
  }

  // ============ 参数编辑 ============
  const paramList = ref<IParamDisplayInfo[]>([]);
  const formValues = ref<Record<string, any>>({});
  let paramEditor: ParamEditor | null = null;

  watch(
    selectedEndpoint,
    (ep) => {
      if (!ep || !docStore.doc) {
        paramList.value = [];
        formValues.value = {};
        paramEditor = null;
        return;
      }
      paramEditor = new ParamEditor(ep, docStore.doc);
      const params = paramEditor.extractParams();
      paramList.value = params;
      formValues.value = {};
      params.forEach((p) => {
        if (p.defaultValue !== undefined) {
          formValues.value[p.name] = p.defaultValue;
        }
      });
    }
  );

  function resetParams() {
    formValues.value = {};
    paramList.value.forEach((p) => {
      if (p.defaultValue !== undefined) formValues.value[p.name] = p.defaultValue;
    });
  }

  // ============ 调用结果 ============
  const isInvoking = ref(false);
  const response = ref<IInvokeResponse | null>(null);
  const error = ref('');

  const formattedResponse = computed(() => formatJson(response.value?.data));

  // ============ requestForm 派生 ============
  // 由 selectedEndpoint + formValues 自动聚合；RequestForm 用来回显当前 method/url/headers/params/body
  const requestForm = ref<IRequestForm>({
    method: '',
    url: '',
    headers: {},
    params: {},
    body: {}
  });

  watch(
    [selectedEndpoint, formValues, paramList],
    () => {
      const ep = selectedEndpoint.value;
      if (!ep) {
        requestForm.value = { method: '', url: '', headers: {}, params: {}, body: {} };
        return;
      }
      if (paramEditor) {
        const built = paramEditor.buildResult(formValues.value);
        requestForm.value = {
          method: ep.method,
          url: ep.path,
          headers: { 'Content-Type': 'application/json' },
          params: built.queryParams,
          body: built.bodyParams
        };
      } else {
        requestForm.value = {
          method: ep.method,
          url: ep.path,
          headers: {},
          params: {},
          body: {}
        };
      }
    },
    { immediate: true, deep: true }
  );

  // ============ helpers ============
  function parseResponse(r: IInvokeResponse | null): IInvokeResponse | null {
    // 透传保留：未来可在此做响应字段注释 / schema 校验
    return r;
  }

  // ============ 选接口 → 同步清空响应/参数 ============
  function selectEndpoint(ep: IEndpointInfo) {
    selectedEndpoint.value = ep;
    resetParams();
    response.value = null;
    error.value = '';
  }

  // ============ 基础 URL 解析（auth + 业务接口统一） ============
  function resolveBaseUrl(): string {
    if (configStore.config.baseUrl) return configStore.config.baseUrl.replace(/\/$/, '');
    let origin = '';
    let pathPrefix = '';
    if (docStore.sourceUrl) {
      try {
        const u = new URL(docStore.sourceUrl);
        origin = `${u.protocol}//${u.host}`;
        const inferred = inferUrlPrefixFromApiUrl(docStore.sourceUrl);
        if (inferred) pathPrefix = inferred;
      } catch {
        /* ignore */
      }
    }
    if (configStore.config.urlPrefix) pathPrefix = configStore.config.urlPrefix;
    if (pathPrefix && !pathPrefix.startsWith('/')) pathPrefix = '/' + pathPrefix;
    if (pathPrefix) pathPrefix = pathPrefix.replace(/\/+$/, '');
    return origin + pathPrefix;
  }

  async function initAuth() {
    const baseUrl = resolveBaseUrl();
    const cfg = {
      ...configStore.config,
      baseUrl,
      invokeToken: token.value
    };
    authManager = new AuthManager(cfg);
  }

  async function tryAutoValidate() {
    if (!authManager) return;
    const res = await authManager.validateToken(token.value);
    if (res.success) {
      userInfo.value = res.userInfo || null;
      ElMessage.success(`Token 有效，当前用户：${res.userInfo?.name || res.userInfo?.username}`);
    } else {
      ElMessage.warning('已保存的 Token 无效，请重新登录');
      token.value = '';
      userInfo.value = null;
    }
  }

  /**
   * 页面挂载时调用：加载本地 Token、初始化 AuthManager、自动校验
   */
  async function init() {
    configStore.load();
    const stored = await readStoredToken();
    if (stored) {
      token.value = stored;
      await initAuth();
      await tryAutoValidate();
    }
  }

  // ============ 登录 / 登出 ============
  async function login() {
    if (!authManager) await initAuth();
    if (!authManager) return;
    loginLoading.value = true;
    try {
      let res;
      if (loginTab.value === 'login') {
        if (!loginForm.value.username || !loginForm.value.password) {
          ElMessage.warning('请输入用户名和密码');
          return;
        }
        res = await authManager.loginAndValidate({
          username: loginForm.value.username,
          password: loginForm.value.password
        });
      } else {
        if (!tokenInput.value) {
          ElMessage.warning('请输入 Token');
          return;
        }
        res = await authManager.validateToken(tokenInput.value);
      }
      if (res.success && res.token) {
        token.value = res.token;
        userInfo.value = res.userInfo || null;
        await persistToken(res.token);
        showLoginDialog.value = false;
        loginForm.value = { username: '', password: '' };
        tokenInput.value = '';
        ElMessage.success('登录成功');
      } else {
        ElMessage.error(res.error || '登录失败');
      }
    } finally {
      loginLoading.value = false;
    }
  }

  async function logout() {
    try {
      await ElMessageBox.confirm('确认退出登录？', '提示', { type: 'warning' });
    } catch {
      return;
    }
    token.value = '';
    userInfo.value = null;
    await persistToken(null);
    authManager = null;
    ElMessage.success('已退出登录');
  }

  // ============ 调用 ============
  async function invoke() {
    if (!selectedEndpoint.value || !docStore.doc || !authManager) return;
    if (!paramEditor) return;
    // 校验必填
    const missing = paramList.value.filter(
      (p) => p.required && (formValues.value[p.name] === undefined || formValues.value[p.name] === '')
    );
    if (missing.length > 0) {
      ElMessage.warning(`必填参数未填写：${missing.map((m) => m.name).join(', ')}`);
      return;
    }
    isInvoking.value = true;
    error.value = '';
    try {
      const params = paramEditor.buildResult(formValues.value);
      const invoker = new ApiInvoker(
        authManager.getBaseUrl(),
        authManager.getToken(),
        configStore.config.timeout,
        docStore.doc
      );
      const res = await invoker.invoke(selectedEndpoint.value, params);
      response.value = res;
      if (res.success) {
        ElMessage.success(`请求成功 (${res.responseTime}ms)`);
      } else {
        error.value = res.error || '请求失败';
        ElMessage.error(error.value);
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      ElMessage.error(error.value);
    } finally {
      isInvoking.value = false;
    }
  }

  return {
    // 规范要求
    configStore,
    isLoggedIn,
    isInvoking,
    requestForm,
    response,
    error,
    invoke,
    login,
    logout,
    parseResponse,

    // 视图依赖的内部状态
    docStore,
    // 认证
    token,
    userInfo,
    showLoginDialog,
    loginTab,
    loginForm,
    tokenInput,
    loginLoading,
    // 接口选择
    searchText,
    expandedTags,
    selectedEndpoint,
    tagGroups,
    filteredTags,
    toggleTag,
    selectEndpoint,
    // 参数
    paramList,
    formValues,
    resetParams,
    // 调用
    formattedResponse,

    // 生命周期
    init
  };
}
