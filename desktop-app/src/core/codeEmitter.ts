/**
 * 类型/接口代码发射器
 * 负责把 OpenAPI Schema 转成 TypeScript interface/type 定义
 * 与 generator.ts 拆分：这里只关心"类型/接口"这一层，generator.ts 关心"请求函数 + 文件组装"
 */
import {
  IOpenAPIDocument,
  IEndpointInfo,
  ISchemaInfo,
  IParameterInfo,
} from "./types";
import {
  mapOpenAPITypeToTS,
  PAGINATION_INTERNAL_FIELDS,
  getPathBaseName,
} from "./rules";

/**
 * 生成接口名（带 I 前缀）
 * @param schemaName Schema 名称
 * @returns 接口名
 */
export function generateInterfaceName(schemaName: string): string {
  if (!schemaName) {
    return "";
  }

  // 清理 schema 名称，移除特殊字符
  const cleanedName = schemaName
    .replace(/[«»<>]/g, "") // 移除泛型符号
    .replace(/[,\s]/g, "") // 移除逗号和空格
    .trim();

  // 如果清理后为空，返回空字符串
  if (!cleanedName) {
    return "";
  }

  // 确保首字母大写
  const normalized = cleanedName.charAt(0).toUpperCase() + cleanedName.slice(1);

  // 如果已经以 I 开头且第二个字符是大写字母（A-Z），则不重复添加
  if (normalized.length > 1 && normalized.charAt(0) === "I" && /^[A-Z]$/.test(normalized.charAt(1))) {
    return normalized;
  }

  // 添加 I 前缀
  return "I" + normalized;
}

/**
 * 检查属性名是否需要用引号包裹
 * @param name 属性名
 * @returns 是否需要引号
 */
function needsQuotes(name: string): boolean {
  // 如果属性名包含特殊字符（非字母、数字、下划线、$），需要用引号包裹
  // 或者以数字开头
  return !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
}

/**
 * 判断响应是否为二进制流（下载/导出类）
 *   - application/json 或 wildcard → false（走 IR_xxx 接口）
 *   - 其他 application 家族（octet-stream/pdf/vnd.ms-excel/zip...）
 *   - image 家族、video 家族、audio 家族、text/csv
 *   全部视为 Blob
 *
 * 与 generator.ts 中的 isBlobResponseType 保持完全一致（两边都需要这个判断）
 */
export function isBlobResponseType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const base = contentType.split(';')[0].trim().toLowerCase();
  if (!base) return false;
  if (base === 'application/json' || base === '*/*') return false;
  return true;
}

/**
 * 格式化属性名（如果需要则添加引号）
 * @param name 属性名
 * @returns 格式化后的属性名
 */
function formatPropertyName(name: string): string {
  return needsQuotes(name) ? `'${name}'` : name;
}

/**
 * 生成属性定义
 * @param name 属性名
 * @param schema Schema 定义
 * @param required 是否必需
 * @param indent 缩进字符串
 * @returns 属性定义字符串
 */
export function generatePropertyDefinition(
  name: string,
  schema: ISchemaInfo,
  required: boolean,
  indent: string = "\t",
): string {
  const lines: string[] = [];

  // 生成 JSDoc 注释（字段注释统一为单行格式）
  if (schema.description) {
    // 折叠换行避免破坏单行注释
    const desc = schema.description.replace(/\s*\r?\n\s*/g, " ").trim();
    lines.push(`${indent}/** ${desc} */`);
  }

  // 生成属性类型
  const tsType = getTypeScriptType(schema);
  const optionalMark = required ? "" : "?";

  // 格式化属性名（如果包含特殊字符则添加引号）
  const formattedName = formatPropertyName(name);

  lines.push(`${indent}${formattedName}${optionalMark}: ${tsType};`);

  return lines.join("\n");
}

/**
 * 根据 Schema 获取 TypeScript 类型字符串
 * @param schema Schema 定义
 * @returns TypeScript 类型字符串
 */
