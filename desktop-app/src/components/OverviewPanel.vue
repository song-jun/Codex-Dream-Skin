<!--
  组件名称：OverviewPanel
  组件职责：展示当前主题、背景图片、外观参数和已保存主题。
  交互边界：所有修改先写入工作台草稿，只有点击“应用”才调用 Electron。
-->
<script setup lang="ts">
import { Check, Delete, EditPen, Lock, Moon, Picture, Refresh, RefreshRight, Setting, SwitchButton, VideoPause, VideoPlay } from "@element-plus/icons-vue";
import { useWorkbenchContext } from "../composables/useWorkbench";

const {
  snapshot,
  activeTheme,
  themes,
  codexSessions,
  installationMissing,
  themeUnavailable,
  canPause,
  canResume,
  managementImageUrl,
  art,
  themeAppearanceLabel,
  pendingImagePath,
  pendingImageName,
  editingMode,
  editingModeLabel,
  editingOpacityVariable,
  editingMaskOpacity,
  defaultEditingMaskOpacity,
  editingCaretVariable,
  editingCaretColor,
  defaultCaretColor,
  editingAccent,
  editingAccentInk,
  editingImageLuma,
  themeSettings,
  settingsDirty,
  themeDefaults,
  chooseThemeId: switchingThemeId,
  runAction,
  restoreSkin,
  installDreamSkin,
  chooseBackgroundImage,
  saveCurrentTheme,
  clearThemeSetting,
  resetThemeSettings,
  applyThemeSettings,
  chooseTheme,
  notifyThemeStart,
  renameTheme,
  deleteTheme,
  previewStyle,
  themeValue,
  formatDate,
} = useWorkbenchContext();
</script>

