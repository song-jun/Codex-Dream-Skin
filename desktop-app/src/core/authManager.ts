/**
 * 认证管理器（浏览器版，UI-agnostic）
 *
 * 与 CLI 版差异：
 * - 不再使用 inquirer，所有需要用户输入的步骤都通过 Promise 抛出，
 *   由 UI 层（ElMessageBox / ElForm 等）处理后回调
 * - Token 持久化：优先使用 localStorage（key: 'apiWorkbench.token'）
 * - 业务逻辑、登录加密、错误处理保持与 CLI 版一致
 */
import axios, { AxiosError } from 'axios';
import CryptoJS from 'crypto-js';
import type { IInvokeConfig, IUserInfo, IAuthResult, ILoginCredentials, ILoginResponse } from './types';
import { PWD_ENC_KEY, OAUTH_CLIENT_CREDENTIALS } from './env';

const TOKEN_STORAGE_KEY = 'apiWorkbench.invokeToken';

function encryptPassword(password: string, key: string): string {
  const keyBytes = CryptoJS.enc.Utf8.parse(key);
  return CryptoJS.AES.encrypt(password, keyBytes, {
    iv: keyBytes,
    mode: CryptoJS.mode.CFB,
    padding: CryptoJS.pad.NoPadding
  }).toString();
}

function readStoredToken(): string {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function writeStoredToken(token: string) {
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
      return { success: false, error: 'Token 不能为空' };
    }
    if (!this.authBaseUrl) {
      return { success: false, error: 'API 基础 URL 未配置' };
    }
    let cleanToken = token.trim();
    if (cleanToken.toLowerCase().startsWith('bearer ')) {
      cleanToken = cleanToken.substring(7).trim();
    }
    try {
      const url = `${this.authBaseUrl}${this.userInfoPath}`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${cleanToken}` },
        timeout: this.timeout
      });
      if (response.status === 200 && response.data) {
        const bizCode = response.data.code;
        if (bizCode !== undefined && bizCode !== 0) {
          const errorMsg = response.data.msg || response.data.message || '业务错误';
          return { success: false, error: errorMsg };
        }
        const userInfo = this.extractUserInfo(response.data);
        if (userInfo) {
          this.token = cleanToken;
          writeStoredToken(cleanToken);
          return { success: true, token: cleanToken, userInfo };
        }
      }
      return { success: false, error: '无法获取用户信息' };
    } catch (error) {
      return this.handleValidationError(error);
    }
  }

  /** 用用户名密码登录（UI 已收集好凭证） */
  async login(credentials: ILoginCredentials): Promise<ILoginResponse> {
    if (!this.authBaseUrl) {
      return { success: false, error: 'API 基础 URL 未配置' };
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

      const response = await axios.post(url, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${OAUTH_CLIENT_CREDENTIALS}`
        },
        timeout: this.timeout
      });

      if (response.status === 200 && response.data) {
        const bizCode = response.data.code;
        if (bizCode !== undefined && bizCode !== 0) {
          const errorMsg = response.data.msg || response.data.message || '登录失败';
          return { success: false, error: errorMsg };
        }
        const token = this.extractToken(response.data);
        if (token) {
          this.token = token;
          writeStoredToken(token);
          return { success: true, token };
        }
      }
      return { success: false, error: '登录失败，无法获取 Token' };
    } catch (error) {
      return this.handleLoginError(error);
    }
  }

  /** 登录 → 验证（一步到位），UI 只需调用此方法 */
  async loginAndValidate(credentials: ILoginCredentials): Promise<IAuthResult> {
    const loginRes = await this.login(credentials);
    if (!loginRes.success || !loginRes.token) {
      return { success: false, error: loginRes.error || '登录失败' };
    }
    return this.validateToken(loginRes.token);
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
        const s = e.response.status;
        if (s === 401) return { success: false, error: 'Token 无效或已过期' };
        if (s === 403) return { success: false, error: '权限不足' };
        if (s === 404) return { success: false, error: '用户信息接口不存在' };
        return { success: false, error: `服务器错误 (${s})` };
      }
      if (e.code === 'ECONNABORTED') return { success: false, error: '请求超时' };
      if (e.code === 'ECONNREFUSED') return { success: false, error: '无法连接服务器' };
      return { success: false, error: `网络错误: ${e.message}` };
    }
    return { success: false, error: `未知错误: ${String(error)}` };
  }

  private handleLoginError(error: unknown): ILoginResponse {
    if (axios.isAxiosError(error)) {
      const e = error as AxiosError;
      if (e.response) {
        const s = e.response.status;
        const data: any = e.response.data;
        const msg = data?.msg || data?.message || data?.error || data?.error_description;
        if (s === 400) return { success: false, error: msg || '请求参数错误' };
        if (s === 401) return { success: false, error: msg || '用户名或密码错误' };
        if (s === 403) return { success: false, error: msg || '账号被禁用或无权限' };
        if (s === 404) return { success: false, error: '登录接口不存在' };
        return { success: false, error: msg || `服务器错误 (${s})` };
      }
      if (e.code === 'ECONNABORTED') return { success: false, error: '请求超时' };
      if (e.code === 'ECONNREFUSED') return { success: false, error: '无法连接服务器' };
      return { success: false, error: `网络错误: ${e.message}` };
    }
    return { success: false, error: `未知错误: ${String(error)}` };
  }
}
