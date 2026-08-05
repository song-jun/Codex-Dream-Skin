/**
 * 业务通用基础词条（管理、矩阵、辅助、停车、智能、考勤等）
 *
 * 自动拆分自原 dictBusiness.ts（2026-06-25）
 * 同 key 重复会 TS 编译报错，修改时请先确认该字未在其它分区登记。
 */
const dict: Record<string, string> = {
  管理: "admin",
  矩阵: "matrix",
  辅助: "assist",
  停车: "parking",
  智能: "smart",
  智慧: "wisdom",
  监测: "monitor",
  卡: "card",
  投诉: "complain",
  建议: "suggest",
  安排: "arrange",
  病历: "record",
  挂号: "register",
  处方: "recipe",
  库存: "stock",
  盘点: "stocktake",
  券: "coupon",
  发放: "issue",
  物流: "logistics",
  跟踪: "track",
  配送: "deliver",
  考勤: "attend",
  薪资: "salary",
  绩效: "perf",
  考核: "assess",
  招聘: "recruit",
  入职: "onboard",
  离职: "offboard",
  办理: "handle",
  讨论: "discuss",
  举报: "report",
  处理: "process",
  投放: "launch",
  生成: "generate",
  提成: "commission",
  计算: "calc",
};

export default dict;
