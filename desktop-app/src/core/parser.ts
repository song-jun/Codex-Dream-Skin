/**
 * OpenAPI 解析器
 * 负责解析 OpenAPI 文档结构，提取接口信息和 Schema 定义
 */

import { IOpenAPIDocument, IEndpointInfo, ISchemaInfo, IParameterInfo, ISchemaRef } from './types';

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch'] as const;

/**
 * 解析 OpenAPI 文档，提取所有接口信息
 * @param doc OpenAPI 文档
 * @returns 接口信息列表
 */
export function parseEndpoints(doc: IOpenAPIDocument): IEndpointInfo[] {
  const endpoints: IEndpointInfo[] = [];

  if (!doc.paths) {
    return endpoints;
  }

  for (const [path, pathItem] of Object.entries(doc.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const tag = operation.tags?.[0] ?? '';
      const summary = operation.summary ?? '';
      const operationId = operation.operationId ?? '';

      // 解析参数
      const parameters: IParameterInfo[] = (operation.parameters ?? []).map(param => ({
        name: param.name,
        in: param.in,
        required: param.required ?? false,
        schema: param.schema ?? {},
        description: param.description,
      }));

      // 解析请求体
      // 规则：
      //   1. content 里有 schema 且有 $ref → { $ref: '...', contentType }
      //   2. content 里有 schema（无 $ref）→ { schema: ..., contentType }
      //   3. content 存在但 schema 字段完全缺失（后端文档不规范，常见于"空 body"）
      //      → 用 { contentType } 占位（generator 端会基于 path 生成 IxxxRequestBody 接口）
      //   4. operation 根本没有 requestBody 字段 → undefined
      //
      // 兼容的 content type（按优先级匹配）：
      //   application/json > multipart/form-data > application/x-www-form-urlencoded
      //   > application/octet-stream > text/plain > */* > 任意第一个
      //   （都未命中时回退 application/json，确保 generator 行为可预测）
      let requestBody: ISchemaRef | undefined;
      const requestBodyContentMap = operation.requestBody?.content;
      if (requestBodyContentMap) {
        const contentType = detectRequestBodyContentType(requestBodyContentMap);
        const matched = requestBodyContentMap[contentType]
          || Object.values(requestBodyContentMap)[0];
        if (matched?.schema) {
          if (matched.schema.$ref) {
            requestBody = { $ref: matched.schema.$ref, contentType };
          } else {
            requestBody = { schema: matched.schema, contentType };
          }
        } else {
          // content 存在但没 schema（后端声明了 body 但没声明结构）→ 占位
          requestBody = { contentType };
        }
      }

      // 解析响应
      // 规则：
      //   1. content 里有 schema 且有 $ref → { $ref: '...', contentType }
      //   2. content 里有 schema（无 $ref）→ { schema: ..., contentType }
      //   3. content 存在但没 schema（如下载/导出类的 octet-stream 描述）
      //      → { contentType }（generator 端识别为 Blob）
      //   4. operation 根本没声明 response 200 的 content → 空对象（generator 按 JSON 处理）
      //   5. content 缺失（只有 description）但路径/summary 推断是下载类接口
      //      → { contentType: 'application/octet-stream' }（兜底，避免生成 Promise<>）
      //
      // content-type 优先级：application/json > */* > 任意第一个
      let response: ISchemaRef = {};
      const responseContentMap = operation.responses?.['200']?.content;
      const responseContentType = detectResponseContentType(responseContentMap);
      if (responseContentMap && responseContentType) {
        const matched = responseContentMap[responseContentType] as
          | { schema?: ISchemaInfo }
          | undefined;
        if (matched?.schema) {
          if (matched.schema.$ref) {
            response = { $ref: matched.schema.$ref, contentType: responseContentType };
          } else {
            response = { schema: matched.schema, contentType: responseContentType };
          }
        } else {
          // content 存在但 schema 缺失（下载/导出类典型场景）
          response = { contentType: responseContentType };
        }
      } else if (
        // 兜底：常见后端不规范写法 — 200 只有 description 没 content，但接口显然是下载
        inferContentTypeFromContext(path, operation.summary, operation.description)
      ) {
        response = { contentType: 'application/octet-stream' };
      }

      // 导出接口必须以 Blob 接收。部分 OpenAPI 文档会将导出响应错误标为 JSON，
      // 因此这里按接口语义覆盖响应类型，确保后续所有代码生成路径都带 responseType: 'blob'。
      if (isExportOperation(path, operation.summary, operation.description, operationId)) {
        response = { contentType: 'application/octet-stream' };
      }

      endpoints.push({
        path,
        method,
        tag,
        summary,
        operationId,
        parameters,
        requestBody,
        response,
      });
    }
  }

  return endpoints;
}

