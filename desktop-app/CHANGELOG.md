# Changelog

<!-- changelog:base f5a0d2d5dc4aecb604d88afd4b7e59a46a4b4c7f -->

## [0.1.5] - 2026-08-05

### 桌面端更新

- this release bumps version to 0.1.4, adds comprehensive API workbench features, environment & token management, new electron APIs, updated changelog, and refactored application menu with feature gated options

## [0.1.4] - 2026-08-05

### 桌面端更新

- 新增工具类：sleep/escapeHtml/clipboard/formatJson等通用工具
- 新增HTTP工具、批量更新、JSON格式化等核心工具
- 新增规则引擎、命名规范、类型映射等代码生成规则
- 新增字典系统、中英互译、业务词汇映射
- 新增文档解析、接口检索、代码生成核心逻辑
- 新增Pinia状态管理、路由配置、全局样式适配
- 新增Electron预加载API、环境变量配置与持久化
- 新增虚拟列表、响应面板等通用组件
- 移除旧版功能页签逻辑，重构为独立API工作台
- 新增完整的代码导出、接口调用、文档浏览能力
- 合并两个应用init
- 更新package.json和package-lock.json的版本号到0.1.3
- 新增自动生成更新日志的脚本并集成到构建流程
- 重构版本历史面板加载逻辑，使用本地CHANGELOG动态展示更新内容
- 优化运行时指纹校验和更新检测逻辑，修复资源路径读取问题
- 移除侧边栏版本号对snapshot的依赖，直接使用appVersion

## [0.1.3] - 2026-08-04

### 桌面端更新

- 版本号更新。

## [0.1.2] - 2026-08-04

### 桌面端更新

- 新增自动生成更新日志的脚本。
- 集成 changelog 生成到 prebuild 和 postversion 流程。
- 重构版本历史面板，从 CHANGELOG.md 动态加载更新内容。
- 移除侧边栏版本号对 snapshot 的依赖，直接使用 appVersion。
- 创建初始 CHANGELOG 文档。

## [0.1.1] - 2026-08-04

### 桌面端工作台

- 新增桌面端版本号显示与原生应用菜单。
- 新增主题状态、运行控制与运行时更新检测。
- 修正左下角版本号来源，固定读取桌面应用版本。

## [0.1.0] - 2026-08-03

### 桌面应用初版

- 新增 Windows 和 macOS 桌面端工作台。
- 支持主题切换、暂停、恢复和还原操作。
- 保留官方 Codex 窗口原生交互与本机 CDP 安全边界。
