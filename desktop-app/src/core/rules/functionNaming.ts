/**
 * 函数/接口命名规则
 *
 * 核心策略：
 * - 函数名（camelCase）：从 URL path 拼接，跳过公共前缀
 * - 基础名（PascalCase）：从 URL path 拼接，跳过公共前缀，所有段 PascalCase
 * - path 段：kebab-case / snake-case / 数字 / 点 → camelCase
 * - 保留字 / 空 → 由调用方回退到 summary 派生策略
 *
 * 例：
 *   "/platform/app/detail/{id}"        → 函数 appDetail / 基础 AppDetail
 *   "/message/notice/user/dept-tree"    → 函数 noticeUserDeptTree / 基础 NoticeUserDeptTree
 *   "/platform/app/api_v2_user_list"   → 函数 appApiV2UserList / 基础 AppApiV2UserList
 */

import type { IEndpointInfo } from "../types";
import { isReservedKeyword } from "./reservedKeywords";
import {
  inferOperationPrefix,
  OPERATION_PREFIX_MAP,
} from "./operationPrefix";
import { CHINESE_TO_ENGLISH_MAP } from "./chineseMap";

/**
 * 把 path 中的单段规范化：
 * - 把 kebab-case / snake-case 转成 camelCase
 * - 去掉非字母数字字符（仅保留 a-zA-Z0-9）
 *
 *   dept-tree  → deptTree
 *   user_list  → userList
 *   app-2      → app2
 *   fooBar     → fooBar
 *
 * @param seg path 单段
 * @returns 规范化后的 camelCase 字符串
 */