/**
 * 判断接口是否属于导出场景。
 * @param fields 路径、标题、描述与 operationId 等可用于识别导出语义的字段。
 * @returns 命中“导出”或“export”时返回 true。
 */
function isExportOperation(...fields: Array<string | undefined>): boolean {
  return fields.some((field) => /导出|export/i.test(field || ''));
}

/**
 * 选取 requestBody.content 里要用的 content-type
 * - 优先级见函数内 PREFERRED 数组
 * - 全都没命中就回退 'application/json'（让 generator 端永远拿到一个具体值）
 *
 * 注意：仅看 key 是否存在（即便 schema 为空也算命中，generator 会按"空 body"分支处理）
 */
export function detectRequestBodyContentType(
  content: Record<string, unknown> | undefined,
): string {
  if (!content || Object.keys(content).length === 0) {
    return 'application/json';
  }
  const PREFERRED = [
    'application/json',
    'multipart/form-data',
    'application/x-www-form-urlencoded',
    'application/octet-stream',
    'text/plain',
    '*/*',
  ] as const;
  for (const ct of PREFERRED) {
    if (content[ct] !== undefined) return ct;
  }
  // 都未命中 → 拿第一个（按 key 排序保证稳定）
  const keys = Object.keys(content).sort();
  return keys[0];
}

/**
 * 选取 responses[200].content 里要用的 content-type
 * - 优先级：application/json > wildcard > 任意第一个
 * - content 为空（没声明）→ undefined（generator 按默认 JSON 处理）
 */
export function detectResponseContentType(
  content: Record<string, unknown> | undefined,
): string | undefined {
  if (!content || Object.keys(content).length === 0) return undefined;
  if (content['application/json'] !== undefined) return 'application/json';
  if (content['*/*'] !== undefined) return '*/*';
  // 其他（octet-stream、pdf、excel、image/png...）→ 取第一个（按 key 排序）
  return Object.keys(content).sort()[0];
}

/**
 * 当 OpenAPI 文档不规范（200 响应只有 description 没 content）时
 * 根据路径 / summary / description 的关键词推断是否为下载类接口
 *
 * 命中关键词 → 返回 'application/octet-stream'（generator 端按 Blob 处理）
 * 未命中 → 返回 undefined
 *
 * 关键词覆盖：download/export/import/upload/template/attachment/stream/file
 *           下载/导出/导入/上传/模板/文件/附件/Excel/PDF
 */
export function inferContentTypeFromContext(
  path: string,
  summary?: string,
  description?: string,
): string | undefined {
  const text = `${path || ''} ${summary || ''} ${description || ''}`.toLowerCase();
  if (!text.trim()) return undefined;
  // 英文单词（用 \b 词边界避免 'import' 误匹配 'important'）
  const EN_KEYWORDS = ['download', 'export', 'import', 'upload', 'template', 'attachment', 'stream', 'file'];
  for (const kw of EN_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, 'i');
    if (re.test(text)) return 'application/octet-stream';
  }
  // 中文关键词（不需要词边界）
  const CN_KEYWORDS = ['下载', '导出', '导入', '上传', '模板', '文件', '附件', 'excel', 'pdf'];
  for (const kw of CN_KEYWORDS) {
    if (text.includes(kw)) return 'application/octet-stream';
  }
  return undefined;
}


