/**
 * OpenAPI 类型 → TypeScript 类型映射
 */

/** 基础类型映射表 */
export const TYPE_MAP: Record<string, string> = {
  'string': 'string',
  'integer': 'number',
  'number': 'number',
  'boolean': 'boolean',
  'array': 'Array',
  'object': 'object',
};

/**
 * 将 OpenAPI 类型映射为 TypeScript 类型
 * @param openApiType OpenAPI 类型
 * @param format 可选的格式说明（如 date-time）
 * @returns TypeScript 类型
 */
export function mapOpenAPITypeToTS(openApiType: string, format?: string): string {
  // 处理特殊格式
  if (format === 'date-time' || format === 'date') {
    return 'Date';
  }
  if (format === 'binary' || format === 'byte') {
    return 'Blob';
  }
  if (format === 'password') {
    return 'string';
  }

  // 数组类型
  if (openApiType === 'array') {
    return 'Array';
  }

  // 基础类型映射
  return TYPE_MAP[openApiType] || 'any';
}