export function getTypeScriptType(schema: ISchemaInfo): string {
  // 处理 $ref 引用 - 提取接口名
  if (schema.$ref) {
    const refName = schema.$ref.split("/").pop() || "";
    return generateInterfaceName(refName);
  }

  // 处理数组类型
  if (schema.type === "array" && schema.items) {
    const itemType = getTypeScriptType(schema.items);
    return `${itemType}[]`;
  }

  // 处理对象类型（内联对象）
  if (schema.type === "object" && schema.properties) {
    // 对于复杂的内联对象，返回 object 或 Record<string, any>
    return "Record<string, any>";
  }

  // 处理枚举类型
  if (schema.enum) {
    return schema.enum
      .map((v) => (typeof v === "string" ? `'${v}'` : String(v)))
      .join(" | ");
  }

  // 处理 allOf（合并类型）
  if (schema.allOf && schema.allOf.length > 0) {
    return schema.allOf.map((s) => getTypeScriptType(s)).join(" & ");
  }

  // 处理 oneOf/anyOf（联合类型）
  if (schema.oneOf && schema.oneOf.length > 0) {
    return schema.oneOf.map((s) => getTypeScriptType(s)).join(" | ");
  }
  if (schema.anyOf && schema.anyOf.length > 0) {
    return schema.anyOf.map((s) => getTypeScriptType(s)).join(" | ");
  }

  // 基本类型映射
  if (schema.type) {
    return mapOpenAPITypeToTS(schema.type, schema.format);
  }

  // 默认返回 any
  return "any";
}

/**
 * 生成完整的 TypeScript 接口定义
 * @param doc OpenAPI 文档
 * @param endpoint 接口信息
 * @returns 接口定义字符串
 */
export function generateTypeDefinitions(
  doc: IOpenAPIDocument,
  endpoint: IEndpointInfo,
  extractPathParamNames: (path: string) => string[],
): string {
  const interfaces: string[] = [];
  const generatedInterfaces = new Set<string>();
  const pathParamNames = extractPathParamNames(endpoint.path);

  // 生成路径参数接口（来自 URL 中的 {name} 占位符）
  if (pathParamNames.length > 0) {
    const baseName = getPathBaseName(endpoint.path);
    const pathParamsInterfaceName = generateInterfaceName(
      baseName + "PathParams",
    );
    interfaces.push(
      generatePathParamsInterface(
        pathParamsInterfaceName,
        pathParamNames,
        endpoint.parameters,
      ),
    );
    generatedInterfaces.add(pathParamsInterfaceName);
  }

  // 生成请求参数接口（来自 query parameters）
  if (endpoint.parameters && endpoint.parameters.length > 0) {
    const queryParams = endpoint.parameters.filter((p) => p.in === "query");
    if (queryParams.length > 0) {
      const paramsInterfaceName = generateParamsInterfaceName(endpoint);
      interfaces.push(
        generateInterfaceFromParams(
          paramsInterfaceName,
          queryParams,
          endpoint.summary,
        ),
      );
      generatedInterfaces.add(paramsInterfaceName);
    }
  }

  // 生成请求体接口
  if (endpoint.requestBody) {
    interfaces.push(
      ...generateInterfacesFromSchemaRef(
        doc,
        endpoint.requestBody,
        "RequestBody",
        endpoint,
        generatedInterfaces,
      ),
    );
  }

  // 生成响应接口（下载/导出类 Blob 跳过 — Promise<Blob> 不需要额外类型）
  if (endpoint.response && !isBlobResponseType(endpoint.response.contentType)) {
    interfaces.push(
      ...generateInterfacesFromSchemaRef(
        doc,
        endpoint.response,
        "Response",
        endpoint,
        generatedInterfaces,
      ),
    );
  }

  return interfaces.join("\n\n");
}

/**
 * 生成参数接口名称
 * @param endpoint 接口信息
 * @returns 参数接口名称
 */
function generateParamsInterfaceName(endpoint: IEndpointInfo): string {
  return generateInterfaceName(getPathBaseName(endpoint.path) + "QueryParams");
}

/**
 * 从参数列表生成接口定义（带 summary）
 * @param interfaceName 接口名称
 * @param params 参数列表
 * @param summary 接口摘要（用于生成 JSDoc）
 * @returns 接口定义字符串
 */
