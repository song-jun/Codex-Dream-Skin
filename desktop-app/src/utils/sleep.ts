/** 异步 sleep（让出主线程，避免长任务阻塞 UI） */
export function sleep(ms: number = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
