/**
 * 代码生成器（公共 API）
 * 负责：组装请求函数 + import + urlPrefix 声明，输出最终的 type.ts / index.ts
 *
 * 类型/接口的发射逻辑（generateInterfaceName / getTypeScriptType / generateInterfaceFromSchema ...）
 * 已抽取到 ./codeEmitter.ts，这里只做"调用 + 拼接"。
 */

import {
  IOpenAPIDocument,
  IEndpointInfo,
  IGeneratedCode,
  INamingResult,
} from "./types";

// 规则层（命名 / 类型映射 / 保留字等）— 见 src/rules/
export {
  RESERVED_KEYWORDS,
  isReservedKeyword,
  OPERATION_PREFIX_MAP,
  METHOD_PREFIX_MAP,
  inferOperationPrefix,
  TYPE_MAP,
  mapOpenAPITypeToTS,
  PAGINATION_INTERNAL_FIELDS,
  extractPathSuffix,
  normalizeSegment,
  generateFunctionNameFromPath,
  getPathBaseName,
  ensureValidFunctionName,
  convertToPascalCase,
  generateFunctionName,
} from "./rules";

// 引入本地作用域使用
import {
  getPathBaseName,
  generateFunctionName,
  convertToPascalCase,
  translateChinese,
} from "./rules";

// 类型/接口发射器
export {
  generateInterfaceName,
  generatePropertyDefinition,
  getTypeScriptType,
  generateTypeDefinitions,
  generateTypeDefinitionsForBatch,
  generatePathParamsInterface,
  filterPaginationFields,
} from "./codeEmitter";

import {
  generateInterfaceName,
  generateTypeDefinitions,
  generateTypeDefinitionsForBatch,
  isBlobResponseType,
} from "./codeEmitter";

/**
 * 判断 content-type 是否走默认 JSON（generator 不写 Content-Type 头）
 *   undefined / 空 → true（后端没声明也按默认 JSON 处理）
 *   application/json 系列（含 application/json;charset=utf-8）→ true
 *   wildcard → true（无类型约束）
 *   其他（multipart/form-data、application/x-www-form-urlencoded、application/octet-stream...）→ false
 */
export function isDefaultJsonContentType(contentType: string | undefined): boolean {
  if (!contentType) return true;
  // 去掉 ;charset=... 后取主类型
  const base = contentType.split(';')[0].trim().toLowerCase();
  return base === 'application/json' || base === '*/*';
}

/**
 * 生成请求函数代码
 * @param endpoint 接口信息
 * @param naming 命名结果
 * @param urlPrefix URL 前缀
 * @returns 请求函数代码字符串
 */
export function generateRequestFunction(
  endpoint: IEndpointInfo,
  naming: INamingResult,
  urlPrefix: string,
): string {
  const lines: string[] = [];
  const {
    functionName,
    paramsInterfaceName,
    pathParamsInterfaceName,
    responseInterfaceName,
  } = naming;
  const method = endpoint.method.toLowerCase();

  // 生成 JSDoc 注释
  lines.push("/**");
  lines.push(` * ${endpoint.tag}`);
  lines.push(` * ${endpoint.summary}`);
  lines.push(" */");

  // 确定参数类型和参数名
  const hasQueryParams =
    endpoint.parameters && endpoint.parameters.some((p) => p.in === "query");
  const hasRequestBody = !!endpoint.requestBody;
  const hasPathParams = !!pathParamsInterfaceName;

  // 生成函数签名：pathParams → (params | data)
  const paramSegments: string[] = [];
  if (hasPathParams && pathParamsInterfaceName) {
    paramSegments.push(`pathParams: ${pathParamsInterfaceName}`);
  }
  if (hasQueryParams && paramsInterfaceName) {
    paramSegments.push(`params: ${paramsInterfaceName}`);
  } else if (hasRequestBody && paramsInterfaceName) {
    paramSegments.push(`data: ${paramsInterfaceName}`);
  }
  const paramSignature = paramSegments.join(", ");

  lines.push(
    `export function ${functionName}(${paramSignature}): Promise<${responseInterfaceName || "unknown"}> {`,
  );

  // 生成 request 调用
  lines.push("\treturn request({");

  // URL：始终使用模板字符串 + ${urlPrefix}，便于生成后修改业务前缀
  // 重要：必须让生成的代码中包含字面量 `${urlPrefix}`，运行时才引用 urlPrefix 变量
  // 因此用普通字符串拼接（不进入 JS 模板字符串解析）
  const pathParamNames = extractPathParamNames(endpoint.path);
  let pathPart = endpoint.path;
  for (const name of pathParamNames) {
    // 使用全局正则替换，兼容 ES2019 及以下 lib
    pathPart = pathPart.replace(
      new RegExp(`\\{${name}\\}`, "g"),
      "${pathParams." + name + "}",
    );
  }
  const tplUrl = "${urlPrefix}" + pathPart;
  lines.push(`\t\turl: \`${tplUrl}\`,`);

  // HTTP 方法
  lines.push(`\t\tmethod: '${method}',`);

  // 参数传递方式：GET 用 params，POST/PUT/DELETE/PATCH 用 data
  if (hasQueryParams) {
    lines.push("\t\tparams,");
  } else if (hasRequestBody) {
    lines.push("\t\tdata,");
  }

  // 特殊 content-type（非 application/json / */*）需要显式声明 Content-Type
  // 避免 axios / fetch 在 multipart/form-data 时错误加 boundary
  const contentType = endpoint.requestBody?.contentType;
  if (hasRequestBody && !isDefaultJsonContentType(contentType)) {
    lines.push(`\t\theaders: { 'Content-Type': '${contentType}' },`);
  }

  // 下载/导出类接口：显式声明 responseType: 'blob'，配合 Promise<Blob> 返回类型
  if (isBlobResponseType(endpoint.response?.contentType)) {
    lines.push(`\t\tresponseType: 'blob',`);
  }

  lines.push("\t});");
  lines.push("}");

  return lines.join("\n");
}