function generateInterfaceFromParams(
  interfaceName: string,
  params: {
    name: string;
    required: boolean;
    schema: ISchemaInfo;
    description?: string;
  }[],
  summary: string,
): string {
  const lines: string[] = [];

  // 接口 JSDoc 注释 - 只有当 summary 包含中文时才生成有意义的注释
  if (/[\u4e00-\u9fa5]/.test(summary)) {
    lines.push("/**");
    lines.push(` * ${summary}查询参数`);
    lines.push(" */");
  }

  lines.push(`export interface ${interfaceName} {`);

  // 生成每个属性 - 过滤掉带数组索引或点的属性名
  for (const param of params) {
    // 过滤带数组索引的属性名（如 records[0].projectManager）
    if (param.name.includes("[") && param.name.includes(".")) {
      continue;
    }
    const schemaWithDesc: ISchemaInfo = {
      ...param.schema,
      description: param.description || param.schema.description,
    };
    lines.push(generatePropertyDefinition(param.name, schemaWithDesc, param.required));
  }

  // 添加索引签名以支持额外属性
  lines.push("\t[property: string]: any;");
  lines.push("}");

  return lines.join("\n");
}

/**
 * 从 SchemaRef 生成接口定义（递归处理嵌套引用）
 * @param doc OpenAPI 文档
 * @param schemaRef Schema 引用
 * @param suffix 接口名后缀
 * @param endpoint 接口信息
 * @param generatedInterfaces 已生成的接口集合（用于去重）
 * @returns 接口定义字符串数组
 */
function generateInterfacesFromSchemaRef(
  doc: IOpenAPIDocument,
  schemaRef: { $ref?: string; schema?: ISchemaInfo },
  suffix: string,
  endpoint: IEndpointInfo,
  generatedInterfaces: Set<string>,
): string[] {
  if (schemaRef.$ref) {
    return generateFromRef(doc, schemaRef.$ref, generatedInterfaces);
  }

  // 内联 schema 或无 schema 的回退情况
  const baseName = getPathBaseName(endpoint.path);
  const interfaceName = generateInterfaceName(baseName + suffix);
  if (generatedInterfaces.has(interfaceName)) {
    return [];
  }
  generatedInterfaces.add(interfaceName);

  if (schemaRef.schema) {
    return generateInterfaceFromSchema(
      doc,
      interfaceName,
      schemaRef.schema,
      endpoint.summary + suffix,
      generatedInterfaces,
    );
  }

  // schemaRef 既无 $ref 也无 schema（后端文档不规范，但 requestBody 存在）
  // 生成一个空接口，签名里也能传 data
  return [`export interface ${interfaceName} {\n\t[property: string]: any;\n}`];
}

/**
 * 处理 $ref 引用的接口生成
 */
function generateFromRef(
  doc: IOpenAPIDocument,
  ref: string,
  generatedInterfaces: Set<string>,
): string[] {
  const schemaName = ref.split("/").pop() || "";
  const interfaceName = generateInterfaceName(schemaName);
  if (generatedInterfaces.has(interfaceName)) {
    return [];
  }
  generatedInterfaces.add(interfaceName);

  // 获取原始 schema（不递归解析，避免循环引用导致栈溢出）
  const schema = getSchemaByRef(doc, ref);
  if (!schema) {
    return [];
  }
  return generateInterfaceFromSchema(
    doc,
    interfaceName,
    schema,
    schemaName,
    generatedInterfaces,
  );
}

/**
 * 从 Schema 生成接口定义（递归处理嵌套类型）
 * @param doc OpenAPI 文档
 * @param interfaceName 接口名称
 * @param schema Schema 定义
 * @param schemaName Schema 名称（用于回退）
 * @param generatedInterfaces 已生成的接口集合
 * @returns 接口定义字符串数组
 */
