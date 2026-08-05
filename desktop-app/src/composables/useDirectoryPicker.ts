/**
 * 目录选择 + 文件写入 composable
 * 优先用 Electron IPC，否则回退到浏览器 File System Access API
 * pendingDirHandle 在网页端模式下被 onSaveAll / onSaveAll 共享
 */
import { ref } from "vue";
import { ElMessage } from "element-plus";

export type WriteItem = { path: string; content: string };
export type WriteResult = { path: string; success: boolean; error?: string };
export type WriteOutcome = { success: boolean; dir?: string };
/** 写盘进度回调：每写完一个文件触发（浏览器端有效，Electron 端只在结束后触发） */
export type WriteProgressFn = (written: number, total: number) => void;

/** 模块级共享 handle（一次选目录，多次写盘） */
let pendingDirHandle: any = null;

/** 清除 pending handle（导出完成后调用） */
export function clearPendingDirHandle(): void {
  pendingDirHandle = null;
}

/** 选目录（Electron → IPC；浏览器 → showDirectoryPicker） */
export async function pickOutputDir(): Promise<string | null> {
  if (window.electronAPI) {
    const dir = await window.electronAPI.selectDirectory();
    return dir || null;
  }
  if (typeof (window as any).showDirectoryPicker === "function") {
    try {
      pendingDirHandle = await (window as any).showDirectoryPicker({
        mode: "readwrite",
      });
      return "(已选目录)";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return null;
      throw e;
    }
  }
  ElMessage.error("当前环境不支持选择目录");
  return null;
}

/**
 * 写入目录（一次性 IPC，内部按 path 解析成完整路径）
 * 适用于 onSave（单次 2 个文件）
 */
export async function writeItemsToDir(items: WriteItem[]): Promise<WriteOutcome> {
  if (window.electronAPI) {
    const dir = await window.electronAPI.selectDirectory();
    if (!dir) return { success: false };
    const fullItems = items.map((it) => ({
      path: `${dir}/${it.path}`,
      content: it.content,
    }));
    const results = await window.electronAPI.writeFiles(fullItems);
    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      ElMessage.error(
        `部分文件保存失败：${failed.map((f) => f.path).join(", ")}`,
      );
      return { success: false, dir };
    }
    return { success: true, dir };
  }
  if (pendingDirHandle) {
    // 网页端：复用已选 handle
    try {
      for (const it of items) {
        const parts = it.path.split("/");
        const filename = parts.pop()!;
        let handle: any = pendingDirHandle;
        for (const part of parts) {
          handle = await handle.getDirectoryHandle(part, { create: true });
        }
        const fh = await handle.getFileHandle(filename, { create: true });
        const w = await fh.createWritable();
        await w.write(it.content);
        await w.close();
      }
      return { success: true, dir: "(已选目录)" };
    } catch (e) {
      ElMessage.error("保存失败：" + (e instanceof Error ? e.message : String(e)));
      return { success: false };
    }
  }
  // 没选过目录
  if (typeof (window as any).showDirectoryPicker === "function") {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: "readwrite",
      });
      pendingDirHandle = dirHandle;
      for (const it of items) {
        const parts = it.path.split("/");
        const filename = parts.pop()!;
        let handle = dirHandle;
        for (const part of parts) {
          handle = await handle.getDirectoryHandle(part, { create: true });
        }
        const fh = await handle.getFileHandle(filename, { create: true });
        const w = await fh.createWritable();
        await w.write(it.content);
        await w.close();
      }
      return { success: true, dir: "(已选目录)" };
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        ElMessage.error("保存失败：" + (e instanceof Error ? e.message : String(e)));
      }
      return { success: false };
    }
  }
  ElMessage.error("当前环境不支持选择目录");
  return { success: false };
}

/**
 * 写入目录（不选目录，假定 dir + pendingDirHandle 已就绪）
 * 适用于 onSaveAll（已选过 handle，批量写）
 * @param onProgress 进度回调（每个文件完成触发，用于实时更新 currentTag）
 */
export async function writeItemsToDirRaw(
  dir: string,
  items: WriteItem[],
  onProgress?: WriteProgressFn,
): Promise<WriteResult[]> {
  if (window.electronAPI) {
    // Electron 模式：直接 IPC 写盘（绝对路径）
    // 实时进度：通过 fs:writeFiles 完成后回调一次（Electron 端快，没必要细粒度）
    const fullItems = items.map((it) => ({
      path: `${dir}/${it.path}`,
      content: it.content,
    }));
    const results = await window.electronAPI.writeFiles(fullItems);
    onProgress?.(results.length, results.length);
    return results;
  }
  if (pendingDirHandle) {
    // 网页端：handle 防御性权限确认
    try {
      if (pendingDirHandle.queryPermission) {
        const state = await pendingDirHandle.queryPermission({ mode: "readwrite" });
        if (state !== "granted") {
          await pendingDirHandle.requestPermission({ mode: "readwrite" });
        }
      }
    } catch (e) {
      console.warn("[writeItemsToDirRaw] 权限检查失败：", e instanceof Error ? e.message : String(e));
    }
    // **并行写盘 + 实时进度**
    // - items.map(async ...) 启动所有 promise 并发写
    // - 每个文件完成时 written++，节流调 onProgress（50ms 最多一次，避免 UI 卡）
    // - 最后再 force 一次保证显示 N/N
    let written = 0;
    let lastEmit = 0;
    const total = items.length;
    const emitProgress = () => {
      const now = Date.now();
      if (now - lastEmit > 50 || written === total) {
        lastEmit = now;
        onProgress?.(written, total);
      }
    };
    const writes = items.map(async (it): Promise<WriteResult> => {
      try {
        const parts = it.path.split("/");
        const filename = parts.pop()!;
        let handle: any = pendingDirHandle;
        for (const part of parts) {
          handle = await handle.getDirectoryHandle(part, { create: true });
        }
        const fh = await handle.getFileHandle(filename, { create: true });
        const w = await fh.createWritable();
        await w.write(it.content);
        await w.close();
        written++;
        emitProgress();
        return { path: it.path, success: true };
      } catch (err) {
        written++;
        emitProgress();
        return { path: it.path, success: false, error: err instanceof Error ? err.message : String(err) };
      }
    });
    const results = await Promise.all(writes);
    onProgress?.(written, total);
    return results;
  }
  // 没有 handle 也不在 Electron：fallback（理论不会进到这里）
  return items.map((it) => ({
    path: it.path,
    success: false,
    error: "未选择输出目录（pendingDirHandle 为空）",
  }));
}
