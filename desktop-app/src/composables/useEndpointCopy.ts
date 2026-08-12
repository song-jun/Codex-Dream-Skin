/** 生成页接口复制操作，集中管理标题、接口路径和 cURL 的复制内容。 */
import { useConfigStore } from "@/stores/config";
import { useDocStore } from "@/stores/doc";
import { copyToClipboard } from "@/utils/clipboard";
import type { IEndpointInfo } from "@/core/types";
import type { EndpointCopyAction } from "@/components/generate/endpointCopyOptions";

/** 根据当前文档与环境配置构造接口的 cURL 命令。 */
function buildCurl(
  endpoint: IEndpointInfo,
  baseUrl: string,
  sourceUrl: string,
): string {
  const base =
    baseUrl || (sourceUrl ? new URL(sourceUrl).origin : "https://your-host");
  return `curl -X ${endpoint.method.toUpperCase()} '${base.replace(/\/$/, "")}${endpoint.path}'`;
}

/** 返回接口复制菜单所需的动作处理函数。 */
export function useEndpointCopy() {
  const configStore = useConfigStore();
  const docStore = useDocStore();

  /** 根据菜单动作复制对应的接口信息。 */
  async function copyEndpoint(
    endpoint: IEndpointInfo,
    action: EndpointCopyAction,
  ) {
    if (action === "title") {
      const title = endpoint.summary || endpoint.path;
      await copyToClipboard(title, `已复制标题：${title}`);
      return;
    }
    if (action === "endpoint") {
      await copyToClipboard(endpoint.path, `已复制接口：${endpoint.path}`);
      return;
    }
    const curl = buildCurl(
      endpoint,
      configStore.config.baseUrl,
      docStore.sourceUrl,
    );
    await copyToClipboard(
      curl,
      `已复制：${endpoint.method.toUpperCase()} ${endpoint.path}`,
    );
  }

  return { copyEndpoint };
}
