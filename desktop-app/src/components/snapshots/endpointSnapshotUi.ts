/** 接口快照管理页展示文案。 */
export const endpointSnapshotUi = {
  title: "接口快照",
  description: "用于识别同一接口文档后续加载时的新增和缺失接口。",
  clear: "清空全部",
  delete: "删除",
  generate: "生成代码",
  generateSuccess: "快照解析成功，已进入代码生成",
  legacySnapshot: "该历史快照未保存完整文档，请重新加载一次原文档后再使用生成代码。",
  empty: "暂无接口快照",
  endpointCount: "接口",
  updatedAt: "更新时间",
  unknownUpdatedAt: "历史快照",
  filePrefix: "本地文件",
  urlPrefix: "接口地址",
} as const;

/**
 * 将快照的 ISO 时间转换为本地完整日期、时分秒和星期。
 * @param value 快照写入时保存的 ISO 时间。
 * @returns 可直接用于界面展示的本地时间，旧版无时间快照返回历史标识。
 */
export function formatEndpointSnapshotTime(value: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return endpointSnapshotUi.unknownUpdatedAt;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
