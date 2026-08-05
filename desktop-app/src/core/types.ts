/**
 * OpenAPI Code Generator - 类型定义
 * 定义所有模块共享的接口和类型
 */

// ============ OpenAPI 文档结构 ============

export interface IOpenAPIDocument {
  openapi: string;
  info: {
    title: string;
    version?: string;
  };
  servers?: Array<{
    url: string;
  }>;
  tags?: Array<{
    name: string;
    description?: string;
  }>;
  paths: Record<string, IPathItem>;
  components?: {
    schemas?: Record<string, ISchemaInfo>;
  };
}

export interface IPathItem {
  get?: IOperation;
  post?: IOperation;
  put?: IOperation;
  delete?: IOperation;
  patch?: IOperation;
}

export interface IOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: IParameterInfo[];
  requestBody?: {
    // content-type → media type 映射
    // 实际常见：application/json、multipart/form-data、application/x-www-form-urlencoded、application/octet-stream、wildcard
    // 不写死成固定 key，parser 端按优先级挑一个用
    content?: Record<string, { schema?: ISchemaInfo } | undefined>;
  };
  responses?: {
    '200'?: {
      content?: Record<string, { schema?: ISchemaInfo } | undefined>;
    };
  };
}

// ============ Schema 相关类型 ============

export interface ISchemaInfo {
  type?: string;
  format?: string;
  description?: string;
  properties?: Record<string, ISchemaInfo>;
  items?: ISchemaInfo;
  $ref?: string;
  required?: string[];
  enum?: (string | number)[];
  allOf?: ISchemaInfo[];
  oneOf?: ISchemaInfo[];
  anyOf?: ISchemaInfo[];
}

export interface ISchemaRef {
  $ref?: string;
  schema?: ISchemaInfo;
  // 该 schema 对应的 content-type
  // 仅 requestBody 实际用得到（response 一律按 application/json 处理）
  // undefined / application/json / */* 视为默认 JSON，generator 不写 headers
  // 其他（multipart/form-data、application/x-www-form-urlencoded、application/octet-stream 等）
  // generator 会显式追加 headers 字段
  contentType?: string;
}

// ============ 接口信息类型 ============

export interface IParameterInfo {
  name: string;
  in: 'query' | 'path' | 'header';
  required: boolean;
  schema: ISchemaInfo;
  description?: string;
}

export interface IEndpointInfo {
  path: string;
  method: string;
  tag: string;
  summary: string;
  operationId: string;
  parameters: IParameterInfo[];
  requestBody?: ISchemaRef;
  response: ISchemaRef;
}

// ============ 搜索结果类型 ============

export interface ISearchResult {
  found: boolean;
  endpoints: IEndpointInfo[];
}

// ============ 代码生成类型 ============

export interface IGeneratedCode {
  typeFile: string;
  indexFile: string;
}

export interface INamingResult {
  functionName: string;
  paramsInterfaceName: string;
  pathParamsInterfaceName: string;
  responseInterfaceName: string;
}

// ============ 获取结果类型 ============

export interface IFetchResult {
  success: boolean;
  data?: IOpenAPIDocument;
  error?: string;
}

// ============ 文件写入结果类型 ============

export interface IWriteResult {
  success: boolean;
  files: string[];
  error?: string;
}

// ============ CLI 选项类型 ============

export interface ICliOptions {
  apiUrl: string;
  searchQuery: string;
  outputDir: string;
}


// ============ 调用模式类型 (Invoke Mode) ============

/**
 * CLI 操作模式
 */
export type CliMode = 'generate' | 'invoke';

/**
 * 调用模式配置接口
 */
export interface IInvokeConfig {
  /** 调用模式 Token（默认为空） */
  invokeToken: string;
  /** API 基础 URL（完整地址，含协议+主机+路径，显式覆盖一切自动推导） */
  baseUrl: string;
  /**
   * 业务接口 URL 路径前缀（仅路径部分，如 "/platform"）
   * 当未配置 baseUrl 时，会拼到 apiUrl 的 origin 后面用于业务接口；
   * 登录/用户信息接口不受此前缀影响。
   */
  urlPrefix?: string;
  /** 请求超时时间（毫秒） */
  timeout: number;
  /** 用户信息验证接口路径 */
  userInfoPath: string;
  /** 登录接口路径 */
  loginPath: string;
  /** 登录接口基础 URL（如果与 baseUrl 不同） */
  authBaseUrl: string;
  /** 密码加密密钥 */
  pwdEncKey?: string;
}

/**
 * 登录凭证接口
 */
export interface ILoginCredentials {
  /** 用户名 */
  username: string;
  /** 密码 */
  password: string;
}

/**
 * 登录响应接口
 */
export interface ILoginResponse {
  /** 是否成功 */
  success: boolean;
  /** Token */
  token?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 用户信息接口
 */
export interface IUserInfo {
  /** 用户ID */
  userId: string;
  /** 用户名 */
  name: string;
  /** 用户名（登录名） */
  username: string;
}

/**
 * 认证结果接口
 */
export interface IAuthResult {
  /** 是否认证成功 */
  success: boolean;
  /** Token */
  token?: string;
  /** 用户信息 */
  userInfo?: IUserInfo;
  /** 错误信息 */
  error?: string;
  /** 用户主动返回上一步（非错误，区别于失败） */
  back?: boolean;
}

/**
 * 参数显示信息接口
 */
export interface IParamDisplayInfo {
  /** 参数名 */
  name: string;
  /** 参数类型 */
  type: string;
  /** 中文描述 */
  description: string;
  /** 是否必填 */
  required: boolean;
  /** 参数位置 (query/path/body) */
  in: 'query' | 'path' | 'body';
  /** 当前值 */
  value: string | number | boolean | null;
  /** 默认值 */
  defaultValue?: string | number | boolean;
}

/**
 * 参数编辑结果接口
 */
export interface IParamEditResult {
  /** 是否确认发送 */
  confirmed: boolean;
  /** 路径参数 */
  pathParams: Record<string, string>;
  /** 查询参数 */
  queryParams: Record<string, any>;
  /** 请求体参数 */
  bodyParams: Record<string, any>;
}

/**
 * 请求配置接口
 */
export interface IInvokeRequest {
  /** 请求 URL */
  url: string;
  /** HTTP 方法 */
  method: string;
  /** 请求头 */
  headers: Record<string, string>;
  /** 查询参数 */
  params?: Record<string, any>;
  /** 请求体 */
  data?: Record<string, any>;
  /** 超时时间 */
  timeout: number;
}

/**
 * 响应结果接口
 */
export interface IInvokeResponse {
  /** 是否成功 */
  success: boolean;
  /** HTTP 状态码 */
  statusCode: number;
  /** 响应时间（毫秒） */
  responseTime: number;
  /** 响应数据 */
  data?: any;
  /** 错误信息 */
  error?: string;
}

/**
 * 分页参数名称常量
 */
export const PAGINATION_PARAMS = {
  /** 页码参数名列表 */
  PAGE_NUM: ['pageNum', 'current', 'page'],
  /** 每页大小参数名列表 */
  PAGE_SIZE: ['pageSize', 'size', 'limit'],
} as const;
