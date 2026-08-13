/**
 * 渲染进程错误记录中心。
 * 用户界面只展示友好提示，原始异常仅保存在错误记录中供排查。
 */
import { ref } from "vue";
import { ElMessage } from "element-plus";

/** 单条错误记录的持久化结构。 */
export interface ErrorRecord {
  id: string;
  createdAt: string;
  source: string;
  detail: string;
}

const STORAGE_KEY = "codexDreamSkin.errorRecords";
const MAX_RECORDS = 100;

/** 安全读取已有错误记录，忽略异常或旧格式数据。 */
function loadRecords(): ErrorRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is ErrorRecord =>
        !!item &&
        typeof item.id === "string" &&
        typeof item.createdAt === "string" &&
        typeof item.source === "string" &&
        typeof item.detail === "string",
    );
  } catch {
    return [];
  }
}

/** 当前会话可响应的错误记录列表。 */
export const errorRecords = ref<ErrorRecord[]>(loadRecords());

/** 持久化错误记录；存储空间不可用时不影响业务流程。 */
function persistRecords() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(errorRecords.value));
  } catch {
    /* localStorage 不可用时仅保留内存记录。 */
  }
}

/** 将任意异常转换为尽可能完整的原始文本。 */
export function getErrorDetail(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

/** 记录原始异常信息。 */
export function recordError(error: unknown, source: string): void {
  const detail = getErrorDetail(error);
  const createdAt = new Date().toISOString();
  errorRecords.value = [
    { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt, source, detail },
    ...errorRecords.value,
  ].slice(0, MAX_RECORDS);
  persistRecords();
}

/** 记录原始异常，同时在界面显示不包含原文的友好提示。 */
export function showFriendlyError(error: unknown, source: string, message: string): void {
  recordError(error, source);
  ElMessage.error(message);
}

/** 删除一条错误记录。 */
export function removeErrorRecord(id: string): void {
  errorRecords.value = errorRecords.value.filter((item) => item.id !== id);
  persistRecords();
}

/** 清空全部错误记录。 */
export function clearErrorRecords(): void {
  errorRecords.value = [];
  persistRecords();
}

/** 注册未捕获异常和未处理 Promise 拒绝的全局记录。 */
export function registerGlobalErrorRecording(): void {
  window.addEventListener("error", (event) => {
    recordError(event.error || event.message, "未捕获异常");
  });
  window.addEventListener("unhandledrejection", (event) => {
    recordError(event.reason, "未处理 Promise 拒绝");
  });
}
