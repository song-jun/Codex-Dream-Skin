/**
 * 文件夹/模块命名规则（小驼峰英文）
 *
 * 流程：取末段（最具体的模块名，避免祖先段重复）
 *   → 中英切分 → 中文段 max-match 翻译 / ASCII 段拆 camelCase 词
 *   → 去重保序 → 拼小驼峰 → 兜底空字符串 `module` + 5 字母 hash
 *
 * 例：
 *   "物业公告管理/公告列表"        → "propertyNoticeMgmt/noticeList"
 *   "platform/app/dept-tree"        → "appDeptTree"
 *   "用户管理"                      → "userMgmt"
 */

import CN_DICT from "../dict";

/**
 * 稳定的 32-bit 哈希 → 5 字符纯字母 [a-z]
 * 用于字典未覆盖到的中文字符 fallback
 */
export function shortAlphaHash(s: string): string {
  let h = 5381 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = ((((h << 5) + h) ^ s.charCodeAt(i)) >>> 0);
  }
  let n = h >>> 0;
  let out = "";
  for (let i = 0; i < 5; i++) {
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

/**
 * 把一段连续中文做 max-match 切分：
 * - 命中的整词 → 字典英文
 * - 未命中的字 → 用 pinyin 库转无音调拼音（每字一个词）
 * 这样字典外的中文也能得到稳定、可读的驼峰名（如 `gongGao`）
 *
 * 性能优化：
 * - SORTED_KEYS / KEYS_BY_FIRST_CHAR 在模块加载时构建一次（O(n)），避免每次调用都 sort
 * - 按首字符分组后，位置 i 的匹配只需检查 4~10 个候选 key（平均），从 O(n) 降到 ~O(1)
 */
const SORTED_KEYS: string[] = Object.keys(CN_DICT).sort(
  (a, b) => b.length - a.length
);
const KEYS_BY_FIRST_CHAR: Map<string, string[]> = new Map();
for (const k of SORTED_KEYS) {
  const c = k[0];
  let arr = KEYS_BY_FIRST_CHAR.get(c);
  if (!arr) {
    arr = [];
    KEYS_BY_FIRST_CHAR.set(c, arr);
  }
  arr.push(k);
}

/**
 * 内部使用：把一段连续中文翻译成英文单词数组
 */
export async function translateChinese(s: string): Promise<string[]> {
  const out: string[] = [];
  let pinyinFn: typeof import("pinyin").pinyin | undefined;
  let i = 0;
  while (i < s.length) {
    const candidates = KEYS_BY_FIRST_CHAR.get(s[i]);
    let matched = false;
    if (candidates) {
      for (const k of candidates) {
        if (s.startsWith(k, i)) {
          out.push(CN_DICT[k]);
          i += k.length;
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      // 收集相邻未识别字一起转拼音
      let j = i + 1;
      while (j < s.length) {
        const cands = KEYS_BY_FIRST_CHAR.get(s[j]);
        if (cands && cands.some(k => s.startsWith(k, j))) break;
        j++;
      }
      const slice = s.slice(i, j);
      pinyinFn ??= (await import("pinyin")).pinyin;
      const py = pinyinFn(slice, { style: "normal" });
      for (const word of py) {
        if (word[0]) out.push(word[0]);
      }
      i = j;
    }
  }
  return out;
}

/**
 * 把 ASCII 英文段按"小写→大写"边界切分（camelCase 拆分，保留连续大写）
 * 例：`UserAPI` → `["User", "API"]`；`user` → `["user"]`；`userManagement` → `["user", "Management"]`；`AI` → `["AI"]`
 */
export function splitAsciiWords(s: string): string[] {
  if (!s) return [];
  return s.split(/(?<=[a-z])(?=[A-Z])/).filter(Boolean);
}

/**
 * 单词数组转 camelCase（首段全小写、后续段首字母大写、其余小写）
 */
export function toCamelCase(words: string[]): string {
  if (words.length === 0) return "";
  return words
    .map(w => w.toLowerCase())
    .map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join("");
}

/**
 * 将 tag 转成**小驼峰**英文文件夹名（翻译中文 + 简洁）
 * 流程：取末段（最具体的模块名，避免祖先段重复）→ 字典翻译/拆词 → 去重保序 → camelCase
 */
export async function sanitizeForDirName(tag: string): Promise<string> {
  // 末段优先：取最后一段，但末段若是纯数字/单字符（无语义），向前推取第一个有意义段
  const segments = tag.split(/[\\/]/);
  let last = "";
  for (let i = segments.length - 1; i >= 0; i--) {
    const stripped = segments[i].replace(/[\d\s_\-.]/g, "");
    const meaningful =
      /[\u4e00-\u9fa5]/.test(stripped) ||
      (stripped.length >= 2 && /[A-Za-z]/.test(stripped));
    if (meaningful) {
      last = segments[i];
      break;
    }
  }
  if (!last) last = segments[segments.length - 1] || tag;

  const re = /([A-Za-z]+)|([\u4e00-\u9fa5]+)/g;
  const words: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(last)) !== null) {
    if (m[1]) {
      words.push(...splitAsciiWords(m[1]).map(w => w.toLowerCase()));
    } else if (m[2]) {
      words.push(...(await translateChinese(m[2])));
    }
  }
  // 去重保序，并把含内部大写的 camelCase 词（如 "projectMgr"）拆成 ["project","Mgr"]
  // 否则 toCamelCase 全小写后会变成 "projectmgr"，丢失字典里约定的内部大写
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const w of words) {
    const parts = /[A-Z]/.test(w.slice(1)) ? splitAsciiWords(w) : [w];
    for (const p of parts) {
      if (!seen.has(p)) {
        seen.add(p);
        uniq.push(p);
      }
    }
  }
  const out = toCamelCase(uniq);
  return out || "module" + shortAlphaHash(tag);
}
