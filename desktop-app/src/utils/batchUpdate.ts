/**
 * 分批异步更新工具
 * 用途：一次性更新几百个 checkbox 时，避免主线程被 Vue 同步渲染阻塞
 */
type UpdateTask<T> = { add: boolean; item: T };
type KeyFn<T> = (item: T) => string;

/**
 * 把 items 分批更新到 currentSet（基于 key 去重）
 * 每批处理 BATCH 个，用 setTimeout(0) 让出主线程
 */
export function batchUpdateSet<T>(
  updates: UpdateTask<T>[],
  keyFn: KeyFn<T>,
  onProgress: (set: Set<string>) => void,
  onDone: () => void,
  BATCH: number = 100,
): void {
  let i = 0;
  const set = new Set<string>();
  const step = () => {
    const end = Math.min(i + BATCH, updates.length);
    for (; i < end; i++) {
      const u = updates[i];
      const k = keyFn(u.item);
      if (u.add) set.add(k);
      else set.delete(k);
    }
    onProgress(set);
    if (i < updates.length) setTimeout(step, 0);
    else onDone();
  };
  step();
}
