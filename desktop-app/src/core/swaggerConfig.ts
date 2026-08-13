/** Swagger UI 配置读取与服务地址拼接。 */
import { fetchJsonFromRuntime } from "@/core/fetcher";

/** Swagger 配置中可选择的一项服务。 */
export interface SwaggerServiceOption {
  name: string;
  url: string;
}

/** 用户提供的测试环境默认域名。 */
export const DEFAULT_SWAGGER_DOMAIN = "http://gr57dbee-9999-default.10.40.92.161.nip.io";

/** Swagger UI 配置的默认路径。 */
export const DEFAULT_SWAGGER_CONFIG_PATH = "/v3/api-docs/swagger-config";

/** 校验 Swagger UI 配置响应并提取服务下拉选项。 */
function parseSwaggerServices(data: unknown): SwaggerServiceOption[] {
  if (!data || typeof data !== "object") {
    throw new Error("Swagger 配置响应不是对象。");
  }
  const urls = (data as { urls?: unknown }).urls;
  if (!Array.isArray(urls)) {
    throw new Error("Swagger 配置未包含 urls 服务列表。");
  }
  return urls.filter(
    (item): item is SwaggerServiceOption =>
      !!item &&
      typeof item === "object" &&
      typeof (item as SwaggerServiceOption).name === "string" &&
      typeof (item as SwaggerServiceOption).url === "string",
  );
}

/** 根据用户域名和服务相对路径生成完整 OpenAPI 地址。 */
export function buildSwaggerUrl(domain: string, path: string): string {
  const base = domain.trim().replace(/\/+$/, "");
  const target = path.trim();
  if (!base || !target) throw new Error("域名或接口路径不能为空。");
  const url = new URL(target, `${base}/`);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("仅支持 HTTP 或 HTTPS 域名。");
  }
  return url.toString();
}

/** 获取 Swagger UI 配置，并返回可选择的服务列表。 */
export async function fetchSwaggerServices(
  domain: string,
  configPath: string,
): Promise<SwaggerServiceOption[]> {
  const configUrl = buildSwaggerUrl(domain, configPath);
  return parseSwaggerServices(await fetchJsonFromRuntime(configUrl));
}
