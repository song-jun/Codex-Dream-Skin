/**
 * 请求执行器模块
 * 负责执行 API 请求并处理响应，支持 JSON 语法高亮显示和中文字段注释
 */

import axios, { AxiosError, AxiosRequestConfig } from 'axios';
// chalk 在浏览器/Electron 渲染进程不可用，使用 stub
import chalk from './chalk-stub';
import {
  IEndpointInfo,
  IInvokeResponse,
  IParamEditResult,
  IOpenAPIDocument,
  ISchemaInfo,
} from './types';
import { INVOKE_TIMEOUT, RESPONSE_TRUNCATE_THRESHOLD } from './env';

// 注意：不要把 INVOKE_TIMEOUT / RESPONSE_TRUNCATE_THRESHOLD 缓存到 const（否则 reloadEnv 后不生效）

// ============ ApiInvoker 类 ============

/**
 * 请求执行器类
 * 负责构建和执行 API 请求，格式化显示响应结果
 */
export class ApiInvoker {
  /** API 基础 URL */
  private baseUrl: string;
  /** 认证 Token */
  private token: string;
  /** 请求超时时间（毫秒） */
  private timeout: number;
  /** OpenAPI 文档（用于获取字段注释） */
  private doc: IOpenAPIDocument | null = null;
  /** 当前接口信息（用于获取响应 schema） */
  private currentEndpoint: IEndpointInfo | null = null;

  /**
   * 构造函数
   * @param baseUrl API 基础 URL
   * @param token 认证 Token
   * @param timeout 请求超时时间（毫秒），默认 30000
   * @param doc OpenAPI 文档（可选，用于字段注释）
   */
  constructor(baseUrl: string, token: string, timeout: number = INVOKE_TIMEOUT, doc?: IOpenAPIDocument) {
    const parsedBaseUrl = new URL(baseUrl.trim());
    if (parsedBaseUrl.protocol !== 'http:' && parsedBaseUrl.protocol !== 'https:') {
      throw new Error('API 基础地址只支持 http 或 https');
    }
    if (parsedBaseUrl.username || parsedBaseUrl.password) {
      throw new Error('API 基础地址不允许携带账号密码');
    }
    this.baseUrl = parsedBaseUrl.toString().replace(/\/$/, ''); // 移除末尾斜杠
    this.token = token;
    this.timeout = timeout;
    this.doc = doc || null;
  }

  /**
   * 设置 OpenAPI 文档
   * @param doc OpenAPI 文档
   */
  setDocument(doc: IOpenAPIDocument): void {
    this.doc = doc;
  }

  /**
   * 构建请求 URL（替换路径参数）
   * @param path 接口路径，可能包含路径参数如 {id}
   * @param pathParams 路径参数键值对
   * @returns 完整的请求 URL
   */
  buildUrl(path: string, pathParams: Record<string, string>): string {
    let resolvedPath = path;

    if (/^[a-z][a-z\d+.-]*:/i.test(resolvedPath) || resolvedPath.startsWith('//')) {
      throw new Error('接口路径必须是相对路径');
    }

    // 替换路径参数 {paramName} -> 实际值
    for (const [paramName, paramValue] of Object.entries(pathParams)) {
      const placeholder = `{${paramName}}`;
      resolvedPath = resolvedPath.replace(placeholder, encodeURIComponent(paramValue));
    }

    return `${this.baseUrl}${resolvedPath.startsWith('/') ? '' : '/'}${resolvedPath}`;
  }

