/**
 * OpenAPI 文档获取器
 * 负责从远程 URL 获取 OpenAPI 文档
 */

import axios, { AxiosError } from 'axios';
import { IFetchResult, IOpenAPIDocument } from './types';
import { FETCH_TIMEOUT } from './env';

const MAX_OPENAPI_DOCUMENT_BYTES = 10 * 1024 * 1024;

function validateDocumentUrl(value: string): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('OpenAPI 地址只支持 http 或 https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('OpenAPI 地址不允许携带账号密码');
  }
  return parsed.toString();
}

// 注意：不要把 FETCH_TIMEOUT 缓存到 const（否则 reloadEnv 后不生效）

/**
 * 验证 OpenAPI 文档格式
 * 检查数据是否为有效的 OpenAPI 3.0 格式
 * @param data 待验证的数据
 * @returns 是否为有效的 OpenAPI 文档
 */
export function validateOpenAPIDocument(data: unknown): data is IOpenAPIDocument {
  if (data === null || typeof data !== 'object') {
    return false;
  }

  const doc = data as Record<string, unknown>;

  // 检查 openapi 版本字段
  if (typeof doc.openapi !== 'string' || !doc.openapi.startsWith('3.')) {
    return false;
  }

  // 检查 info 对象
  if (doc.info === null || typeof doc.info !== 'object') {
    return false;
  }

  const info = doc.info as Record<string, unknown>;
  if (typeof info.title !== 'string') {
    return false;
  }

  // 检查 paths 对象
  if (doc.paths === null || typeof doc.paths !== 'object') {
    return false;
  }

  return true;
}

/**
 * 获取 OpenAPI 文档
 * @param url OpenAPI 文档的 URL 地址
 * @returns 获取结果，包含成功状态、文档数据或错误信息
 */
export async function fetchOpenAPIDocument(url: string): Promise<IFetchResult> {
  try {
    const requestUrl = validateDocumentUrl(url);
    const response = await axios.get(requestUrl, {
      timeout: FETCH_TIMEOUT,
      maxContentLength: MAX_OPENAPI_DOCUMENT_BYTES,
      maxBodyLength: MAX_OPENAPI_DOCUMENT_BYTES,
      responseType: 'json',
      headers: {
        'Accept': 'application/json',
      },
    });

    const data = response.data;

    // 验证返回的数据是否为有效的 OpenAPI 文档
    if (!validateOpenAPIDocument(data)) {
      return {
        success: false,
        error: '返回的数据不是有效的 OpenAPI 3.0 格式，请检查文档是否包含 openapi、info 和 paths 字段',
      };
    }

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * 根据错误类型生成友好的错误信息
 * @param error 捕获的错误
 * @returns 用户友好的错误信息
 */
function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;

    // 超时错误
    if (axiosError.code === 'ECONNABORTED') {
      return '请求超时，请检查网络连接或稍后重试';
    }

    // DNS 解析失败
    if (axiosError.code === 'ENOTFOUND') {
      return 'DNS 解析失败，请检查 URL 地址是否正确';
    }

    // 连接被拒绝
    if (axiosError.code === 'ECONNREFUSED') {
      return '连接被拒绝，请检查服务器是否可用';
    }

    // HTTP 错误状态码
    if (axiosError.response) {
      const status = axiosError.response.status;
      const statusText = axiosError.response.statusText;
      return `HTTP 错误: ${status} ${statusText}`;
    }

    // 网络错误
    if (axiosError.message) {
      return `网络错误: ${axiosError.message}`;
    }
  }

  // JSON 解析错误
  if (error instanceof SyntaxError) {
    return '返回的数据不是有效的 JSON 格式';
  }

  // 其他错误
  if (error instanceof Error) {
    return `发生错误: ${error.message}`;
  }

  return '发生未知错误';
}
