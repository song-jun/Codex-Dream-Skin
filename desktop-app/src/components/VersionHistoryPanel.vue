<!--
  组件名称：VersionHistoryPanel
  组件职责：在工作区展示桌面端版本更改时间线。
-->
<script setup lang="ts">
import packageJson from "../../package.json";

const appVersion = packageJson.version;
const versionChanges = [
  {
    version: appVersion,
    date: "2026-08-04",
    title: "桌面端工作台",
    changes: [
      "新增桌面端版本号显示。",
      "新增中文原生菜单。",
      "完善主题状态与运行控制。",
    ],
  },
];
</script>

<template>
  <section class="version-history-page">
    <div class="version-history-page-header">
      <div>
        <div class="eyebrow">CHANGELOG</div>
        <h2>版本更改记录</h2>
        <p>按时间查看 Codex Dream Skin 桌面端的功能更新。</p>
      </div>
      <div class="version-current-mark">
        <span>当前版本</span>
        <strong>v{{ appVersion }}</strong>
      </div>
    </div>

    <el-timeline class="version-timeline">
      <el-timeline-item
        v-for="entry in versionChanges"
        :key="entry.version"
        :timestamp="entry.date"
        placement="top"
        type="primary"
        size="large"
      >
        <div class="version-timeline-entry">
          <div class="version-timeline-heading">
            <strong>v{{ entry.version }}</strong>
            <span>{{ entry.title }}</span>
          </div>
          <ul>
            <li v-for="change in entry.changes" :key="change">{{ change }}</li>
          </ul>
        </div>
      </el-timeline-item>
    </el-timeline>
  </section>
</template>
