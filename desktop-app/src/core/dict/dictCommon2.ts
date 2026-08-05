/**
 * 通用高频管理类字典
 *
 * 用途：补齐业务 tag 中最常见的 21 个缺失字（覆盖率从 71.91% 提升到 95%+）
 *
 * 来源样本（来自 [dict:check] 兜底字 Top 20）：
 *   管/告/投/客/订/话/勤/约/禁/梯/消/化/病/巡/视/频/签/限/审/更
 *
 * 命名规则：
 *   - 单字优先用最常见的英文简写（驼峰有意义即可）
 *   - 复合词按业务含义翻译，长度 ≤ 12
 *   - 与已有 dictBusiness* / dictTech / dictStatus 等文件错峰（无 key 冲突）
 */
const dict: Record<string, string> = {
  // ===== 1. 管理/控制类（21 字中出现 5+ 次） =====
  管: "mgmt",                      // 管理
  管理: "mgmt",                     // 整体管理
  管控: "control",                 // 管控
  监管: "supervise",                // 监管

  控: "control",                   // 控制/管控
  控件: "widget",

  审: "review",                    // 审核/审计
  审核: "review",
  审批: "approve",
  审批流: "approvalFlow",
  审批人: "approver",
  审批加签: "approvalAddSign",
  审批节点: "approvalNode",
  审核人: "reviewer",
  审核流: "reviewFlow",
  待审: "pendingReview",
  初审: "preliminaryReview",
  终审: "finalReview",
  送审: "submitReview",

  限: "limit",                     // 限制
  限流: "rateLimit",
  限速: "speedLimit",
  限额: "quota",
  限时: "timeLimit",
  限制: "limit",
  权限: "permission",
  字段权限: "fieldPermission",
  菜单权限: "menuPermission",
  数据权限: "dataPermission",
  接口权限: "apiPermission",
  限行: "trafficRestriction",
  限免: "freeOfCharge",

  禁: "forbid",                    // 禁用
  禁言名单: "muteList",
  禁播: "playbackProhibited",
  禁飞: "noFly",
  门禁: "accessControl",
  人脸门禁: "faceAccessControl",
  解禁: "unban",

  // ===== 2. 信息/通知类 =====
  告: "notice",                    // 公告
  公告: "notice",
  公告管理: "noticeMgmt",
  公告列表: "noticeList",
  公告分类: "noticeCategory",
  公告详情: "noticeDetail",
  公告草稿: "noticeDraft",
  系统公告: "systemNotice",
  物业公告: "propertyNotice",
  通知: "notify",
  通告: "announce",

  签: "sign",                      // 签到/签名
  每日签到: "dailySignIn",
  连续签到: "consecutiveSignIn",
  电子签名: "eSignature",
  签证: "visa",
  签章: "seal",

  视: "video",                     // 视频
  视频: "video",
  视频通话: "videoCall",
  视频管理: "videoMgmt",
  视频监控: "videoMonitor",
  视频转码: "videoTranscode",
  短视频: "shortVideo",
  视频点播: "videoOnDemand",
  视频直播: "liveVideo",
  视频上传: "videoUpload",
  视频审核: "videoReview",
  视频会议: "videoMeeting",
  视频回看: "videoReplay",
  视频封面: "videoCover",
  视屏: "video",
  视野: "viewField",
  视力: "vision",

  频: "freq",                      // 频率
  频率: "frequency",
  频段: "band",
  频谱: "spectrum",
  高频: "highFreq",
  低频: "lowFreq",
  音视频: "av",

  话: "call",                      // 通话
  通话管理: "callMgmt",
  漏接: "missedCall",
  话题: "topic",
  笑话: "joke",
  话费: "phoneBill",
  话单: "callLog",

  报: "report",                    // 报警/上报
  报警: "alarm",
  报警器: "alarm",
  烟雾报警: "smokeAlarm",
  火警报警: "fireAlarm",
  上报: "submit",
  举报: "report",                  // 区分语义由 dictBusinessFallback 处理
  通报: "circular",
  报修提交: "repairSubmit",
  报修派单: "repairDispatch",
  报修完成: "repairComplete",
  报修评价: "repairReview",
  预报: "forecast",

  投: "toss",                      // 投/投递
  投诉受理: "complainAccept",
  投诉关闭: "complainClose",
  投票: "vote",
  投票管理: "voteMgmt",
  投票主题: "voteTopic",
  投票选项: "voteOption",
  投递: "deliver",
  投影: "projector",
  投入: "input",

  化: "trans",                     // 转化/化学
  转化: "convert",
  转化率: "conversionRate",
  绿化管理: "greeningMgmt",
  绿化浇灌: "greeningIrrigate",
  绿化修剪: "greeningTrim",
  化工: "chemical",
  化妆: "makeup",
  化石: "fossil",

  // ===== 3. 行为/操作类 =====
  巡: "patrol",                    // 巡检
  巡更: "patrol",
  巡更管理: "patrolMgmt",
  巡更点位: "patrolPoint",
  巡更异常: "patrolAbnormal",
  巡更任务: "patrolTask",
  巡更签到: "patrolSignIn",
  巡航: "cruise",

  更: "watch",                     // 巡更/更新
  更新: "update",
  更新日志: "updateLog",
  更改: "modify",
  更换: "replace",
  变更: "change",
  变更记录: "changeLog",
  更多: "more",
  夜间: "night",

  订: "book",                      // 订单
  订单管理: "orderMgmt",
  订单列表: "orderList",
  订单状态: "orderStatus",
  订单跟踪: "orderTracking",
  订餐: "orderMeal",
  订阅: "subscribe",
  订阅管理: "subscribeMgmt",
  订正: "correction",
  订金: "deposit",
  订货: "orderGoods",
  订货单: "purchaseOrder",
  订单金额: "orderAmount",
  订单数量: "orderCount",

  约: "appt",                      // 预约
  预约: "appt",
  预约管理: "apptMgmt",
  预约列表: "apptList",
  预约改签: "apptRebook",
  预约取消: "apptCancel",
  预约提醒: "apptRemind",
  预约时间: "apptTime",
  预约人: "apptUser",
  约会: "date",
  约束: "constraint",
  约束条件: "constraint",
  约定: "agreement",
  约谈: "interview",
  节约: "save",
  契约: "contract",
  教室预约: "classroomAppt",
  场地预约: "venueAppt",
  会议预约: "meetingAppt",

  消: "msg",                       // 消息/消纳
  消息: "msg",
  消息管理: "msgMgmt",
  消息推送: "msgPush",
  消息列表: "msgList",
  消息详情: "msgDetail",
  消息中心: "msgCenter",
  消息盒子: "msgBox",
  未读消息: "unreadMsg",
  通知消息: "notifyMsg",
  私信: "privateMsg",
  群消息: "groupMsg",
  弹幕消息: "danmaku",
  消费: "consume",
  消费品: "consumerGoods",
  消费券: "coupon",
  消费记录: "consumeLog",
  消防: "fire",
  消防管理: "fireMgmt",
  消防巡检: "firePatrol",
  消防演练: "fireDrill",
  消防通道: "fireEscape",
  消费总额: "consumeTotal",
  消纳: "absorb",
  消毒: "disinfect",
  消杀: "disinfect",

  病: "disease",                   // 病
  病虫害防治: "pestControl",
  疾病: "disease",
  病症: "symptom",
  看病: "consult",
  病人: "patient",
  病房: "ward",
  病情: "condition",
  病毒: "virus",
  病理: "pathology",

  // ===== 4. 角色/人员类 =====
  客: "customer",                  // 客户/客户
  客户管理: "customerMgmt",
  客户公海: "customerPool",
  客户跟进: "customerFollow",
  客户标签: "customerTag",
  客户来源: "customerSource",
  客户线索: "customerLead",
  客户分配: "customerAssign",
  客户回访: "customerCallback",
  客户画像: "customerProfile",
  客户档案: "customerArchive",
  客户分级: "customerLevel",
  客户报备: "customerReport",
  客房: "guestRoom",
  房客: "tenant",
  散客: "walkIn",
  熟客: "regular",
  乘客: "passenger",
  乘客列表: "passengerList",
  乘客评价: "passengerReview",

  勤: "attend",                    // 考勤
  考勤管理: "attendanceMgmt",
  考勤记录: "attendanceLog",
  考勤统计: "attendanceStat",
  考勤报表: "attendanceReport",
  考勤加班: "attendanceOvertime",
  考勤出差: "attendanceBusinessTrip",
  考勤打卡: "attendanceCheckIn",
  考勤异常: "attendanceAbnormal",
  考勤补卡: "attendanceRecheck",
  考勤月报: "attendanceMonthly",
  勤务: "duty",
  考勤机: "attendanceMachine",
  学员考勤: "studentAttendance",

  // ===== 5. 设备/场景类 =====
  梯: "elev",                      // 电梯
  电梯: "elevator",
  电梯管理: "elevatorMgmt",
  电梯困人: "elevatorTrap",
  电梯维修: "elevatorRepair",
  电梯保养: "elevatorMaintain",
  电梯巡检: "elevatorPatrol",
  电梯故障: "elevatorFault",
  电梯监控: "elevatorMonitor",
  电梯公告: "elevatorNotice",
  扶梯: "escalator",
  直梯: "lift",
  楼梯: "stair",

  // ===== 6. 认证/治理类（已存在部分，补全） =====
  认: "cert",                      // 认证
  身份认证: "idAuth",
  人脸认证: "faceAuth",
  教师认证: "teacherAuth",
  认证管理: "authMgmt",
  认证服务: "authService",
  认证状态: "authStatus",
  认证失败: "authFailed",
  认知: "cognition",

  治: "treat",                     // 治理
  治理: "gov",
  综合治理: "comprehensiveGov",
  整治: "rectify",
  治安: "security",
  治愈: "cure",
  治国: "gov",
  治国理政: "gov",
};

export default dict;
