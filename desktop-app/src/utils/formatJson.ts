/**
 * JSON 格式化工具
 * 统一封装 stringify 逻辑 + 异常兜底，避免各处重复 try/catch
 */

/** 漂亮的 2 空格缩进 JSON 字符串（用于 UI 展示）
 * - 失败时返回原始值的字符串形式或空串
 * - undefined / null / function / symbol 返回 ""，避免显示 "undefined"
 */
export function formatJson(value: unknown): string {
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    // 含循环引用 / BigInt / Symbol 等不可序列化值时降级
    try {
      return String(value);
    } catch {
      return "";
    }
  }
}
