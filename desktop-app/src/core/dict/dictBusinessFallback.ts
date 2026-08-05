/**
 * 最后一轮消除兜底（针对真实业务 tag 样本）
 *
 * 自动拆分自原 dictBusiness.ts（2026-06-25）
 * 同 key 重复会 TS 编译报错，修改时请先确认该字未在其它分区登记。
 */
const dict: Record<string, string> = {
  // ============ 最后一轮消除兜底（针对真实业务 tag 样本）============
  // 摊 / 分摊（能耗分摊等）
  摊: "share",
  分摊: "apportion",
  摊销: "amortize",
  摊主: "stallHolder",

  // 偏 / 偏好（用户偏好等）
  偏: "preference",
  偏好: "preference",
  偏好设置: "prefSetting",
  偏色: "colorCast",
  偏离度: "deviation",

  // 零 / 清零（积分清零等）
  零: "zero",
  清零: "zeroClear",
  归零: "zeroReset",
  零钱: "smallChange",
  零点: "zeroPoint",
  零售: "retail",

  // 每 / 每日（每日签到等）
  每: "each",
  每日: "daily",
  每周: "weekly",
  每月: "monthly",
  每年: "yearly",
  每位: "eachOne",
  每个: "each",
  每条: "eachItem",
  每次: "eachTime",
  每页: "perPage",
  每秒: "perSecond",
  每分钟: "perMinute",
  每小时: "perHour",

  // 公 / 公海（客户公海等）
  公: "public",
  公海: "publicPool",
  公共: "public",
  公示: "publicity",
  公平: "fair",
  公正: "just",
  公用: "public",
  公开: "open",
  公文: "doc",

  // 继 / 承 / 继承（角色继承等）
  继: "inherit",
  承: "bear",
  继承: "inherit",
  继任: "succession",
  继承人: "heir",
  承诺: "promise",
  承诺书: "letterOfCommit",
  承担: "undertake",
  承办: "host",

  // 钮 / 按钮（按钮权限等）
  钮: "knob",
  按钮: "button",
  旋钮: "knob",
  按钮权限: "btnPermission",

  // 超 / 超时（支付超时等）
  超: "over",
  超时: "timeout",
  超级: "super",
  超出: "exceed",
  超量: "overAmount",
  超额: "excess",
  超级管理员: "superAdmin",
  超时时间: "timeout",
  超时订单: "timeoutOrder",
  超长: "oversize",
  超大: "oversize",

  // 异 / 差异（对账差异等）
  异: "diff",
  差异: "diff",
  异常: "abnormal",
  异动: "abnormalChange",
  异构: "heterogeneous",
  异议: "objection",
  异常处理: "abnormalHandle",
  异常告警: "abnormalAlarm",
  差异对账: "diffReconcile",

  // 核 / 销 / 核销（优惠券核销等）
  核: "verify",
  销: "use",
  核销: "verifyUse",
  核算: "compute",
  核对: "check",
  核实: "verify",
  核准: "approve",
  销毁: "destroy",
  核销记录: "verifyUseLog",
  核销报告: "verifyUseReport",
  销项: "output",
  销项税: "outputTax",

  // 麦 / 连麦（直播间连麦等）
  麦: "mic",
  连麦: "micLink",
  麦序: "micOrder",

  // 叠 / 折叠（评论折叠等）
  叠: "fold",
  折叠: "fold",
  重叠: "overlap",
  叠加: "stack",

  // 语 / 音 / 语音（语音通话等）
  语: "speech",
  音: "audio",
  语音: "voice",
  语调: "tone",
  语种: "language",
  语义: "semantic",
  音量: "volume",
  音色: "timbre",
  语音通话: "voiceCall",
  语音消息: "voiceMsg",
  音频文件: "audioFile",

  // 资 / 料 / 资料（课程资料等）
  资: "material",
  料: "material",
  资料: "material",
  资金: "fund",
  资质: "qualification",
  材料: "material",
  原料: "raw",
  资料库: "materialLib",
  资料管理: "materialMgr",

  // 监 / 监考（考试监考等）
  监: "invigilate",
  监考: "invigilate",
  监管: "supervise",
  监听: "monitor",
  监控: "monitor",
  监督: "supervise",
  监控管理: "monitorMgr",

  // 突 / 冲突（排课冲突等）
  突: "burst",
  冲突: "conflict",
  突然: "sudden",
  突发: "sudden",
  突破: "breakthrough",
  冲突检测: "conflictCheck",
  冲突解决: "conflictResolve",

  // 教 / 教室（教室预约等）
  教: "teach",
  教室: "classroom",
  教学: "teach",
  教材: "textbook",
  教育: "education",
  教务: "academicAffairs",

  // 叫 / 叫号（门诊叫号等）
  叫: "call",
  叫号: "callNumber",
  叫醒: "wake",
  叫做: "called",

  // 效 / 效期（药品效期等）
  效: "effect",
  效期: "expiry",
  效果: "effect",
  效率: "efficiency",
  效益: "benefit",
  无效: "invalid",
  生效: "takeEffect",

  // 预 / 警 / 预警（库存预警等）
  预: "pre",
  警: "alarm",
  预警: "earlyWarn",
  预算: "budget",
  预览: "preview",
  预告: "preview",
  预警规则: "warnRule",
  预警阈值: "warnThreshold",

  // 质 / 检 / 质检（客服质检等）
  质: "quality",
  检: "check",
  质检: "qualityCheck",
  质量: "quality",
  质检报告: "qcReport",
  质检员: "qcStaff",
  检测: "detect",
  检测报告: "detectReport",
  质量检查: "qualityCheck",

  // 屏 / 开屏（开屏广告等）
  屏: "screen",
  开屏: "splash",
  屏幕: "screen",
  屏蔽: "block",
  屏保: "screensaver",
  开屏广告: "splashAd",
  开机: "boot",

  // 激 / 励 / 激励（激励视频广告等）
  激: "motivate",
  励: "encourage",
  激励: "incentive",
  激烈: "intense",
  鼓励: "encourage",
  激励视频: "incentiveVideo",

  // 名 / 名单 / 结果 / 血缘（中奖名单/数据血缘/投票结果等）
  名: "name",
  名单: "nameList",
  果: "result",
  结果: "result",
  血: "blood",
  缘: "edge",
  血缘: "lineage",
  名次: "ranking",
  名称: "name",
  名称管理: "nameMgr",
  数据血缘: "dataLineage",
  投票结果: "voteResult",
  抽奖结果: "lotteryResult",
  比赛结果: "matchResult",
  考试结果: "examResult",

  // 项 / 字典项等
  项: "item",
  字典项: "dictItem",
  项目: "project",
  款项: "project",
  项目管理: "projectMgr",
  项目列表: "projectList",

  // 常 / 常见问题（帮助管理常见问题等）
  常: "common",
  常见: "common",
  常见问题: "faq",
  常规: "regular",
  经常: "often",
  不正常: "abnormal",

  // 手 / 册 / 手册（用户手册等）
  手: "hand",
  册: "volume",
  手册: "manual",
  手机: "mobile",
  手动: "manual",
  操作手册: "opsManual",
  用户手册: "userManual",
  接口手册: "apiManual",

  // 纳 / 采纳（意见采纳等）
  纳: "adopt",
  采纳: "adopt",
  纳入: "include",
  收纳: "store",

  // 控 / 控制（设备远程控制等）
  控: "control",
  控制: "control",
  调控: "regulate",
  远程控制: "remoteControl",
  控制器: "controller",
  控制台: "console",
  设备控制: "deviceControl",
  智能控制: "smartControl",
};

export default dict;
