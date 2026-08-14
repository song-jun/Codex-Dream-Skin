/** 代码预览 Tab 的展示配置。 */
import type { CodePreviewTab } from "@/core/codePreview";

/** 单个预览 Tab 的静态展示信息。 */
export interface PreviewTabOption {
  key: CodePreviewTab;
  label: string;
  copySuccessLabel: string;
}

/** 预览 Tab 固定顺序：标准产物在前，派生预览在后。 */
export const previewTabOptions: readonly PreviewTabOption[] = [
  { key: "type", label: "type.ts", copySuccessLabel: "type.ts" },
  { key: "index", label: "index.ts", copySuccessLabel: "index.ts" },
  { key: "simple", label: "简版", copySuccessLabel: "简版" },
  { key: "minimal", label: "极简版", copySuccessLabel: "极简版" },
];