<template>
  <section class="hero-row">
    <div class="hero-copy">
      <div class="eyebrow accent-text">主题工作台</div>
      <h2>让 Codex 更像你的工作台</h2>
      <p>主题、背景图和阅读保护层会通过现有 watcher 实时同步到 Codex，原生侧栏、项目选择、输入框和任务内容保持可交互。</p>
    </div>
    <div class="hero-actions">
      <el-button v-if="installationMissing" type="primary" :icon="Setting" @click="installDreamSkin">安装 Dream Skin 运行时</el-button>
      <el-button v-else type="primary" :icon="RefreshRight" @click="runAction('start', [], 'Codex Dream Skin 已启动或重启。')">启动 / 重启</el-button>
      <el-button v-if="canPause" class="warning-button" :icon="VideoPause" @click="runAction('pause', [], '皮肤已暂停，Codex 保持运行。')">暂停皮肤</el-button>
      <el-button v-else-if="canResume" class="resume-button" type="primary" plain :icon="VideoPlay" @click="runAction('resume', [], '皮肤已恢复。')">恢复皮肤</el-button>
      <el-button v-if="!installationMissing" class="danger-button" :icon="SwitchButton" @click="restoreSkin">恢复官方外观</el-button>
    </div>
  </section>

  <section class="stat-strip">
    <div class="stat-cell"><span>当前主题</span><strong>{{ activeTheme?.name ?? "未读取" }}</strong><small>当前主题</small></div>
    <div class="stat-cell"><span>Codex 进程</span><strong>{{ snapshot?.codexRunning ? "运行中" : "未检测到" }}</strong><small>官方应用</small></div>
    <div class="stat-cell"><span>Codex 会话</span><strong>{{ codexSessions.length }}</strong><small>会话索引</small></div>
    <div class="stat-cell"><span>最后状态</span><strong>{{ formatDate(snapshot?.stateUpdatedAt) }}</strong><small>状态文件</small></div>
  </section>

  <section class="workspace-grid">
    <div class="panel preview-panel">
      <div class="panel-head">
        <div><div class="eyebrow">当前预览</div><h3>{{ activeTheme?.name ?? "等待主题状态" }}</h3></div>
        <el-tag effect="plain" :type="snapshot?.session === 'active' ? 'success' : 'info'">{{ snapshot?.session === "active" ? "实时应用" : "待应用" }}</el-tag>
      </div>
      <div class="preview-frame" :class="{ empty: !managementImageUrl }" :style="previewStyle(activeTheme, managementImageUrl)">
        <div v-if="managementImageUrl" class="preview-shade" />
        <div v-if="managementImageUrl" class="preview-caption"><span>当前主题</span><strong>{{ themeValue(activeTheme, "tagline", "Codex Dream Skin") }}</strong><small>{{ themeValue(activeTheme, "image", "") }}</small></div>
        <div v-else class="preview-empty"><span class="preview-empty-icon"><Picture /></span><strong>没有可显示的主题预览</strong><small>连接 Dream Skin 后，这里会显示当前背景图片。</small></div>
      </div>
      <div class="preview-meta"><span><Picture />{{ themeValue(activeTheme, "image", "未选择背景图") }}</span><span><Moon />{{ themeAppearanceLabel }}</span><span><Setting />{{ String(art.taskMode ?? "auto") }}</span></div>
    </div>

    <div class="panel inspector-panel">
      <div class="panel-head">
        <div><div class="eyebrow">主题信息</div><h3>外观参数</h3></div>
        <div class="inspector-actions"><el-button v-if="snapshot?.platform !== 'darwin'" class="text-button" :icon="Setting" :disabled="themeUnavailable" @click="saveCurrentTheme">保存当前主题</el-button></div>
      </div>
      <div class="theme-settings-wrap" :class="{ 'is-locked': themeUnavailable }" :aria-disabled="themeUnavailable">
        <div class="variable-controls">
        <div class="variable-control background-variable-control">
          <div class="variable-label"><span>背景图片</span><code>{{ pendingImagePath ? "待应用" : "当前主题" }}</code></div>
          <div class="variable-input background-input"><el-button class="text-button" :icon="Picture" @click="chooseBackgroundImage">选择图片</el-button><span class="background-name">{{ pendingImageName || themeValue(activeTheme, "image", "未选择背景图片") }}</span></div>
          <small>选择后不会立即更新 Codex，点击下方“应用”后才会生效。</small>
        </div>
        <div class="variable-control">
          <div class="variable-label"><span>编辑模式</span><code>主题参数</code></div>
          <div class="variable-input mode-input"><el-select v-model="editingMode" class="mode-select"><el-option label="浅色模式" value="light" /><el-option label="暗色模式" value="dark" /></el-select><span class="mode-current">当前主题：{{ themeAppearanceLabel }}</span></div>
          <small>选择要编辑的遮罩透明度和输入框光标颜色。</small>
        </div>
        <div class="variable-control">
          <div class="variable-label"><span>{{ editingModeLabel }}遮罩透明度</span><code>{{ editingOpacityVariable }}</code></div>
          <div class="variable-input"><el-slider v-model="editingMaskOpacity" :min="0" :max="1" :step="0.01" /><strong>{{ Math.round(editingMaskOpacity * 100) }}%</strong></div>
          <small>当前主题默认值：{{ Math.round(defaultEditingMaskOpacity * 100) }}%</small>
        </div>
        <div class="variable-control">
          <div class="variable-label"><span>{{ editingModeLabel }}输入框光标颜色</span><code>{{ editingCaretVariable }}</code></div>
          <div class="variable-input color-input"><el-color-picker v-model="editingCaretColor" /><code>{{ editingCaretColor }}</code></div>
          <small>当前主题默认值：{{ defaultCaretColor }}</small>
        </div>
        <div class="variable-control">
          <div class="variable-label"><span>强调色</span><code>--dream-accent</code></div>
          <div class="variable-input color-input"><el-color-picker v-model="editingAccent" /><code>{{ themeSettings.accent ?? "自动取色" }}</code><el-button class="text-button variable-reset" :icon="RefreshRight" @click="clearThemeSetting('accent')">跟随背景图</el-button></div>
          <small>强调色将在点击“应用”后写入当前主题。</small>
        </div>
        <div class="variable-control">
          <div class="variable-label"><span>强调色文字</span><code>--dream-accent-ink</code></div>
          <div class="variable-input color-input"><el-color-picker v-model="editingAccentInk" /><code>{{ themeSettings.accentInk ?? "自动计算" }}</code><el-button class="text-button variable-reset" :icon="RefreshRight" @click="clearThemeSetting('accentInk')">跟随强调色</el-button></div>
          <small>控制显示在强调色背景上的文字颜色。</small>
        </div>
        <div class="variable-control">
          <div class="variable-label"><span>图片亮度</span><code>--dream-image-luma</code></div>
          <div class="variable-input"><el-slider v-model="editingImageLuma" :min="0" :max="1" :step="0.01" /><strong>{{ Math.round(editingImageLuma * 100) }}%</strong><el-button class="text-button variable-reset" :icon="RefreshRight" @click="clearThemeSetting('imageLuma')">跟随背景图</el-button></div>
          <small>控制写入当前主题的背景图片亮度值。</small>
        </div>
        </div>
        <div class="inspector-footer">
          <div class="inspector-dirty-state"><span class="status-dot" :class="settingsDirty ? 'is-paused' : 'is-online'" />{{ settingsDirty ? "有未应用修改" : "参数已应用" }}</div>
          <div class="inspector-footer-actions"><el-button class="secondary-button" :icon="Refresh" :disabled="!themeDefaults" @click="resetThemeSettings">重置当前主题</el-button><el-button type="primary" :icon="Check" :disabled="!settingsDirty" @click="applyThemeSettings()">应用</el-button></div>
        </div>
        <button v-if="themeUnavailable" class="theme-lock-overlay" type="button" @click="notifyThemeStart">
          <span class="theme-lock-icon"><Lock /></span>
          <strong>{{ snapshot?.session === "paused" ? "主题已暂停" : "主题尚未启动" }}</strong>
          <small>{{ snapshot?.session === "paused" ? "请先点击上方“恢复皮肤”" : "请先点击上方“启动 / 重启”" }}</small>
        </button>
      </div>
    </div>
  </section>

  <section class="theme-library">
    <div class="section-head"><div><div class="eyebrow">已保存主题 / {{ themes.length }}</div><h3>主题库</h3></div><span class="section-rule" /></div>
    <div class="theme-grid">
      <article v-for="theme in themes" :key="theme.id" class="theme-card" :class="{ selected: theme.id === activeTheme?.id, switching: switchingThemeId === theme.id, 'is-locked': themeUnavailable }" :aria-disabled="themeUnavailable" @click="chooseTheme(theme)">
        <div class="theme-art" :style="previewStyle(theme)"><span v-if="theme.id === activeTheme?.id" class="live-label">当前使用</span></div>
        <div class="theme-card-body">
          <strong>{{ theme.name }}</strong>
          <div class="theme-card-meta"><span>{{ theme.id }}</span><div class="theme-card-actions"><el-tooltip content="修改名称"><el-button circle text :icon="EditPen" @click.stop="renameTheme(theme)" /></el-tooltip><el-tooltip content="删除主题"><el-button circle text class="delete-button" :icon="Delete" @click.stop="deleteTheme(theme)" /></el-tooltip></div></div>
          <el-icon v-if="theme.id === activeTheme?.id" class="theme-selected-mark"><Check /></el-icon>
        </div>
      </article>
      <div v-if="!themes.length" class="empty-state">主题库为空，请先完成 Dream Skin 安装。</div>
    </div>
  </section>
</template>
