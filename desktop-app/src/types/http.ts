/**
 * HTTP method 枚举 + 工具
 */
export const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "head",
  "options",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

/** method 字符串 → 小写、合法枚举值；非法返回 undefined */
export function normalizeMethod(m: string): HttpMethod | undefined {
  const lower = m.toLowerCase();
  return (HTTP_METHODS as readonly string[]).includes(lower)
    ? (lower as HttpMethod)
    : undefined;
}

/** 生成 method 对应的 CSS class（如 method-get、method-post） */
export function methodClass(method: string): string[] {
  return ["method-tag", `method-${method.toLowerCase()}`];
}