/**
 * 生成 import 语句
 * @param interfaceNames 接口名列表
 * @returns import 语句字符串
 */
export function generateImportStatements(interfaceNames: string[]): string {
  if (!interfaceNames || interfaceNames.length === 0) {
    return "";
  }

  // 过滤空字符串并去重
  const uniqueNames = [
    ...new Set(interfaceNames.filter((name) => name && name.trim())),
  ];

  if (uniqueNames.length === 0) {
    return "";
  }

  // 生成 request 导入
  const lines: string[] = ["import request from '/@/utils/request';"];

  // 生成类型导入
  lines.push("import {");
  for (const name of uniqueNames) {
    lines.push(`\t${name},`);
  }
  lines.push("} from './type';");

  return lines.join("\n");
}

/**
 * 生成命名结果
 * @param doc OpenAPI 文档
 * @param endpoint 接口信息
 * @returns 命名结果
 */
export function generateNamingResult(
  doc: IOpenAPIDocument,
  endpoint: IEndpointInfo,
): INamingResult {
  const functionName = generateFunctionName(endpoint);

  // 提取 path 中的占位符（如 /platform/app/detail/{id} → ['id']）
  const pathParamNames = extractPathParamNames(endpoint.path);

  // 生成路径参数接口名
  let pathParamsInterfaceName = "";
  if (pathParamNames.length > 0) {
    pathParamsInterfaceName = generateInterfaceName(
      getPathBaseName(endpoint.path) + "PathParams",
    );
  }

  // 生成参数接口名
  let paramsInterfaceName = "";
  const hasQueryParams =
    endpoint.parameters && endpoint.parameters.some((p) => p.in === "query");
  const hasRequestBody = !!endpoint.requestBody;

  if (hasQueryParams) {
    paramsInterfaceName = generateInterfaceName(
      getPathBaseName(endpoint.path) + "QueryParams",
    );
  } else if (hasRequestBody && endpoint.requestBody?.$ref) {
    const schemaName = endpoint.requestBody.$ref.split("/").pop() || "";
    paramsInterfaceName = generateInterfaceName(schemaName);
  } else if (hasRequestBody && endpoint.requestBody?.schema) {
    paramsInterfaceName = generateInterfaceName(
      getPathBaseName(endpoint.path) + "RequestBody",
    );
  } else if (hasRequestBody) {
    // requestBody 存在但既无 $ref 也无 schema（后端文档不规范，常见于空 body）
    // 也生成一个 RequestBody 接口，签名里仍能传 data
    paramsInterfaceName = generateInterfaceName(
      getPathBaseName(endpoint.path) + "RequestBody",
    );
  }

  // 生成响应接口名
  // - 下载/导出类（application/octet-stream、application/pdf、application/vnd.ms-excel 等）
  //   → 固定 'Blob'，对应 Promise<Blob> + responseType: 'blob'
  // - 其余 → IR_xxx 接口
  let responseInterfaceName = "";
  if (isBlobResponseType(endpoint.response?.contentType)) {
    responseInterfaceName = "Blob";
  } else if (endpoint.response?.$ref) {
    const schemaName = endpoint.response.$ref.split("/").pop() || "";
    responseInterfaceName = generateInterfaceName(schemaName);
  } else if (endpoint.response?.schema) {
    responseInterfaceName = generateInterfaceName(
      getPathBaseName(endpoint.path) + "Response",
    );
  }

  return {
    functionName,
    paramsInterfaceName,
    pathParamsInterfaceName,
    responseInterfaceName,
  };
}

