/**
 * 中英对照字典（统一入口）
 *
 * 由各分类字典合并而成。较长的词优先匹配（max-match），
 * 未命中的字由 pinyin 库兜底。
 *
 * 维护说明：
 * - 同义词只登记一次（取最常用义），同一 key 重复会 TS 编译报错
 * - 跨分区重复的 key 应合并到单一分区
 * - 新增分类：在 dict/ 下新建 dictXxx.ts，再 import 进来合并即可
 */
import org from "./dictOrg";
import product from "./dictProduct";
import content from "./dictContent";
import flow from "./dictFlow";
import property from "./dictProperty";
import tech from "./dictTech";
import verb from "./dictVerb";
import status from "./dictStatus";
import time from "./dictTime";
import location from "./dictLocation";
import field from "./dictField";
import businessBase from "./dictBusinessBase";
import businessVerb from "./dictBusinessVerb";
import businessFinance from "./dictBusinessFinance";
import businessSuffix from "./dictBusinessSuffix";
import businessTerm from "./dictBusinessTerm";
import businessCommonChar from "./dictBusinessCommonChar";
import businessHighFreqChar from "./dictBusinessHighFreqChar";
import businessMoreChar from "./dictBusinessMoreChar";
import businessCompound from "./dictBusinessCompound";
import businessFallback from "./dictBusinessFallback";
import common2 from "./dictCommon2";

const CN_DICT: Record<string, string> = {
  ...org,
  ...product,
  ...content,
  ...flow,
  ...property,
  ...tech,
  ...verb,
  ...status,
  ...time,
  ...location,
  ...field,
  ...businessBase,
  ...businessVerb,
  ...businessFinance,
  ...businessSuffix,
  ...businessTerm,
  ...businessCommonChar,
  ...businessHighFreqChar,
  ...businessMoreChar,
  ...businessCompound,
  ...businessFallback,
  ...common2,
};

export default CN_DICT;
export { CN_DICT };
