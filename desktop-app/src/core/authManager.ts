/**
 * 认证管理器（浏览器版，UI-agnostic）
 *
 * 与 CLI 版差异：
 * - 不再使用 inquirer，所有需要用户输入的步骤都通过 Promise 抛出，
 *   由 UI 层（ElMessageBox / ElForm 等）处理后回调
 * - Token 持久化：桌面端交给 Electron 安全存储，浏览器端使用 localStorage
 * - 业务逻辑、登录加密、错误处理保持与 CLI 版一致
 */
import axios, { AxiosError } from 'axios';
import CryptoJS from 'crypto-js';
import type { IInvokeConfig, IUserInfo, IAuthResult, ILoginCredentials, ILoginResponse } from './types';
import { PWD_ENC_KEY, OAUTH_CLIENT_CREDENTIALS } from './env';

const TOKEN_STORAGE_KEY = 'apiWorkbench.invokeToken';

/** 认证接口经主进程或开发代理转发后的响应。 */
interface IAuthHttpResponse {
  /** HTTP 状态码。 */
  status: number;
  /** 响应数据。 */
  data: unknown;
}

function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && typeof window.electronAPI?.loadToken === 'function';
}

function encryptPassword(password: string, key: string): string {
  const keyBytes = CryptoJS.enc.Utf8.parse(key);
  return CryptoJS.AES.encrypt(password, keyBytes, {
    iv: keyBytes,
    mode: CryptoJS.mode.CFB,
    padding: CryptoJS.pad.NoPadding
  }).toString();
}

function readStoredToken(): string {
  if (isDesktopRuntime()) return '';
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function writeStoredToken(token: string) {
  if (isDesktopRuntime()) return;
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* 忽略 */
  }
}

export class AuthManager {
  private token: string;
  private baseUrl: string;
  private authBaseUrl: string;
  private userInfoPath: string;
  private loginPath: string;
  private timeout: number;
  private pwdEncKey: string;

  constructor(config: IInvokeConfig) {
    this.token = config.invokeToken || readStoredToken();
    this.baseUrl = config.baseUrl || '';
    this.authBaseUrl = config.authBaseUrl || this.extractOrigin(config.baseUrl);
    this.userInfoPath = config.userInfoPath || '/admin/user/info';
    this.loginPath = config.loginPath || '/auth/oauth2/token';
    this.timeout = config.timeout || 30000;
    this.pwdEncKey = config.pwdEncKey || PWD_ENC_KEY;
  }

  private extractOrigin(url: string): string {
    if (!url) return '';
    try {
      return new URL(url).origin;
    } catch {
      const m = url.match(/^(https?:\/\/[^/]+)/);
      return m ? m[1] : url;
    }
  }

