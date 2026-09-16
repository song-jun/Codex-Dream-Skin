<!--
  组件名称：SpriteComponentPreviewDialog
  组件职责：预览统一网格或紧凑自适应雪碧图的 SpriteIcon.vue，并展示组件源码与调用示例。
  属性：visible 控制弹框、outputs 提供雪碧图输出、configName 指定配置模块名。
  事件：update:visible；异常：没有可选图标时显示空状态。
-->
<template>
  <el-dialog v-model="dialogVisible" title="组件预览" width="min(1120px, calc(100vw - 32px))" append-to-body destroy-on-close>
    <div class="component-preview-layout">
      <section class="demo-pane">
        <div class="pane-heading"><strong>图标预览</strong><el-tag type="info">{{ selectedItem?.spriteName || '未选择' }}</el-tag></div>
        <el-select v-model="selectedKey" filterable class="icon-select" placeholder="选择 label 或 value">
          <el-option-group v-for="group in optionGroups" :key="group.name" :label="group.name">
            <el-option v-for="item in group.items" :key="item.key" :label="`${item.label} · value ${item.value}`" :value="item.key" />
          </el-option-group>
        </el-select>
        <el-form label-position="top" class="demo-controls">
          <el-form-item label="预览尺寸"><el-input-number v-model="previewSize" :min="8" :max="512" controls-position="right" /></el-form-item>
          <el-form-item label="查询方式"><el-radio-group v-model="queryMode" size="small"><el-radio-button value="label">label</el-radio-button><el-radio-button value="value">value</el-radio-button></el-radio-group></el-form-item>
        </el-form>
        <div class="demo-stage"><SpriteIcon v-if="selectedItem" :entry="selectedEntry" :config="previewConfig" :sprite-urls="spriteUrls" :label="queryMode === 'label' ? selectedItem.label : undefined" :value="queryMode === 'value' ? selectedItem.value : undefined" :sprite="selectedItem.spriteFile" :size="previewSize" /><span v-else class="demo-empty">暂无可预览图标</span></div>
      </section>
      <section class="source-stack">
        <article class="source-panel"><div class="source-heading"><strong>组件源码</strong><el-button type="primary" :icon="DocumentCopy" @click="copySource(componentSource, '组件源码')">复制</el-button></div><pre class="source-code"><code class="hljs" v-html="highlightedComponentSource" /></pre></article>
        <article class="source-panel"><div class="source-heading"><strong>Demo 用法</strong><el-button type="primary" :icon="DocumentCopy" @click="copySource(demoSource, 'Demo 源码')">复制</el-button></div><pre class="source-code"><code class="hljs" v-html="highlightedDemoSource" /></pre></article>
      </section>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { DocumentCopy } from '@element-plus/icons-vue'
import hljs from 'highlight.js/lib/core'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import xml from 'highlight.js/lib/languages/xml'
import 'highlight.js/styles/atom-one-dark.css'
import SpriteIcon from '@/components/sprite/SpriteIcon.vue'
import spriteIconSource from '@/components/sprite/SpriteIcon.vue?raw'
import type { SpriteBuildResult } from '@/features/sprite/types'

hljs.registerLanguage('css', css)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('xml', xml)

/** 弹框消费的雪碧图输出最小数据结构。 */
interface PreviewOutput { id: string; name: string; result: Pick<SpriteBuildResult, 'width' | 'height' | 'dataUrl' | 'svgDataUrl' | 'placements'> }
/** 下拉框与预览区使用的单个图标数据。 */
interface PreviewItem { key: string; label: string; value: number; spriteName: string; spriteFile: string; x: number; y: number; width: number; height: number; output: PreviewOutput }
const props = defineProps<{ visible: boolean; outputs: PreviewOutput[]; configName: string; format: 'png' | 'svg' }>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()
const dialogVisible = computed({ get: () => props.visible, set: (value) => emit('update:visible', value) })
const previewSize = ref(48)
const selectedKey = ref('')
const queryMode = ref<'label' | 'value'>('label')

