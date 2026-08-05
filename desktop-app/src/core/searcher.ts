/**
 * 接口检索器
 * 负责根据用户输入检索匹配的接口
 */

import { IEndpointInfo, ISearchResult } from './types';

/**
 * 按接口名称搜索（模糊匹配 summary）
 * 在所有接口的 summary 中进行模糊匹配
 * @param endpoints 接口列表
 * @param query 搜索关键词
 * @returns 搜索结果
 */
export function searchByName(endpoints: IEndpointInfo[], query: string): ISearchResult {
  if (!query || query.trim() === '') {
    return { found: false, endpoints: [] };
  }

  const normalizedQuery = query.trim().toLowerCase();
  
  const matchedEndpoints = endpoints.filter(endpoint => {
    const summary = endpoint.summary.toLowerCase();
    return summary.includes(normalizedQuery);
  });

  return {
    found: matchedEndpoints.length > 0,
    endpoints: matchedEndpoints,
  };
}

/**
 * 按层级路径搜索（tag/summary 格式）
 * 先匹配 tag 再匹配 summary
 * @param endpoints 接口列表
 * @param path 层级路径（格式：tag/summary 或 tag）
 * @returns 搜索结果
 */
export function searchByPath(endpoints: IEndpointInfo[], path: string): ISearchResult {
  if (!path || path.trim() === '') {
    return { found: false, endpoints: [] };
  }

  const normalizedPath = path.trim();
  const separatorIndex = normalizedPath.indexOf('/');
  
  let tagQuery: string;
  let summaryQuery: string | undefined;

  if (separatorIndex === -1) {
    // 只有 tag 部分
    tagQuery = normalizedPath.toLowerCase();
    summaryQuery = undefined;
  } else {
    // tag/summary 格式
    tagQuery = normalizedPath.substring(0, separatorIndex).toLowerCase();
    summaryQuery = normalizedPath.substring(separatorIndex + 1).toLowerCase();
  }

  const matchedEndpoints = endpoints.filter(endpoint => {
    const tag = endpoint.tag.toLowerCase();
    const summary = endpoint.summary.toLowerCase();

    // 先匹配 tag
    if (!tag.includes(tagQuery)) {
      return false;
    }

    // 如果有 summary 查询，再匹配 summary
    if (summaryQuery !== undefined && summaryQuery !== '') {
      return summary.includes(summaryQuery);
    }

    return true;
  });

  return {
    found: matchedEndpoints.length > 0,
    endpoints: matchedEndpoints,
  };
}

/**
 * 智能搜索（自动判断搜索方式）
 * 如果查询包含 "/" 则使用层级路径搜索，否则使用名称搜索
 * @param endpoints 接口列表
 * @param query 搜索关键词或路径
 * @returns 搜索结果
 */
export function smartSearch(endpoints: IEndpointInfo[], query: string): ISearchResult {
  if (!query || query.trim() === '') {
    return { found: false, endpoints: [] };
  }

  const normalizedQuery = query.trim();

  // 如果包含 "/" 则使用层级路径搜索
  if (normalizedQuery.includes('/')) {
    return searchByPath(endpoints, normalizedQuery);
  }

  // 否则使用名称搜索
  return searchByName(endpoints, normalizedQuery);
}

/**
 * 按 tag 搜索（获取某个模块下的所有接口）
 * 精确匹配 tag 名称，返回该 tag 下的所有接口
 * @param endpoints 接口列表
 * @param tag tag 名称
 * @returns 搜索结果
 */
export function searchByTag(endpoints: IEndpointInfo[], tag: string): ISearchResult {
  const normalizedTag = tag ? tag.trim() : '';
  
  const matchedEndpoints = endpoints.filter(endpoint => {
    const endpointTag = endpoint.tag ? endpoint.tag.trim() : '';
    return endpointTag === normalizedTag;
  });

  return {
    found: matchedEndpoints.length > 0,
    endpoints: matchedEndpoints,
  };
}
