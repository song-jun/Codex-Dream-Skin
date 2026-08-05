/**
 * 分页框架内部字段
 *
 * 用途：MyBatis-Plus 等分页插件返回的字段（如 orders / optimizeCountSql），
 * 这些字段是后端框架内部使用的，不属于业务属性，需要在生成接口时过滤掉。
 */

/** 需要过滤的分页框架内部字段 */
export const PAGINATION_INTERNAL_FIELDS: string[] = [
  'orders',
  'optimizeCountSql',
  'searchCount',
  'optimizeJoinOfCountSql',
  'maxLimit',
];
