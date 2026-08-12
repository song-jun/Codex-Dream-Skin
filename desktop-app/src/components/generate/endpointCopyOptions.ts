/** 接口复制菜单的可用动作配置。 */
export type EndpointCopyAction = "title" | "endpoint" | "curl";

/** 生成页接口复制下拉菜单配置，供列表和虚拟列表共用。 */
export const endpointCopyOptions: ReadonlyArray<{
  action: EndpointCopyAction;
  label: string;
}> = [
  { action: "title", label: "复制标题" },
  { action: "endpoint", label: "复制接口" },
  { action: "curl", label: "复制 cURL" },
];