/**
 * 解析 Schema 引用，获取完整的 Schema 定义
 * 支持递归解析嵌套的 $ref 引用
 * @param doc OpenAPI 文档
 * @param ref Schema 引用路径 (如 "#/components/schemas/User")
 * @returns Schema 定义
 */
export function resolveSchemaRef(doc: IOpenAPIDocument, ref: string): ISchemaInfo {
  // 解析 $ref 路径，格式为 "#/components/schemas/SchemaName"
  const refPath = ref.replace(/^#\//, '').split('/');
  
  // 从文档中获取引用的 schema
  let schema: unknown = doc;
  for (const segment of refPath) {
    if (schema && typeof schema === 'object' && segment in schema) {
      schema = (schema as Record<string, unknown>)[segment];
    } else {
      // 引用路径无效，返回空对象
      return {};
    }
  }

  if (!schema || typeof schema !== 'object') {
    return {};
  }

  const schemaInfo = schema as ISchemaInfo;

  // 递归解析嵌套的 $ref
  return resolveNestedRefs(doc, schemaInfo, new Set<string>());
}

/**
 * 递归解析 Schema 中的嵌套 $ref 引用
 * @param doc OpenAPI 文档
 * @param schema 当前 Schema
 * @param visited 已访问的引用集合（防止循环引用）
 * @returns 解析后的 Schema
 */
function resolveNestedRefs(doc: IOpenAPIDocument, schema: ISchemaInfo, visited: Set<string>): ISchemaInfo {
  // 如果当前 schema 本身是一个 $ref
  if (schema.$ref) {
    if (visited.has(schema.$ref)) {
      // 检测到循环引用，返回原始引用
      return schema;
    }
    visited.add(schema.$ref);
    const resolved = resolveSchemaRef(doc, schema.$ref);
    return resolveNestedRefs(doc, resolved, visited);
  }

  const result: ISchemaInfo = { ...schema };

  // 解析 properties 中的 $ref
  if (schema.properties) {
    result.properties = {};
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      result.properties[key] = resolveNestedRefs(doc, propSchema, new Set(visited));
    }
  }

  // 解析 items 中的 $ref (数组类型)
  if (schema.items) {
    result.items = resolveNestedRefs(doc, schema.items, new Set(visited));
  }

  // 解析 allOf 中的 $ref
  if (schema.allOf) {
    result.allOf = schema.allOf.map(s => resolveNestedRefs(doc, s, new Set(visited)));
  }

  // 解析 oneOf 中的 $ref
  if (schema.oneOf) {
    result.oneOf = schema.oneOf.map(s => resolveNestedRefs(doc, s, new Set(visited)));
  }

  // 解析 anyOf 中的 $ref
  if (schema.anyOf) {
    result.anyOf = schema.anyOf.map(s => resolveNestedRefs(doc, s, new Set(visited)));
  }

  return result;
}

/**
 * 获取所有 tags
 * @param doc OpenAPI 文档
 * @returns tags 列表（去重）
 */
export function extractTags(doc: IOpenAPIDocument): string[] {
  const tagsSet = new Set<string>();

  // 从文档的 tags 定义中提取
  if (doc.tags) {
    for (const tag of doc.tags) {
      if (tag.name) {
        tagsSet.add(tag.name);
      }
    }
  }

  // 从 paths 中的操作提取 tags（确保完整性）
  if (doc.paths) {
    for (const pathItem of Object.values(doc.paths)) {
      for (const method of HTTP_METHODS) {
        const operation = pathItem[method];
        if (operation?.tags) {
          for (const tag of operation.tags) {
            tagsSet.add(tag);
          }
        }
      }
    }
  }

  return Array.from(tagsSet);
}
