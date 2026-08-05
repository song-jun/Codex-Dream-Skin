/**
 * 操作前缀规则
 *
 * 用途：决定函数名的前缀动词（get/update/delete/create/...）。
 * 优先级：summary 关键词命中 > HTTP method 回退。
 *
 * 配置项：
 * - OPERATION_PREFIX_MAP：summary 中含中文关键词 → 前缀
 * - METHOD_PREFIX_MAP：HTTP method → 默认前缀
 */

/**
 * 接口 summary 中含中文操作关键词时，匹配的前缀
 * 例：summary="获取用户详情" → 前缀 "get"
 */
export const OPERATION_PREFIX_MAP: Record<string, string> = {
  '获取': 'get',
  '查询': 'get',
  '列表': 'get',
  '详情': 'get',
  '编辑': 'edit',
  '更新': 'update',
  '修改': 'update',
  '新增': 'add',
  '添加': 'add',
  '创建': 'create',
  '删除': 'delete',
  '移除': 'remove',
};

/**
 * 当 summary 没命中关键词时，按 HTTP method 给默认前缀
 */
export const METHOD_PREFIX_MAP: Record<string, string> = {
  'get': 'get',
  'post': 'create',
  'put': 'update',
  'delete': 'delete',
  'patch': 'update',
};

/**
 * 根据 summary 推断操作前缀
 * 1) 先在 summary 中找中文关键词
 * 2) 找不到时按 HTTP method 回退
 * @param summary 接口摘要
 * @param method HTTP 方法
 * @returns 操作前缀
 */
export function inferOperationPrefix(summary: string, method: string): string {
  // 首先检查 summary 中是否包含操作关键词
  for (const [keyword, prefix] of Object.entries(OPERATION_PREFIX_MAP)) {
    if (summary.includes(keyword)) {
      return prefix;
    }
  }

  // 如果 summary 中没有找到关键词，则根据 HTTP 方法推断
  const normalizedMethod = method.toLowerCase();
  return METHOD_PREFIX_MAP[normalizedMethod] || 'get';
}
