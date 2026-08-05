/**
 * 参数编辑器（浏览器版，UI-agnostic）
 *
 * 流程：
 * 1. extractParams() — 从 OpenAPI 文档提取参数元数据
 * 2. UI 层用 el-form 渲染 + 收集用户输入
 * 3. UI 调用 buildResult() 把表单值转为 IParamEditResult
 */
import type { IEndpointInfo, IOpenAPIDocument, IParamDisplayInfo, IParamEditResult, ISchemaInfo } from './types';
import { resolveSchemaRef } from './parser';
import { PAGINATION_PARAMS } from './types';

const DEFAULT_PAGE_NUM = 1;
const DEFAULT_PAGE_SIZE = 10;

function getSchemaType(schema: ISchemaInfo): string {
  if (!schema) return 'any';
  if (schema.type === 'array' && schema.items) return `${getSchemaType(schema.items)}[]`;
  if (schema.type) return schema.format ? `${schema.type}(${schema.format})` : schema.type;
  if (schema.$ref) return (schema.$ref.split('/').pop() || '');
  return 'any';
}

function getDefaultValue(_schema: ISchemaInfo, name: string): string | number | boolean | undefined {
  if ((PAGINATION_PARAMS.PAGE_NUM as readonly string[]).includes(name)) return DEFAULT_PAGE_NUM;
  if ((PAGINATION_PARAMS.PAGE_SIZE as readonly string[]).includes(name)) return DEFAULT_PAGE_SIZE;
  return undefined;
}

function convertValue(value: string, type: string): string | number | boolean | null {
  if (value === '' || value === null || value === undefined) return null;
  const lt = type.toLowerCase();
  if (lt.startsWith('integer') || lt.startsWith('number')) {
    const n = Number(value);
    return isNaN(n) ? null : n;
  }
  if (lt === 'boolean') return value.toLowerCase() === 'true';
  return value;
}

export class ParamEditor {
  private endpoint: IEndpointInfo;
  private doc: IOpenAPIDocument;
  private params: IParamDisplayInfo[];

  constructor(endpoint: IEndpointInfo, doc: IOpenAPIDocument) {
    this.endpoint = endpoint;
    this.doc = doc;
    this.params = [];
  }

  /** 提取参数元数据（包含 path/query/body 三个来源） */
  extractParams(): IParamDisplayInfo[] {
    const params: IParamDisplayInfo[] = [];

    if (this.endpoint.parameters && this.endpoint.parameters.length > 0) {
      for (const p of this.endpoint.parameters) {
        if (p.in === 'header') continue;
        params.push({
          name: p.name,
          type: getSchemaType(p.schema),
          description: p.description || '',
          required: p.required,
          in: p.in as 'query' | 'path',
          value: null,
          defaultValue: getDefaultValue(p.schema, p.name)
        });
      }
    }

    if (this.endpoint.requestBody) {
      const bodySchema = this.resolveRequestBodySchema();
      if (bodySchema?.properties) {
        const required = bodySchema.required || [];
        for (const [name, schema] of Object.entries(bodySchema.properties)) {
          params.push({
            name,
            type: getSchemaType(schema),
            description: schema.description || '',
            required: required.includes(name),
            in: 'body',
            value: null,
            defaultValue: getDefaultValue(schema, name)
          });
        }
      }
    }

    this.params = params;
    return params;
  }

  private resolveRequestBodySchema(): ISchemaInfo | null {
    if (!this.endpoint.requestBody) return null;
    if (this.endpoint.requestBody.$ref) {
      return resolveSchemaRef(this.doc, this.endpoint.requestBody.$ref);
    }
    return this.endpoint.requestBody.schema || null;
  }

  getParams(): IParamDisplayInfo[] {
    return this.params;
  }

  /** UI 调用此方法把表单值转为 IParamEditResult */
  buildResult(formValues: Record<string, any>): IParamEditResult {
    const pathParams: Record<string, string> = {};
    const queryParams: Record<string, any> = {};
    const bodyParams: Record<string, any> = {};

    for (const p of this.params) {
      const raw = formValues[p.name];
      if (raw === undefined || raw === null || raw === '') continue;
      const v = convertValue(String(raw), p.type);
      if (v === null) continue;
      if (p.in === 'path') pathParams[p.name] = String(v);
      else if (p.in === 'query') queryParams[p.name] = v;
      else if (p.in === 'body') bodyParams[p.name] = v;
    }

    return { confirmed: true, pathParams, queryParams, bodyParams };
  }
}

export { getSchemaType, getDefaultValue, convertValue, DEFAULT_PAGE_NUM, DEFAULT_PAGE_SIZE };
