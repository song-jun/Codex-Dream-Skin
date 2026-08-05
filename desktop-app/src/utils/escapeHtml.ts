/** HTML 转义（防 XSS + 兼容 highlight.js 输出） */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