  /**
   * 执行 API 请求
   * @param endpoint 接口信息
   * @param params 参数编辑结果
   * @returns 响应结果
   */
  async invoke(endpoint: IEndpointInfo, params: IParamEditResult): Promise<IInvokeResponse> {
    // 保存当前 endpoint 用于响应字段注释
    this.currentEndpoint = endpoint;
    
    const startTime = Date.now();
    const method = endpoint.method.toUpperCase();
    const url = this.buildUrl(endpoint.path, params.pathParams);

    // 显示请求状态
    console.log(chalk.cyan('\n正在请求...'));
    console.log(chalk.gray(`  ${method} ${url}`));

    try {
      // 构建请求配置
      const config: AxiosRequestConfig = {
        method: method.toLowerCase(),
        url,
        timeout: this.timeout,
        headers: this.buildHeaders(),
      };

      // 根据 HTTP 方法放置参数
      if (method === 'GET' || method === 'DELETE') {
        // GET/DELETE: 参数放在 query string
        config.params = params.queryParams;
      } else {
        // POST/PUT/PATCH: 参数放在 body
        // 合并 queryParams 和 bodyParams（body 优先）
        const bodyData = { ...params.queryParams, ...params.bodyParams };
        if (Object.keys(bodyData).length > 0) {
          config.data = bodyData;
        }
        // 如果有单独的 query 参数，也要加上
        if (Object.keys(params.queryParams).length > 0 && Object.keys(params.bodyParams).length > 0) {
          config.params = params.queryParams;
          config.data = params.bodyParams;
        }
      }

      const response = await axios(config);
      const responseTime = Date.now() - startTime;

      return {
        success: true,
        statusCode: response.status,
        responseTime,
        data: response.data,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return this.handleError(error, responseTime);
    }
  }

  /**
   * 构建请求头
   * @returns 请求头对象
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // 添加 Authorization Bearer Token
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  /**
   * 处理请求错误
   * @param error 错误对象
   * @param responseTime 响应时间
   * @returns 错误响应结果
   */
  private handleError(error: unknown, responseTime: number): IInvokeResponse {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      // 有响应的错误（4xx, 5xx）
      if (axiosError.response) {
        return {
          success: false,
          statusCode: axiosError.response.status,
          responseTime,
          data: axiosError.response.data,
          error: this.getHttpErrorMessage(axiosError.response.status),
        };
      }

      // 网络错误
      return {
        success: false,
        statusCode: 0,
        responseTime,
        error: this.getNetworkErrorMessage(axiosError),
      };
    }

    // 其他错误
    return {
      success: false,
      statusCode: 0,
      responseTime,
      error: error instanceof Error ? error.message : '发生未知错误',
    };
  }

  /**
   * 获取 HTTP 错误信息
   * @param statusCode HTTP 状态码
   * @returns 错误信息
   */
  private getHttpErrorMessage(statusCode: number): string {
    const messages: Record<number, string> = {
      400: '请求参数错误',
      401: '认证失败，请检查 Token',
      403: '权限不足',
      404: '接口不存在',
      405: '请求方法不允许',
      408: '请求超时',
      500: '服务器内部错误',
      502: '网关错误',
      503: '服务不可用',
      504: '网关超时',
    };

    return messages[statusCode] || `HTTP 错误: ${statusCode}`;
  }

  /**
   * 获取网络错误信息
   * @param error Axios 错误
   * @returns 错误信息
   */
  private getNetworkErrorMessage(error: AxiosError): string {
    if (error.code === 'ECONNABORTED') {
      return '请求超时，请检查网络连接或增加超时时间';
    }
    if (error.code === 'ENOTFOUND') {
      return 'DNS 解析失败，请检查服务器地址';
    }
    if (error.code === 'ECONNREFUSED') {
      return '连接被拒绝，请检查服务器是否可用';
    }
    if (error.code === 'ECONNRESET') {
      return '连接被重置';
    }

    return error.message || '网络错误';
  }

  /**
   * 格式化并显示响应（带中文字段注释）
   * @param response 响应结果
   */
  displayResponse(response: IInvokeResponse): void {
    console.log('');

    // 显示状态码和响应时间
    if (response.success) {
      console.log(
        chalk.green(`✓ 状态码: ${response.statusCode}`) +
        chalk.gray(` (${response.responseTime}ms)`)
      );
    } else {
      console.log(
        chalk.red(`✗ 状态码: ${response.statusCode}`) +
        chalk.gray(` (${response.responseTime}ms)`)
      );

      if (response.error) {
        console.log(chalk.red(`  错误: ${response.error}`));
      }
    }

    // 显示响应数据
    if (response.data !== undefined) {
      console.log(chalk.cyan('\n响应数据:'));
      console.log(chalk.gray('─'.repeat(60)));

      // 获取响应 schema 用于字段注释
      const responseSchema = this.getResponseSchema();
      const fieldDescriptions = this.extractFieldDescriptions(responseSchema);
      
      // 格式化 JSON 并添加注释（简化版本）
      const formattedJson = this.formatJsonWithCommentsSimple(response.data, fieldDescriptions);
      
      // 检查是否需要截断
      if (formattedJson.length > RESPONSE_TRUNCATE_THRESHOLD) {
        const truncated = formattedJson.substring(0, RESPONSE_TRUNCATE_THRESHOLD);
        console.log(truncated);
        console.log(chalk.yellow(`\n... 响应数据过长，已截断 (共 ${formattedJson.length} 字符)`));
      } else {
        console.log(formattedJson);
      }

      console.log(chalk.gray('─'.repeat(60)));
    }
  }

