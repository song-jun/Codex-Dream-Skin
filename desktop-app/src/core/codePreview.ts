/**
 * 代码预览派生器。
 * 仅生成用于阅读和复制的简版内容，不会修改标准 type.ts/index.ts 导出数据。
 */
import type { IGeneratedCode } from "@/core/types";

/** 代码预览可切换的内容类型。 */
export type CodePreviewTab = "type" | "index" | "simple" | "minimal";

/** 预览区展示的四种代码内容。 */
export interface CodePreviewVariants {
  type: string;
  index: string;
  simple: string;
  minimal: string;
}

/** 空预览内容，避免模板层处理空对象。 */
const EMPTY_CODE_PREVIEW_VARIANTS: CodePreviewVariants = {
  type: "",
  index: "",
  simple: "",
  minimal: "",
};

/**
 * 删除 index.ts 中仅服务于 TypeScript 类型的导入声明。
 * @param indexCode 标准生成的 index.ts 内容。
 * @returns 不包含 ./type 类型导入的代码。
 */
function removeTypeImport(indexCode: string): string {
  return indexCode.replace(/import\s*\{[\s\S]*?\}\s*from\s*["']\.\/type["'];?\s*/g, "");
}

/**
 * 将生成函数的参数类型替换为 any，并移除 Promise 返回类型。
 * 生成器的函数签名只包含顶层命名接口，因此可在预览层安全进行替换。
 * @param indexCode 已移除类型导入的 index.ts 内容。
 * @returns 可直接复制的简版请求函数代码。
 */
function simplifyFunctionSignatures(indexCode: string): string {
  return indexCode.replace(
    /(export function\s+\w+\s*\()([^)]*)(\))\s*:\s*Promise<[^>]+>\s*\{/g,
    (_match, opening: string, parameters: string, closing: string) => {
      const simplifiedParameters = parameters.replace(
        /([A-Za-z_$][\w$]*)\s*:\s*[^,)\n]+/g,
        "$1: any",
      );
      return `${opening}${simplifiedParameters}${closing} {`;
    },
  );
}

/**
 * 生成保留 request 与 urlPrefix 声明的简版 index.ts。
 * @param indexCode 标准生成的 index.ts 内容。
 * @returns 移除类型依赖后的简版代码。
 */
export function createSimpleIndexPreview(indexCode: string): string {
  return simplifyFunctionSignatures(removeTypeImport(indexCode)).trim() + "\n";
}

/**
 * 生成仅保留接口说明与请求函数的极简预览。
 * @param simpleIndexCode 简版 index.ts 内容。
 * @returns 不含 import 与 urlPrefix 声明的极简代码。
 */
export function createMinimalIndexPreview(simpleIndexCode: string): string {
  const firstCommentIndex = simpleIndexCode.indexOf("/**");
  return firstCommentIndex >= 0 ? simpleIndexCode.slice(firstCommentIndex).trim() + "\n" : "";
}

/**
 * 根据标准生成结果构造全部预览内容。
 * @param generatedCode 标准生成器输出；为空时返回空预览。
 * @returns type.ts、index.ts、简版与极简版的预览代码。
 */
export function createCodePreviewVariants(
  generatedCode: IGeneratedCode | null,
): CodePreviewVariants {
  if (!generatedCode) return EMPTY_CODE_PREVIEW_VARIANTS;
  const simple = createSimpleIndexPreview(generatedCode.indexFile);
  return {
    type: generatedCode.typeFile,
    index: generatedCode.indexFile,
    simple,
    minimal: createMinimalIndexPreview(simple),
  };
}