function generateInterfaceFromSchema(
  doc: IOpenAPIDocument,
  interfaceName: string,
  schema: ISchemaInfo,
  schemaName: string,
  generatedInterfaces: Set<string>,
): string[] {
  const interfaces: string[] = [];
  const lines: string[] = [];

  // 接口 JSDoc 注释 - 只有当存在有意义的描述时才生成
  const schemaDescription =
    schema.description || getSchemaDescriptionByName(doc, schemaName);
  if (schemaDescription) {
    lines.push("/**");
    lines.push(` * ${schemaDescription}`);
    lines.push(" */");
  }
  // 如果没有描述，不生成无意义的注释（如 "IXxx，Xxx"）

  lines.push(`export interface ${interfaceName} {`);

  // 获取必需属性列表
  const requiredProps = new Set(schema.required || []);

  // 生成每个属性 - 使用原始 schema（未解析的）来保留 $ref 信息
  // 同时过滤分页框架内部字段
  if (schema.properties) {
    const filteredProperties = filterPaginationFields(schema.properties);
    // 预计算原始 schema，避免在每个属性里重复解析
    const originalSchema = doc.components?.schemas?.[schemaName];
    const originalProps = originalSchema?.properties;
    for (const [propName, propSchema] of Object.entries(filteredProperties)) {
      const isRequired = requiredProps.has(propName);

      // 获取原始 schema（可能包含 $ref）用于类型生成
      const originalPropSchema = originalProps?.[propName] || propSchema;
      lines.push(generatePropertyDefinition(propName, originalPropSchema, isRequired));

      // 递归处理嵌套的 $ref 引用（只处理 $ref，不处理已解析的 properties）
      collectNestedInterfaces(doc, originalPropSchema, generatedInterfaces, interfaces, 0);
    }
  }

  // 添加索引签名以支持额外属性
  lines.push("\t[property: string]: any;");
  lines.push("}");

  // 当前接口放在最前面
  interfaces.unshift(lines.join("\n"));

  return interfaces;
}

/**
 * 根据 $ref 路径获取原始 schema（不递归解析）
 * @param doc OpenAPI 文档
 * @param ref $ref 路径
 * @returns 原始 schema 或 undefined
 */
