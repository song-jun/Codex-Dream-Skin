<!--
  组件名称：SessionsPanel
  组件职责：展示 Dream Skin 连接状态和 Codex 原生会话记录。
  交互边界：会话刷新读取 Codex 索引，会话删除经过确认后由主进程执行。
-->
<script setup lang="ts">
import { Clock, CollectionTag, Delete, Link, Refresh, RefreshRight } from "@element-plus/icons-vue";
import { useWorkbenchContext } from "../composables/useWorkbench";

const {
  snapshot,
  statusTone,
  currentConnection,
  codexSessions,
  codexSessionGroups,
  refresh,
  runAction,
  deleteCodexSession,
  formatDate,
} = useWorkbenchContext();
</script>

<template>
  <section class="hero-row session-hero">
    <div class="hero-copy">
      <div class="eyebrow accent-text">Codex 会话</div>
      <h2>读取真实的 Codex 会话记录</h2>
      <p>列表来自本机 Codex 的 session_index.jsonl，显示会话标题和更新时间。删除操作会同步移除对应的本地会话记录文件。</p>
    </div>
    <div class="session-state"><span class="status-dot" :class="statusTone" /><strong>{{ codexSessions.length }} 个会话</strong><small>实时读取本地 Codex 索引</small></div>
  </section>

  <section class="session-layout">
    <div class="panel current-session-panel">
      <div class="panel-head"><div><div class="eyebrow">当前皮肤连接</div><h3>Dream Skin renderer</h3></div><el-tag effect="plain" :type="currentConnection ? 'success' : 'info'">{{ currentConnection ? "已连接" : "未连接" }}</el-tag></div>
      <div v-if="currentConnection" class="connection-body">
        <div class="connection-identity"><span class="connection-icon"><Link /></span><div><strong>{{ currentConnection.endpoint }}</strong><span>{{ snapshot?.platform === "darwin" ? "macOS" : "Windows" }} · 官方 Codex renderer</span></div></div>
        <div class="session-row"><span>浏览器标识</span><code>{{ currentConnection.browserId ?? "由平台状态管理" }}</code></div>
        <div class="session-row"><span>injector PID</span><code>{{ currentConnection.injectorPid ?? "—" }}</code></div>
        <div class="session-row"><span>连接开始</span><strong>{{ formatDate(currentConnection.startedAt) }}</strong></div>
        <div class="session-actions"><el-button type="primary" :icon="RefreshRight" @click="runAction('start', [], 'Codex Dream Skin 已启动或重启。')">重启并应用</el-button></div>
      </div>
      <el-empty v-else description="启动 Dream Skin 后，这里会显示 renderer 连接。" :image-size="58" />
    </div>

    <div class="panel history-panel">
      <div class="panel-head">
        <div><div class="eyebrow">Codex 原生记录</div><h3>会话列表</h3></div>
        <div class="session-list-actions"><el-icon class="muted-icon"><Clock /></el-icon><el-tooltip content="刷新 Codex 会话" placement="top"><el-button class="icon-button" :icon="Refresh" circle @click="refresh(true)" /></el-tooltip></div>
      </div>
      <div class="history-note">标题和时间来自 Codex 会话索引，不读取消息正文。</div>
      <div v-if="codexSessions.length" class="codex-session-list">
        <section v-for="group in codexSessionGroups" :key="group.key" class="session-group">
          <div class="session-group-head"><strong>{{ group.label }}</strong><small>{{ group.sessions.length }}</small></div>
          <div v-for="session in group.sessions" :key="session.id" class="codex-session-item">
            <span class="session-index-mark"><CollectionTag /></span>
            <div class="history-copy"><strong>{{ session.title }}</strong><span>{{ formatDate(session.updatedAt) }} · {{ session.id }}</span></div>
            <el-tooltip content="删除 Codex 会话" placement="left"><el-button class="delete-button" :icon="Delete" circle @click="deleteCodexSession(session)" /></el-tooltip>
          </div>
        </section>
      </div>
      <el-empty v-else description="没有找到 Codex 会话记录" :image-size="52" />
    </div>
  </section>
</template>