  /**
   * 获取当前接口的响应 Schema
   * @returns Schema 信息或 null
   */
  private getResponseSchema(): ISchemaInfo | null {
    if (!this.currentEndpoint || !this.doc) {
      return null;
    }

    // 从 endpoint.response 获取 schema
    const responseRef = this.currentEndpoint.response;
    if (!responseRef) {
      return null;
    }

    // 如果是 $ref 引用，解析它
    if (responseRef.$ref) {
      return this.resolveSchemaRef(responseRef.$ref);
    }

    return responseRef.schema || null;
  }

  /**
   * 解析 Schema 引用
   * @param ref 引用路径
   * @returns 解析后的 Schema
   */
  private resolveSchemaRef(ref: string): ISchemaInfo | null {
    if (!this.doc || !ref.startsWith('#/components/schemas/')) {
      return null;
    }

    const schemaName = ref.replace('#/components/schemas/', '');
    return this.doc.components?.schemas?.[schemaName] || null;
  }

  /**
   * 递归提取所有字段的描述信息（带深度限制）
   * @param schema Schema 信息
   * @param prefix 字段路径前缀
   * @param depth 当前深度
   * @returns 字段路径到描述的映射
   */
  private extractFieldDescriptions(schema: ISchemaInfo | null, prefix: string = '', depth: number = 0): Map<string, string> {
    const descriptions = new Map<string, string>();
    
    // 深度限制，防止无限递归
    if (!schema || depth > 5) {
      return descriptions;
    }

    // 如果是引用，先解析
    if (schema.$ref) {
      const resolved = this.resolveSchemaRef(schema.$ref);
      if (resolved) {
        return this.extractFieldDescriptions(resolved, prefix, depth + 1);
      }
      return descriptions;
    }

    // 处理 properties
    if (schema.properties) {
      for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
        const fieldPath = prefix ? `${prefix}.${fieldName}` : fieldName;
        
        // 获取字段描述
        let description = fieldSchema.description || '';
        
        // 如果是引用，尝试获取引用的描述
        if (fieldSchema.$ref && !description) {
          const resolved = this.resolveSchemaRef(fieldSchema.$ref);
          if (resolved?.description) {
            description = resolved.description;
          }
        }

        if (description) {
          descriptions.set(fieldName, description); // 只用字段名作为 key
        }

        // 递归处理嵌套对象（限制深度）
        if (depth < 4) {
          if (fieldSchema.properties) {
            const nestedDescriptions = this.extractFieldDescriptions(fieldSchema, fieldPath, depth + 1);
            nestedDescriptions.forEach((desc, path) => descriptions.set(path, desc));
          }

          // 处理数组项
          if (fieldSchema.type === 'array' && fieldSchema.items) {
            const itemSchema = fieldSchema.items.$ref 
              ? this.resolveSchemaRef(fieldSchema.items.$ref) 
              : fieldSchema.items;
            if (itemSchema) {
              const itemDescriptions = this.extractFieldDescriptions(itemSchema, '', depth + 1);
              itemDescriptions.forEach((desc, path) => descriptions.set(path, desc));
            }
          }

          // 处理引用类型的嵌套
          if (fieldSchema.$ref) {
            const resolved = this.resolveSchemaRef(fieldSchema.$ref);
            if (resolved) {
              const nestedDescriptions = this.extractFieldDescriptions(resolved, '', depth + 1);
              nestedDescriptions.forEach((desc, path) => descriptions.set(path, desc));
            }
          }
        }
      }
    }

    // 处理数组类型的 items
    if (schema.type === 'array' && schema.items && depth < 4) {
      const itemSchema = schema.items.$ref 
        ? this.resolveSchemaRef(schema.items.$ref) 
        : schema.items;
      if (itemSchema) {
        const itemDescriptions = this.extractFieldDescriptions(itemSchema, '', depth + 1);
        itemDescriptions.forEach((desc, path) => descriptions.set(path, desc));
      }
    }

