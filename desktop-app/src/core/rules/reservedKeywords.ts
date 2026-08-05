/**
 * JavaScript / TypeScript 保留关键字集合
 *
 * 用途：函数名/接口名/属性名生成时用作过滤黑名单，避免与语言关键字
 * 或 Object.prototype 方法冲突导致调用行为异常。
 *
 * 分类：
 * - JS 常用保留字
 * - ES6+ 保留字
 * - 未来保留字
 * - 字面量（undefined / null / true / false / NaN / Infinity）
 * - class 访问器关键字（get / set）
 * - Object.prototype 方法（toString / valueOf / hasOwnProperty / ...）
 */

/**
 * JS / TS 保留字 + Object.prototype 方法
 * 任何接口/函数/属性名命中本集合都必须避开
 */
export const RESERVED_KEYWORDS: Set<string> = new Set([
  // JS 常用保留字
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'false',
  'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof',
  'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true',
  'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  // ES6+ 保留字
  'let', 'static', 'enum', 'await', 'async', 'implements', 'interface',
  'package', 'private', 'protected', 'public',
  // 未来保留字
  'abstract', 'boolean', 'byte', 'char', 'double', 'final', 'float',
  'goto', 'int', 'long', 'native', 'short', 'synchronized', 'throws',
  'transient', 'volatile',
  // 字面量
  'undefined', 'null', 'true', 'false', 'NaN', 'Infinity',
  // class 访问器关键字（get/set 在对象/类字面量中是关键字）
  'get', 'set',
  // Object.prototype 方法（直接作为函数名会覆盖原型方法，导致调用行为异常）
  'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf',
  'propertyIsEnumerable', 'toLocaleString', 'constructor', '__proto__',
  '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
]);

/**
 * 判断名称是否为 JS / TS 保留关键字
 * @param name 名称
 * @returns 是否为保留关键字
 */
export function isReservedKeyword(name: string): boolean {
  return RESERVED_KEYWORDS.has(name);
}