/**
 * 从 URL 路径中提取 path 参数名
 * 例如 /platform/app/detail/{id} → ['id']
 *      /orgs/{orgId}/users/{userId} → ['orgId', 'userId']
 * @param path 接口路径
 * @returns 参数名列表
 */
export function extractPathParamNames(path: string): string[] {
  if (!path) {
    return [];
  }
  const matches = path.match(/\{([^}]+)\}/g);
  if (!matches) {
    return [];
  }
  return matches.map((m) => m.slice(1, -1));
}

/**
 * 收集所有需要导入的接口名
 * @param naming 命名结果
 * @returns 接口名列表
 */
export function collectImportedInterfaces(naming: INamingResult): string[] {
  const interfaces: string[] = [];

  if (naming.pathParamsInterfaceName) {
    interfaces.push(naming.pathParamsInterfaceName);
  }

  if (naming.paramsInterfaceName) {
    interfaces.push(naming.paramsInterfaceName);
  }

  if (naming.responseInterfaceName) {
    // Blob 是浏览器/TS 内置类型，不需要从 ./type 导入
    if (naming.responseInterfaceName !== "Blob") {
      interfaces.push(naming.responseInterfaceName);
    }
  }

  return interfaces;
}

/**
 * 生成完整的代码文件
 * @param doc OpenAPI 文档
 * @param endpoint 接口信息
 * @param urlPrefix URL 前缀
 * @returns 生成的代码
 */
export function generateCode(
  doc: IOpenAPIDocument,
  endpoint: IEndpointInfo,
  urlPrefix: string,
): IGeneratedCode {
  // 生成命名结果
  const naming = generateNamingResult(doc, endpoint);

  // 生成类型定义文件
  const typeFile = generateTypeDefinitions(doc, endpoint, extractPathParamNames);

  // 收集需要导入的接口
  const importedInterfaces = collectImportedInterfaces(naming);

  // 生成 import 语句
  const importStatements = generateImportStatements(importedInterfaces);

  // 生成请求函数
  const requestFunction = generateRequestFunction(endpoint, naming, urlPrefix);

  // 顶部声明 urlPrefix 变量，便于业务前缀统一管理
  const urlPrefixDeclaration = `const urlPrefix = "${urlPrefix}";`;

  // 组合 index.ts 文件内容
  const indexFile =
    importStatements +
    "\n\n" +
    urlPrefixDeclaration +
    "\n\n" +
    requestFunction +
    "\n";

  return {
    typeFile,
    indexFile,
  };
}

/**
 * 批量生成多个接口的代码（用于按 tag 生成）
 * @param doc OpenAPI 文档
 * @param endpoints 接口信息列表
 * @param urlPrefix URL 前缀
 * @returns 生成的代码
 */
