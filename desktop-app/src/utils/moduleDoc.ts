/**
 * 模块文档生成工具（用于一键全部导出）
 * 包含：
 * 1. buildTagToDirMap: 中文 tag → 唯一英文目录名（冲突自动加 _2、_3 后缀）
 * 2. buildModuleReadme: 单模块 README.md
 * 3. buildModulesMapDoc: 根目录 MODULES.md（文件夹 ↔ 模块对照表）
 */
import { sanitizeForDirName } from "@/core/rules";
import type { IEndpointInfo } from "@/core/types";

/**
 * tag → 英文目录名
 * 冲突处理：第二次出现同名时附加 _2，第三次 _3，以此类推
 */
export async function buildTagToDirMap(
  endpoints: IEndpointInfo[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const usedNames = new Set<string>();
  for (const ep of endpoints) {
    const tag = ep.tag;
    if (!tag || map.has(tag)) continue;
    let dirName = await sanitizeForDirName(tag);
    let suffix = 2;
    const base = dirName;
    while (usedNames.has(dirName)) {
      dirName = `${base}_${suffix++}`;
    }
    usedNames.add(dirName);
    map.set(tag, dirName);
  }
  return map;
}

function formatNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/**
 * 单模块 README.md
 * 标注：模块名（中文）/ 目录名（英文）/ 接口列表
 */
export function buildModuleReadme(
  tag: string,
  dirName: string,
  endpoints: IEndpointInfo[],
): string {
  const now = formatNow();
  const lines: string[] = [];
  lines.push(`# ${tag}`);
  lines.push("");
  lines.push(`> 目录：\`${dirName}/\``);
  lines.push(`> 接口数：${endpoints.length}`);
  lines.push(`> 生成时间：${now}`);
  lines.push("");
  lines.push("## 接口列表");
  lines.push("");
  lines.push("| 方法 | 路径 | 名称 |");
  lines.push("| --- | --- | --- |");
  for (const ep of endpoints) {
    const summary = (ep.summary || "").replace(/\|/g, "\\|");
    lines.push(`| ${ep.method.toUpperCase()} | \`${ep.path}\` | ${summary} |`);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * 根目录 MODULES.md（只列文件夹 ↔ 模块对应关系）
 */
export function buildModulesMapDoc(
  summaries: Array<{ tag: string; dir: string; count: number }>,
): string {
  const now = formatNow();
  const lines: string[] = [];
  lines.push("# Modules Map");
  lines.push("");
  lines.push(`> 生成时间：${now}`);
  lines.push(`> 模块数：${summaries.length}`);
  lines.push("");
  lines.push("## 目录 ↔ 模块");
  lines.push("");
  lines.push("| 文件夹（英文） | 模块（中文） | 接口数 |");
  lines.push("| --- | --- | --- |");
  // 按目录名排序，输出稳定
  const sorted = [...summaries].sort((a, b) => a.dir.localeCompare(b.dir));
  for (const s of sorted) {
    const tag = s.tag.replace(/\|/g, "\\|");
    const dir = s.dir === "." ? "_root_（根目录）" : `\`${s.dir}/\``;
    lines.push(`| ${dir} | ${tag} | ${s.count} |`);
  }
  lines.push("");
  return lines.join("\n");
}