export function normalizeSegment(seg: string): string {
  if (!seg) return "";
  // 把所有非字母数字字符（- _ . 空格 等）当作分隔符
  const parts = seg
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  return parts
    .map((p, i) => {
      const lower = p.toLowerCase();
      // 数字段：不调整大小写（避免出现 "2" → "2" 没问题）
      if (/^\d+$/.test(lower)) return lower;
      if (i === 0) return lower; // 段内首段小写
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

/**
 * 已知 API 命名空间前缀白名单（无业务语义的路径段，应从函数/接口名中跳过）
 * 命中即视为前缀跳过，避免生成 apiUser / v1User 这类冗余名字
 */
const NAMESPACE_PREFIXES: ReadonlySet<string> = new Set([
  "api", "apis", "rest",
  "v0", "v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8", "v9",
  "internal", "public", "private", "admin",
]);

/** 判断一个 path 段是否为 API 命名空间前缀 */
function isNamespacePrefix(seg: string): boolean {
  if (!seg) return false;
  const lower = seg.toLowerCase();
  if (NAMESPACE_PREFIXES.has(lower)) return true;
  // 兜底：v\d+（如 v10、v11）
  if (/^v\d+$/.test(lower)) return true;
  return false;
}

/**
 * 从 path 提取"有语义"的段数组（智能跳过命名空间前缀）
 * 规则：
 * 1) 单段 → 保留全部
 * 2) ≥ 2 段：仅当首段是已知命名空间前缀（api/v1/...）时跳过
 * 3) ≥ 3 段：默认跳过首段（按惯例把第一段视为前缀）
 * 例：
 *   "/api/users"                 → ["users"]            (api 是命名空间)
 *   "/project/page"              → ["project", "page"]  (project 是资源)
 *   "/v1/users"                  → ["users"]            (v1 是版本)
 *   "/platform/user/page"        → ["user", "page"]     (3 段，跳过 platform)
 *   "/api/platform/user/page"    → ["platform", "user", "page"]
 */
export function getMeaningfulSegments(path: string): string[] {
  if (!path) return [];
  const segments = path
    .replace(/\{[^}]*\}/g, "")
    .split("/")
    .map(s => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return [];
  if (segments.length > 1) {
    if (isNamespacePrefix(segments[0]) || segments.length >= 3) {
      return segments.slice(1);
    }
  }
  return segments;
}

/**
 * 从 endpoint.path 中提取用于函数名后缀的语义化片段（PascalCase）
 * @param path 接口路径，如 "/platform/app/detail/{id}"
 * @returns 提取出的语义化片段（PascalCase），如 "AppDetail"
 */
export function extractPathSuffix(path: string): string {
  const meaningful = getMeaningfulSegments(path);
  if (meaningful.length === 0) {
    return "";
  }
  // 转成 PascalCase 并拼接到 prefix 后面
  return meaningful
    .map(seg => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join("");
}

/**
 * 直接从 URL path 拼接函数名（camelCase）
 * 不引入 method/summary 前缀，避免出现 deleteCategoryDelete 这种重复单词
 * 例如：
 *   "/platform/app/category/delete"   → "appCategoryDelete"
 *   "/platform/app/detail/{id}"       → "appDetail"
 *   "/platform/app/page"              → "appPage"
 *   "/message/notice/user/dept-tree"  → "noticeUserDeptTree"
 * @param path 接口路径
 * @returns 派生的函数名（camelCase），无重复单词
 */
export function generateFunctionNameFromPath(path: string): string {
  const meaningful = getMeaningfulSegments(path);
  if (meaningful.length === 0) {
    return "";
  }
  // 先规范化每段（kebab/snake → camelCase，去掉非法字符）
  // 拼成 camelCase：第一段小写开头，后续 PascalCase
  return meaningful
    .map(normalizeSegment)
    .filter(Boolean)
    .map((seg, i) => {
      if (i === 0) {
        return seg.charAt(0).toLowerCase() + seg.slice(1);
      }
      return seg.charAt(0).toUpperCase() + seg.slice(1);
    })
    .join("");
}

/**
 * 从 URL path 派生出 PascalCase 基础名（用于接口命名）
 * 例如：
 *   "/platform/outs/staff/detail/{id}"  → "OutsStaffDetail"
 *   "/platform/app/page"                → "AppPage"
 *   "/message/notice/user/dept-tree"    → "NoticeUserDeptTree"
 *   "/project/page"                     → "ProjectPage"   (project 是资源)
 *   "/api/users"                        → "Users"         (api 是命名空间)
 * @param path 接口路径
 * @returns PascalCase 形式的基础名
 */
export function getPathBaseName(path: string): string {
  const meaningful = getMeaningfulSegments(path);
  if (meaningful.length === 0) {
    return "";
  }
  return meaningful
    .map(normalizeSegment)
    .filter(Boolean)
    .map(seg => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join("");
}

/**
 * 将中文名转换为英文 PascalCase
 * - 先尝试用 CHINESE_TO_ENGLISH_MAP 替换已知中文
 * - 移除剩余中文
 * - 移除分隔符
 * - 处理连续大写，保证 PascalCase
 * @param chineseName 中文名称
 * @returns PascalCase 英文名
 */
export function convertToPascalCase(chineseName: string): string {
  if (!chineseName) {
    return "";
  }

  let result = chineseName;

  // 首先尝试替换已知的中文词汇
  for (const [chinese, english] of Object.entries(CHINESE_TO_ENGLISH_MAP)) {
    result = result.replace(new RegExp(chinese, "g"), english);
  }

  // 移除剩余的中文字符和特殊字符
  result = result.replace(/[\u4e00-\u9fa5]/g, ""); // 移除未翻译的中文
  result = result.replace(/[-_/\\.\s]+/g, ""); // 移除分隔符

  // 确保结果是 PascalCase
  if (result.length > 0) {
    // 处理连续的大写字母，确保正确的 PascalCase
    result = result.charAt(0).toUpperCase() + result.slice(1);
  }

  return result;
}

/**
 * 生成函数名
 * 策略：直接由 URL path 拼接 camelCase 名（统一规则，不依赖后端 operationId）
 * - 避免出现 deleteCategoryDelete 这种重复单词
 * - 避免后端 operationId 后缀 _33 / _8 这类无意义编号
 * - 拼出的是保留关键字 / 空 → 回退到旧 prefix+summary 策略
 * 同模块内的重名由调用方 ensureUniqueFunctionName 兜底追加 _2、_3 ...
 * @param endpoint 接口信息
 * @returns 函数名
 */
export function generateFunctionName(endpoint: IEndpointInfo): string {
  const { summary, method, path } = endpoint;

  // 1. 直接从 URL path 拼接 camelCase 名
  const pathName = generateFunctionNameFromPath(path);
  if (pathName && !isReservedKeyword(pathName)) {
    return pathName;
  }

  // 2. 回退：从 summary + method 推断 prefix，拼接 summary 派生名
  const prefix = inferOperationPrefix(summary, method);
  let cleanedSummary = summary;
  for (const keyword of Object.keys(OPERATION_PREFIX_MAP)) {
    cleanedSummary = cleanedSummary.replace(keyword, "");
  }
  cleanedSummary = cleanedSummary.replace(/[-_/\\]/g, "");
  const pascalName = convertToPascalCase(cleanedSummary);
  return ensureValidFunctionName(prefix + pascalName, endpoint);
}

/**
 * 确保函数名合法（非保留关键字、非空）
 * 若生成的名称是 JS/TS 保留关键字或为空，则基于 path 追加语义化后缀
 * @param baseName 原始生成的函数名
 * @param endpoint 接口信息
 * @returns 合法的函数名
 */
export function ensureValidFunctionName(
  baseName: string,
  endpoint: IEndpointInfo
): string {
  // 去除首尾空白
  let name = (baseName || "").trim();

  // 若为空，则使用一个基础名
  if (!name) {
    name = "api";
  }

  // 若仍为保留关键字，则从 path 抽取后缀拼接
  if (isReservedKeyword(name)) {
    const pathSuffix = extractPathSuffix(endpoint.path);

    // 避免冗余命名：若 path 后缀以当前关键字开头（不区分大小写），
    // 如 delete + "Delete" = "deleteDelete"，则去掉重复部分
    let finalSuffix = pathSuffix;
    if (pathSuffix && pathSuffix.toLowerCase().startsWith(name.toLowerCase())) {
      finalSuffix = pathSuffix.slice(name.length);
    }

    if (finalSuffix) {
      name = name + finalSuffix;
    } else if (endpoint.summary) {
      // 回退：尝试从 summary 转成 PascalCase 作为后缀
      const summarySuffix = convertToPascalCase(endpoint.summary);
      if (
        summarySuffix &&
        !summarySuffix.toLowerCase().startsWith(name.toLowerCase())
      ) {
        name = name + summarySuffix;
      } else {
        name = name + "Item";
      }
    } else {
      name = name + "Item";
    }
  }

  return name;
}
