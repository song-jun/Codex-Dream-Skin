/**
 * 剪贴板工具（统一封装，处理权限/异常）
 */
import { ElMessage } from "element-plus";

export async function copyToClipboard(text: string, successMsg?: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    if (successMsg) ElMessage.success(successMsg);
    return true;
  } catch {
    ElMessage.error("复制失败");
    return false;
  }
}