    return descriptions;
  }

  /**
   * 简化版：格式化 JSON 数据并添加中文注释
   * 使用行处理方式，避免递归导致的内存问题
   * @param data JSON 数据
   * @param fieldDescriptions 字段描述映射
   * @returns 格式化后的字符串（带注释）
   */
  private formatJsonWithCommentsSimple(data: any, fieldDescriptions: Map<string, string>): string {
    try {
      // 先格式化为 JSON 字符串
      const jsonString = JSON.stringify(data, null, 2);
      const lines = jsonString.split('\n');
      
      // 跟踪是否在 records 数组中，以及当前是第几个元素
      let inRecordsArray = false;
      let recordIndex = 0;
      let bracketDepth = 0;
      
      const resultLines = lines.map((line, lineIndex) => {
        // 检测进入 records 数组
        if (line.includes('"records"') && line.includes('[')) {
          inRecordsArray = true;
          recordIndex = 0;
          bracketDepth = 0;
        }
        
        // 跟踪数组中的对象
        if (inRecordsArray) {
          if (line.includes('{')) {
            if (bracketDepth === 0) {
              recordIndex++;
            }
            bracketDepth++;
          }
          if (line.includes('}')) {
            bracketDepth--;
          }
          if (line.includes(']') && !line.includes('[')) {
            inRecordsArray = false;
          }
        }
        
        // 只对第一条记录或非 records 数组中的字段添加注释
        const shouldAddComment = !inRecordsArray || recordIndex <= 1;
        
        // 匹配 JSON 键名: "fieldName":
        const keyMatch = line.match(/^\s*"([^"]+)":/);
        if (keyMatch && shouldAddComment) {
          const fieldName = keyMatch[1];
          const description = fieldDescriptions.get(fieldName);
          
          if (description) {
            // 添加注释
            const highlightedLine = this.highlightJsonLine(line);
            return `${highlightedLine} ${chalk.gray(`// ${description}`)}`;
          }
        }
        
        return this.highlightJsonLine(line);
      });
      
      return resultLines.join('\n');
    } catch {
      return JSON.stringify(data, null, 2);
    }
  }

  /**
   * 对单行 JSON 进行语法高亮
   * @param line JSON 行
   * @returns 高亮后的行
   */
  private highlightJsonLine(line: string): string {
    return line
      // 键名（青色）
      .replace(/"([^"]+)":/g, (match, key) => `${chalk.cyan(`"${key}"`)}:`)
      // 字符串值（绿色）
      .replace(/:\s*"([^"]*)"/g, (match, value) => `: ${chalk.green(`"${value}"`)}`)
      // 数字（黄色）
      .replace(/:\s*(-?\d+\.?\d*)/g, (match, num) => `: ${chalk.yellow(num)}`)
      // 布尔值（蓝色）
      .replace(/:\s*(true|false)/g, (match, bool) => `: ${chalk.blue(bool)}`)
      // null（灰色）
      .replace(/:\s*(null)/g, () => `: ${chalk.gray('null')}`);
  }

  /**
   * 格式化 JSON 数据（带语法高亮）
   * @param data JSON 数据
   * @returns 格式化后的字符串
   */
  formatJson(data: any): string {
    try {
      const jsonString = JSON.stringify(data, null, 2);
      return this.highlightJson(jsonString);
    } catch {
      return String(data);
    }
  }

  /**
   * 对 JSON 字符串进行语法高亮
   * @param jsonString JSON 字符串
   * @returns 高亮后的字符串
   */
  private highlightJson(jsonString: string): string {
    // 使用正则表达式匹配 JSON 的各个部分并着色
    return jsonString
      // 字符串值（绿色）
      .replace(/"([^"\\]|\\.)*"/g, (match) => {
        // 检查是否是键名（后面跟着冒号）
        return match;
      })
      // 数字（黄色）
      .replace(/:\s*(-?\d+\.?\d*)/g, (match, num) => {
        return `: ${chalk.yellow(num)}`;
      })
      // 布尔值（蓝色）
      .replace(/:\s*(true|false)/g, (match, bool) => {
        return `: ${chalk.blue(bool)}`;
      })
      // null（灰色）
      .replace(/:\s*(null)/g, (match, nullVal) => {
        return `: ${chalk.gray(nullVal)}`;
      })
      // 键名（青色）
      .replace(/"([^"]+)":/g, (match, key) => {
        return `${chalk.cyan(`"${key}"`)}:`;
      })
      // 字符串值（绿色）- 在键名处理后再处理
      .replace(/:\s*"([^"\\]|\\.)*"/g, (match) => {
        const value = match.substring(2); // 移除 ": "
        return `: ${chalk.green(value)}`;
      });
  }

  /**
   * 获取当前 Token
   * @returns 当前 Token
   */
  getToken(): string {
    return this.token;
  }

  /**
   * 设置 Token
   * @param token 新的 Token
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * 获取基础 URL
   * @returns 基础 URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
}