function getSchemaByRef(
  doc: IOpenAPIDocument,
  ref: string,
): ISchemaInfo | undefined {
  // 解析 $ref 路径，格式为 "#/components/schemas/SchemaName"
  const refPath = ref.replace(/^#\//, "").split("/");

  let cursor: unknown = doc;
  for (const segment of refPath) {
    if (cursor && typeof cursor === "object" && segment in cursor) {
      cursor = (cursor as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }

  if (!cursor || typeof cursor !== "object") {
    return undefined;
  }

  return cursor as ISchemaInfo;
}

/**
 * 根据 schema 名称获取其 description
 * @param doc OpenAPI 文档
 * @param schemaName Schema 名称
 * @returns description 字符串或 undefined
 */
function getSchemaDescriptionByName(
  doc: IOpenAPIDocument,
  schemaName: string,
): string | undefined {
  if (!schemaName || !doc.components?.schemas) {
    return undefined;
  }
  return doc.components.schemas[schemaName]?.description;
}

/**
 * 过滤分页框架内部字段和带数组索引/点的属性
 * @param properties Schema 属性对象
 * @returns 过滤后的属性对象
 */
export function filterPaginationFields(
  properties: Record<string, ISchemaInfo>,
): Record<string, ISchemaInfo> {
  const filtered: Record<string, ISchemaInfo> = {};

  for (const key in properties) {
    // 过滤分页框架内部字段
    if (PAGINATION_INTERNAL_FIELDS.includes(key)) {
      continue;
    }
    // 过滤带数组索引的属性名（如 records[0].projectManager）
    if (key.includes("[") && key.includes("]")) {
      continue;
    }
    // 过滤带点的属性名（如 deptBudget.deptOccupiedBudget）
    if (key.includes(".")) {
      continue;
    }
    filtered[key] = properties[key];
  }

  return filtered;
}

/**
 * 收集嵌套的接口定义
 * @param doc OpenAPI 文档
 * @param schema Schema 定义
 * @param generatedInterfaces 已生成的接口集合
 * @param interfaces 接口定义数组
 * @param depth 当前递归深度（防止无限递归）
 */
function collectNestedInterfaces(
  doc: IOpenAPIDocument,
  schema: ISchemaInfo,
  generatedInterfaces: Set<string>,
  interfaces: string[],
  depth: number = 0,
): void {
  // 防止过深的递归（最大深度 10 层）
  if (depth > 10) {
    return;
  }

  // 处理 $ref 引用 - 只处理原始的 $ref，不处理已解析的
  if (schema.$ref) {
    interfaces.push(...generateFromRef(doc, schema.$ref, generatedInterfaces));
    return; // $ref 处理完毕，不再继续处理其他属性
  }

  // 处理数组类型的 items
  if (schema.type === "array" && schema.items) {
    collectNestedInterfaces(
      doc,
      schema.items,
      generatedInterfaces,
      interfaces,
      depth + 1,
    );
  }

  // 注意：不再递归处理 properties，因为这会导致无限递归
  // properties 中的 $ref 会在 generateInterfaceFromSchema 中通过原始 schema 处理
}

/**
 * 生成类型定义（带去重功能，用于批量生成）
 * @param doc OpenAPI 文档
 * @param endpoint 接口信息
 * @param generatedInterfaces 已生成的接口集合（用于去重）
 * @returns 类型定义字符串
 */
export function generateTypeDefinitionsForBatch(
  doc: IOpenAPIDocument,
  endpoint: IEndpointInfo,
  generatedInterfaces: Set<string>,
  extractPathParamNames: (path: string) => string[],
): string {
  const interfaces: string[] = [];
  const pathParamNames = extractPathParamNames(endpoint.path);

  // 生成路径参数接口（来自 URL 中的 {name} 占位符）
  if (pathParamNames.length > 0) {
    const baseName = getPathBaseName(endpoint.path);
    const pathParamsInterfaceName = generateInterfaceName(
      baseName + "PathParams",
    );
    if (!generatedInterfaces.has(pathParamsInterfaceName)) {
      interfaces.push(
        generatePathParamsInterface(
          pathParamsInterfaceName,
          pathParamNames,
          endpoint.parameters,
        ),
      );
      generatedInterfaces.add(pathParamsInterfaceName);
    }
  }

  // 生成请求参数接口（来自 query parameters）
  if (endpoint.parameters && endpoint.parameters.length > 0) {
    const queryParams = endpoint.parameters.filter((p) => p.in === "query");
    if (queryParams.length > 0) {
      const paramsInterfaceName =
        generateInterfaceName(getPathBaseName(endpoint.path) + "QueryParams");
      if (!generatedInterfaces.has(paramsInterfaceName)) {
        interfaces.push(
          generateInterfaceFromParams(
            paramsInterfaceName,
            queryParams,
            endpoint.summary,
          ),
        );
        generatedInterfaces.add(paramsInterfaceName);
      }
    }
  }

  // 生成请求体接口
  if (endpoint.requestBody) {
    interfaces.push(
      ...generateInterfacesFromSchemaRef(
        doc,
        endpoint.requestBody,
        "RequestBody",
        endpoint,
        generatedInterfaces,
      ),
    );
  }

  // 生成响应接口（下载/导出类 Blob 跳过 — Promise<Blob> 不需要额外类型）
  if (endpoint.response && !isBlobResponseType(endpoint.response.contentType)) {
    interfaces.push(
      ...generateInterfacesFromSchemaRef(
        doc,
        endpoint.response,
        "Response",
        endpoint,
        generatedInterfaces,
      ),
    );
  }

  return interfaces.join("\n\n");
}

/**
 * 生成路径参数接口
 * @param interfaceName 接口名
 * @param paramNames URL 中提取的参数名列表
 * @param parameters OpenAPI parameters 定义（用于查找每个 path 参数的类型）
 * @returns 接口定义字符串
 */
export function generatePathParamsInterface(
  interfaceName: string,
  paramNames: string[],
  parameters?: IParameterInfo[],
): string {
  const lines: string[] = [];

  lines.push("/**");
  lines.push(` * 路径参数`);
  lines.push(" */");
  lines.push(`export interface ${interfaceName} {`);

  for (const name of paramNames) {
    // 优先从 parameters 中找定义
    const paramDef = parameters?.find(
      (p) => p.in === "path" && p.name === name,
    );
    let tsType = "string"; // path 参数默认 string
    let desc = "";
    if (paramDef) {
      tsType = getTypeScriptType(paramDef.schema);
      desc = paramDef.description || paramDef.schema.description || "";
    }
    if (desc) {
      const cleanDesc = desc.replace(/\s*\r?\n\s*/g, " ").trim();
      lines.push(`\t/** ${cleanDesc} */`);
    }
    lines.push(`\t${name}: ${tsType};`);
  }

  // 索引签名以支持额外属性
  lines.push("\t[property: string]: any;");
  lines.push("}");

  return lines.join("\n");
}