export function generateCodeForMultipleEndpoints(
  doc: IOpenAPIDocument,
  endpoints: IEndpointInfo[],
  urlPrefix: string,
): IGeneratedCode {
  if (endpoints.length === 0) {
    return { typeFile: "", indexFile: "" };
  }

  // 收集所有类型定义（去重）
  const allTypeDefinitions: string[] = [];
  const generatedInterfaces = new Set<string>();

  // 收集所有请求函数
  const allRequestFunctions: string[] = [];

  // 收集所有需要导入的接口名
  const allImportedInterfaces: string[] = [];

  // 同模块内已使用的函数名（用于去重）
  const usedFunctionNames = new Set<string>();

  for (const endpoint of endpoints) {
    // 生成命名结果
    const naming = generateNamingResult(doc, endpoint);

    // 对函数名做模块内去重：若已存在同名函数，按回退链生成可读后缀
    const uniqueFunctionName = ensureUniqueFunctionName(
      naming.functionName,
      endpoint,
      usedFunctionNames,
    );
    if (uniqueFunctionName !== naming.functionName) {
      naming.functionName = uniqueFunctionName;
    }

    // 生成类型定义（需要去重处理）
    const typeDefinitions = generateTypeDefinitionsForBatch(
      doc,
      endpoint,
      generatedInterfaces,
      extractPathParamNames,
    );
    if (typeDefinitions) {
      allTypeDefinitions.push(typeDefinitions);
    }

    // 收集需要导入的接口
    const importedInterfaces = collectImportedInterfaces(naming);
    allImportedInterfaces.push(...importedInterfaces);

    // 生成请求函数
    allRequestFunctions.push(
      generateRequestFunction(endpoint, naming, urlPrefix),
    );
  }

  // 合并类型定义文件
  const typeFile = allTypeDefinitions.join("\n\n");

  // 去重导入的接口名
  const uniqueImportedInterfaces = [...new Set(allImportedInterfaces)];

  // 生成 import 语句
  const importStatements = generateImportStatements(uniqueImportedInterfaces);

  // 合并请求函数
  const requestFunctionsContent = allRequestFunctions.join("\n\n");

  // 顶部声明 urlPrefix 变量，便于业务前缀统一管理
  const urlPrefixDeclaration = `const urlPrefix = "${urlPrefix}";`;

  // 组合 index.ts 文件内容
  const indexFile =
    importStatements +
    "\n\n" +
    urlPrefixDeclaration +
    "\n\n" +
    requestFunctionsContent +
    "\n";

  return {
    typeFile,
    indexFile,
  };
}

/**
 * 在模块内为函数名去重：按回退链生成可读后缀，避免出现 user_2 这种无语义命名
 * 1) summary → convertToPascalCase（走 CHINESE_TO_ENGLISH_MAP 小字典翻译）
 * 2) HTTP method → Delete / Add / Update / Get / Patch
 * 3) summary → translateChinese（走 CN_DICT 大字典，覆盖更全）
 * 4) _2、_3 ... 兜底
 * @param baseName 原始函数名
 * @param endpoint 接口信息（用于 summary / method）
 * @param usedNames 已使用的函数名集合（会就地更新）
 * @returns 唯一函数名
 */
function ensureUniqueFunctionName(
  baseName: string,
  endpoint: IEndpointInfo,
  usedNames: Set<string>,
): string {
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }

  // 记录最近一次"想要用但被占了"的候选名（step 1~3 的目标），step 4 优先在此基础上追加 _2/_3
  let fallbackBase = baseName;

  const tryAdd = (candidate: string): string | null => {
    if (!candidate || candidate === baseName) return null;
    if (usedNames.has(candidate)) {
      // 被占了，记下来作为兜底基础
      fallbackBase = candidate;
      return null;
    }
    usedNames.add(candidate);
    return candidate;
  };

  // 把字符串数组转 PascalCase（每段首字母大写，其余小写）
  const toPascalFromWords = (words: string[]): string =>
    words
      .filter(Boolean)
      .map(w => w.toLowerCase())
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join("");

  // 1) summary → 派生语义后缀（CHINESE_TO_ENGLISH_MAP 字典翻译在 convertToPascalCase 内部完成）
  if (endpoint.summary) {
    const summarySuffix = convertToPascalCase(endpoint.summary);
    if (summarySuffix && summarySuffix.length >= 2) {
      const r = tryAdd(baseName + summarySuffix);
      if (r) return r;
    }
  }

  // 2) HTTP method → 标准动词后缀
  const METHOD_SUFFIX_MAP: Record<string, string> = {
    delete: "Delete",
    post: "Add",
    put: "Update",
    patch: "Update",
    get: "Get",
    head: "Head",
    options: "Options",
  };
  const methodLower = (endpoint.method || "").toLowerCase();
  const methodSuffix =
    METHOD_SUFFIX_MAP[methodLower] ||
    (methodLower
      ? methodLower.charAt(0).toUpperCase() + methodLower.slice(1)
      : "");
  if (methodSuffix) {
    const r = tryAdd(baseName + methodSuffix);
    if (r) return r;
  }

  // 3) summary → CN_DICT 大字典（translateChinese 走 max-match + pinyin 兜底），覆盖更全
  if (endpoint.summary) {
    const dictWords = translateChinese(endpoint.summary);
    const dictSuffix = toPascalFromWords(dictWords);
    if (dictSuffix && dictSuffix.length >= 2) {
      const r = tryAdd(baseName + dictSuffix);
      if (r) return r;
    }
  }

  // 4) _2、_3 ... 兜底：在最近一次冲突的候选名上追加，保留语义
  let n = 2;
  while (true) {
    const candidate = `${fallbackBase}_${n}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    n += 1;
  }
}