  private generateRandomStr(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /** 验证 Token 是否有效（用用户信息接口） */
  async validateToken(token: string): Promise<IAuthResult> {
    if (!token || !token.trim()) {
      return { success: false, error: 'Token 不能为空', invalidToken: true };
    }
    if (!this.authBaseUrl) {
      return { success: false, error: 'API 基础 URL 未配置', failureReason: 'configuration' };
    }
    let cleanToken = token.trim();
    if (cleanToken.toLowerCase().startsWith('bearer ')) {
      cleanToken = cleanToken.substring(7).trim();
    }
    try {
      const url = `${this.authBaseUrl}${this.userInfoPath}`;
      const response = await this.requestFromRuntime(url, 'GET', { Authorization: `Bearer ${cleanToken}` });
      if (response.status === 200 && response.data) {
        const data = typeof response.data === 'object' && response.data !== null && !Array.isArray(response.data)
          ? response.data as Record<string, unknown>
          : {};
        const bizCode = data.code;
        if (bizCode !== undefined && bizCode !== 0 && bizCode !== '0') {
          const errorMsg = this.getServerErrorMessage(data) || '业务错误';
          return {
            success: false,
            error: errorMsg,
            invalidToken: Number(bizCode) === 401,
            failureReason: Number(bizCode) === 401 ? 'credentials' : 'business'
          };
        }
        const userInfo = this.extractUserInfo(data);
        if (userInfo) {
          this.token = cleanToken;
          writeStoredToken(cleanToken);
          return { success: true, token: cleanToken, userInfo };
        }
      }
      if (response.status !== 200) return this.getValidationHttpError(response.status);
      return { success: false, error: '无法获取用户信息', failureReason: 'response' };
    } catch (error) {
      return this.handleValidationError(error);
    }
  }

  /** 用用户名密码登录（UI 已收集好凭证） */
  async login(credentials: ILoginCredentials): Promise<ILoginResponse> {
    if (!this.authBaseUrl) {
      return { success: false, error: 'API 基础 URL 未配置', failureReason: 'configuration' };
    }
    try {
      const url = `${this.authBaseUrl}${this.loginPath}`;
      const params = new URLSearchParams();
      // 实时读 PWD_ENC_KEY：reloadEnv 后立即生效，不依赖构造时的缓存
      const pwdEncKey = this.pwdEncKey || PWD_ENC_KEY;
      params.append('username', credentials.username);
      params.append('password', encryptPassword(credentials.password, pwdEncKey));
      params.append('code', '');
      params.append('randomStr', this.generateRandomStr());
      params.append('grant_type', 'password');
      params.append('scope', 'server');

      const response = await this.requestFromRuntime(url, 'POST', {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${OAUTH_CLIENT_CREDENTIALS}`
      }, params.toString());

      if (response.status === 200 && response.data) {
        const data = typeof response.data === 'object' && response.data !== null && !Array.isArray(response.data)
          ? response.data as Record<string, unknown>
          : {};
        const bizCode = data.code;
        if (bizCode !== undefined && bizCode !== 0 && bizCode !== '0') {
          const errorMsg = this.getServerErrorMessage(data) || '登录失败';
          return { success: false, error: errorMsg, failureReason: 'credentials' };
        }
        const token = this.extractToken(data);
        if (token) {
          this.token = token;
          writeStoredToken(token);
          return { success: true, token };
        }
      }
      if (response.status !== 200) return this.getLoginHttpError(response.status, response.data);
      return { success: false, error: '登录失败，无法获取 Token', failureReason: 'response' };
    } catch (error) {
      return this.handleLoginError(error);
    }
  }

  /** 登录 → 验证（一步到位），UI 只需调用此方法 */
  async loginAndValidate(credentials: ILoginCredentials): Promise<IAuthResult> {
    const loginRes = await this.login(credentials);
    if (!loginRes.success || !loginRes.token) {
      return {
        success: false,
        error: loginRes.error || '登录失败',
        failureReason: loginRes.failureReason
      };
    }
    const validationRes = await this.validateToken(loginRes.token);
    if (!validationRes.success && validationRes.invalidToken) {
      return {
        ...validationRes,
        invalidToken: false,
        failureReason: 'response'
      };
    }
    return validationRes;
  }

  getToken(): string {
    return this.token;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
    this.authBaseUrl = this.extractOrigin(url);
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getAuthBaseUrl(): string {
    return this.authBaseUrl;
  }

  /**
   * 在 Electron 主进程、浏览器开发代理或直接浏览器请求之间选择认证请求通道。
   * @param url 认证接口完整地址
   * @param method HTTP 请求方法
   * @param headers 请求头
   * @param body 可选请求体
   * @returns 统一的 HTTP 响应
   */
  private async requestFromRuntime(
    url: string,
    method: 'GET' | 'POST',
    headers: Record<string, string>,
    body?: string,
  ): Promise<IAuthHttpResponse> {
    const request = { url, method, headers, body, timeout: this.timeout };
    if (window.electronAPI?.requestApi) {
      const response = await window.electronAPI.requestApi(request);
      return { status: response.statusCode, data: response.data };
    }
    if (import.meta.env.DEV) {
      const response = await axios.post<unknown>('/api-proxy', request, {
        timeout: this.timeout,
        validateStatus: () => true,
      });
      return { status: response.status, data: response.data };
    }
    const response = await axios.request<unknown>({
      url,
      method,
      headers,
      data: body,
      timeout: this.timeout,
      validateStatus: () => true,
    });
    return { status: response.status, data: response.data };
  }

  /** 根据认证校验接口的 HTTP 状态生成标准结果。 */
  private getValidationHttpError(statusCode: number): IAuthResult {
    if (statusCode === 401) return { success: false, error: 'Token 无效或已过期', invalidToken: true, failureReason: 'credentials' };
    if (statusCode === 403) return { success: false, error: '权限不足', failureReason: 'forbidden' };
    if (statusCode === 404) return { success: false, error: '用户信息接口不存在', failureReason: 'endpoint' };
    return { success: false, error: `服务器错误 (${statusCode})`, failureReason: 'server' };
  }

  /** 从服务端响应中提取可记录的错误文本，不向界面直接暴露。 */
  private getServerErrorMessage(data: unknown): string | undefined {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
    const payload = data as Record<string, unknown>;
    for (const key of ['msg', 'message', 'error', 'error_description']) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
    return undefined;
  }

  /** 根据登录接口的 HTTP 状态生成标准结果，同时保留原始数据供错误记录使用。 */
  private getLoginHttpError(statusCode: number, data: unknown): ILoginResponse {
    const message = this.getServerErrorMessage(data);
    if (statusCode === 400) return { success: false, error: message || '请求参数错误', failureReason: 'credentials' };
    if (statusCode === 401) return { success: false, error: message || '用户名或密码错误', failureReason: 'credentials' };
    if (statusCode === 403) return { success: false, error: message || '账号被禁用或无权限', failureReason: 'forbidden' };
    if (statusCode === 404) return { success: false, error: '登录接口不存在', failureReason: 'endpoint' };
    return { success: false, error: message || `服务器错误 (${statusCode})`, failureReason: 'server' };
  }

  private extractUserInfo(data: any): IUserInfo | null {
    const sysUser = data.data?.sysUser;
    if (sysUser) {
      return {
        userId: String(sysUser.userId || sysUser.id || ''),
        name: String(sysUser.name || sysUser.nickName || sysUser.realName || ''),
        username: String(sysUser.username || sysUser.userName || sysUser.account || '')
      };
    }
    const userData = data.data || data;
    if (!userData) return null;
    const userId = userData.userId || userData.id || userData.user_id || '';
    const name = userData.name || userData.nickName || userData.nickname || userData.realName || '';
    const username = userData.username || userData.userName || userData.account || userData.loginName || '';
    if (!userId && !username) return null;
    return {
      userId: String(userId),
      name: String(name || username),
      username: String(username || userId)
    };
  }

  private extractToken(data: any): string | null {
    if (data.access_token) return String(data.access_token);
    if (data.token) return String(data.token);
    if (data.data?.token) return String(data.data.token);
    if (data.data?.access_token) return String(data.data.access_token);
    return null;
  }

  private handleValidationError(error: unknown): IAuthResult {
    if (axios.isAxiosError(error)) {
      const e = error as AxiosError;
      if (e.response) {
        return this.getValidationHttpError(e.response.status);
      }
      if (e.code === 'ECONNABORTED') return { success: false, error: '请求超时', failureReason: 'timeout' };
      if (e.code === 'ECONNREFUSED') return { success: false, error: '无法连接服务器', failureReason: 'unavailable' };
      return { success: false, error: `网络错误: ${e.message}`, failureReason: 'network' };
    }
    return { success: false, error: `未知错误: ${String(error)}`, failureReason: 'response' };
  }

  private handleLoginError(error: unknown): ILoginResponse {
    if (axios.isAxiosError(error)) {
      const e = error as AxiosError;
      if (e.response) {
        return this.getLoginHttpError(e.response.status, e.response.data);
      }
      if (e.code === 'ECONNABORTED') return { success: false, error: '请求超时', failureReason: 'timeout' };
      if (e.code === 'ECONNREFUSED') return { success: false, error: '无法连接服务器', failureReason: 'unavailable' };
      return { success: false, error: `网络错误: ${e.message}`, failureReason: 'network' };
    }
    return { success: false, error: `未知错误: ${String(error)}`, failureReason: 'response' };
  }
}