const items = computed<PreviewItem[]>(() => {
  let value = 0
  return props.outputs.flatMap((output) => output.result.placements.map((placement) => ({ key: `${output.id}:${placement.index}`, label: placement.label || '未识别', value: value++, spriteName: output.name, spriteFile: `${output.name}.${props.format}`, x: placement.x, y: placement.y, width: placement.width, height: placement.height, output })))
})
const optionGroups = computed(() => props.outputs.map((output) => ({ name: output.name, items: items.value.filter((item) => item.output.id === output.id) })))
const selectedItem = computed(() => items.value.find((item) => item.key === selectedKey.value) || items.value[0])
watch(() => props.visible, (visible) => { if (visible && !selectedKey.value) selectedKey.value = items.value[0]?.key || '' })
watch(items, (next) => { if (!next.some((item) => item.key === selectedKey.value)) selectedKey.value = next[0]?.key || '' })

const previewConfig = computed(() => ({
  entries: items.value.map((item) => ({ label: item.label, value: item.value, sprite: item.spriteFile, x: item.x, y: item.y, width: item.width, height: item.height })),
  dimensions: Object.fromEntries(props.outputs.map((output) => [output.name, { width: output.result.width, height: output.result.height }])),
}))
const spriteUrls = computed(() => Object.fromEntries(props.outputs.map((output) => [`${output.name}.${props.format}`, props.format === 'svg' ? output.result.svgDataUrl : output.result.dataUrl])))
const selectedEntry = computed(() => {
  const item = selectedItem.value
  return item ? { label: item.label, value: item.value, sprite: item.spriteFile, x: item.x, y: item.y, width: item.width, height: item.height } : undefined
})
const componentSource = computed(() => spriteIconSource)
const demoSource = computed(() => {
  const item = selectedItem.value
  const query = queryMode.value === 'value' ? `:value="${item?.value ?? 0}"` : `label="${item?.label || '未识别'}"`
  const configFile = `${props.configName.replace(/\.js$/i, '') || 'sprite-config'}.js`
  const scriptClose = '</' + 'script>'
  return `<template>\n  <SpriteIcon ${query} :size="${previewSize.value}" sprite="${item?.spriteName || 'sprite-name'}" config-file="./${configFile}" />\n</template>\n\n<script setup lang="ts">\nimport SpriteIcon from './SpriteIcon.vue'\n${scriptClose}`
})
const highlightedComponentSource = computed(() => hljs.highlight(componentSource.value, { language: 'xml' }).value)
const highlightedDemoSource = computed(() => hljs.highlight(demoSource.value, { language: 'xml' }).value)

/** 将当前源码示例复制到系统剪贴板。 */
async function copySource(source: string, name: string) {
  try { await navigator.clipboard.writeText(source); ElMessage.success(`${name}已复制。`) } catch { ElMessage.error('复制失败，请直接从源码区域复制。') }
}
</script>

<style scoped>
.component-preview-layout { display: grid; grid-template-columns: minmax(280px, .8fr) minmax(0, 1.2fr); align-items: start; gap: 16px; }
.demo-pane, .source-panel { min-width: 0; border: 1px solid var(--border-light); border-radius: 6px; background: #fff; }
.demo-pane { display: flex; min-height: 0; flex-direction: column; gap: 14px; padding: 16px; }
.pane-heading, .source-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.pane-heading strong, .source-heading strong { color: var(--text-primary); font-size: 14px; }
.pane-heading p { margin: 4px 0 0; color: var(--text-tertiary); font-size: 12px; }
.icon-select { width: 100%; }
.demo-controls { display: grid; grid-template-columns: 1fr; gap: 8px; }
.demo-controls :deep(.el-form-item) { margin-bottom: 0; }
.demo-controls :deep(.el-input-number) { width: 100%; }
.demo-stage { display: flex; min-height: 112px; max-height: 220px; align-items: center; justify-content: center; overflow: auto; border: 1px solid var(--border-light); border-radius: 6px; background: #f8fafd; }
.demo-empty { color: var(--text-tertiary); font-size: 12px; }
.source-stack { display: grid; width: 100%; min-width: 0; height: min(560px, calc(100vh - 240px)); min-height: 360px; grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
.source-panel { display: flex; min-height: 0; flex-direction: column; overflow: hidden; }
.source-heading { flex: 0 0 auto; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--border-light); }
.source-code { flex: 1; min-height: 0; margin: 0; overflow: auto; padding: 14px; border-radius: 6px; background: #111827; color: #e5e7eb; font: 12px/1.65 'Fira Code', Consolas, monospace; white-space: pre; }
.source-code :deep(.hljs) { background: transparent; color: #e5e7eb; padding: 0; }
@media (max-width: 760px) { .component-preview-layout { grid-template-columns: 1fr; } .source-stack { height: 520px; } }
</style>
