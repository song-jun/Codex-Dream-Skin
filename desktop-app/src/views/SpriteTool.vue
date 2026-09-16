<!--
  组件名称：SpriteTool
  组件职责：组合 PNG、JPEG、SVG 素材，生成透明背景雪碧图与标识 Markdown。
  属性：无；事件：无；异常：文件读取、OCR 与导出失败均在页面内反馈。
-->
<template>
  <div class="page-container sprite-page">
    <header class="page-header">
      <div>
        <div class="page-kicker">ASSET COMPOSER</div>
        <h1 class="page-title">雪碧图工具</h1>
        <p class="sub-tip">组合 PNG、JPEG、SVG 图片，识别标识文字并导出雪碧图与 Markdown 文档。</p>
      </div>
      <div class="header-actions">
        <el-button :icon="Delete" plain :disabled="slicing || assets.length === 0" @click="clearAssets">清空素材</el-button>
        <el-button type="primary" :icon="MagicStick" :loading="building" :disabled="slicing || assets.length === 0" @click="generateSprite">一键生成</el-button>
      </div>
    </header>
    <div class="workspace-grid">
      <section class="control-column">
        <el-card class="control-card source-card" shadow="never">
          <div class="card-heading">
            <div>
              <h2>素材来源</h2>
              <p>可重复添加文件或目录，列表顺序就是雪碧图序号。</p>
            </div>
            <el-tag type="info">{{ assets.length }} 张</el-tag>
          </div>
          <div class="source-actions">
            <el-tooltip content="选择包含多个图标的整张设计稿，自动切片并识别标签文字" placement="top" :teleported="false">
              <el-button type="primary" :icon="Scissor" :loading="slicing" :disabled="slicing" @click="sliceDesign">导入设计稿</el-button>
            </el-tooltip>
            <el-tooltip content="选择一个或多个独立图片文件，按当前顺序加入素材列表" placement="top" :teleported="false">
              <el-button type="primary" plain :icon="FolderOpened" :disabled="slicing" @click="addFiles">选择图片</el-button>
            </el-tooltip>
            <el-tooltip content="递归读取文件夹及子文件夹中的 PNG、JPG、JPEG、SVG 图片" placement="top" :teleported="false">
              <el-button plain :icon="Folder" :disabled="slicing" @click="addFolder">加入目录</el-button>
            </el-tooltip>
          </div>
          <div class="design-mode-row">
            <span class="field-label">设计稿生成方式</span>
            <el-radio-group v-model="designMode" size="small" :disabled="slicing" @change="handleDesignModeChange">
              <el-radio-button value="separate">分别生成</el-radio-button>
              <el-radio-button value="merge">合并生成</el-radio-button>
            </el-radio-group>
            <small v-if="designGroups.length > 1">已导入 {{ designGroups.length }} 个设计稿</small>
          </div>
          <div class="source-note"><el-icon><InfoFilled /></el-icon><span>自动切片会按图标颜色检测连通域，排除灰色文字，再按从左到右、从上到下编号。</span></div>
          <div class="drop-zone" @dragover.prevent @drop.prevent="handleDrop">
            <el-icon><UploadFilled /></el-icon>
            <strong>拖放图片到这里</strong>
            <span>支持 {{ supportedExtensions.join('、') }}，可从多个目录分批加入</span>
          </div>
          <div v-if="assets.length === 0" class="empty-assets">
            <el-icon><Picture /></el-icon>
            <span>尚未添加图片</span>
          </div>
          <div v-else class="asset-list">
            <article v-for="(asset, index) in assets" :key="asset.id" class="asset-row">
              <div class="asset-index">{{ index + 1 }}</div>
              <el-image
                class="asset-thumb"
                :src="asset.dataUrl"
                :alt="asset.label || asset.name"
                title="点击放大预览"
                fit="contain"
                :preview-src-list="previewUrls"
                :initial-index="index"
                preview-teleported
              />
              <div class="asset-info">
                <div class="asset-title-row">
                  <strong :title="asset.name">{{ asset.name }}</strong>
                  <span class="asset-meta">{{ asset.width }} × {{ asset.height }} · {{ asset.mime.replace('image/', '').toUpperCase() }}</span>
                </div>
                <el-input v-model="asset.label" size="small" placeholder="标识文字（可手动修改）" />
                <small v-if="asset.recognitionError" class="recognition-error">{{ asset.recognitionError }}</small>
              </div>
              <div class="asset-actions">
                <el-tooltip content="识别标识文字" placement="bottom" :teleported="false" :popper-options="spriteTooltipPopperOptions">
                  <el-button text :icon="EditPen" :loading="asset.recognizing" @click="recognizeAsset(asset)" />
                </el-tooltip>
                <el-tooltip content="上移" placement="bottom" :teleported="false" :popper-options="spriteTooltipPopperOptions">
                  <el-button text :icon="ArrowUp" :disabled="index === 0" @click="moveAsset(index, -1)" />
                </el-tooltip>
                <el-tooltip content="下移" placement="bottom" :teleported="false" :popper-options="spriteTooltipPopperOptions">
                  <el-button text :icon="ArrowDown" :disabled="index === assets.length - 1" @click="moveAsset(index, 1)" />
                </el-tooltip>
                <el-button text type="danger" :icon="Close" title="移除素材" aria-label="移除素材" @click="removeAsset(index)" />
              </div>
            </article>
          </div>
        </el-card>
        <el-card class="control-card layout-card" shadow="never">
          <div class="card-heading">
            <div>
              <h2>排列设置</h2>
              <p>透明背景输出，适合直接用于 CSS background-position。</p>
            </div>
            <el-button text :icon="Refresh" :disabled="slicing" @click="resetLayout">一键重置</el-button>
          </div>
          <el-form label-position="top" class="layout-form" :disabled="building || slicing">
            <div class="form-row packing-mode-row">
              <el-form-item><template #label><el-tooltip :content="SPRITE_LAYOUT_TOOLTIPS.packingMode" placement="top" :teleported="false"><span>排列模式</span></el-tooltip></template><el-radio-group v-model="layout.packingMode"><el-radio-button value="grid">统一网格</el-radio-button><el-radio-button value="compact">紧凑自适应</el-radio-button></el-radio-group></el-form-item>
            </div>
            <div class="form-row layout-primary-row">
              <el-form-item><template #label><el-tooltip :content="SPRITE_LAYOUT_TOOLTIPS.columns" placement="top" :teleported="false"><span>每行数量</span></el-tooltip></template>
                <el-input-number v-model="layout.columns" :min="0" :max="50" placeholder="0 为自动横排"  controls-position="right" />
              </el-form-item>
              <el-form-item><template #label><el-tooltip :content="SPRITE_LAYOUT_TOOLTIPS.gapX" placement="top" :teleported="false"><span>横向间距</span></el-tooltip></template>
                <el-input-number v-model="layout.gapX" :min="0" :max="512" controls-position="right" />
              </el-form-item>
              <el-form-item><template #label><el-tooltip :content="SPRITE_LAYOUT_TOOLTIPS.gapY" placement="top" :teleported="false"><span>纵向间距</span></el-tooltip></template>
                <el-input-number v-model="layout.gapY" :min="0" :max="512" controls-position="right" />
              </el-form-item>
              <el-form-item><template #label><el-tooltip :content="SPRITE_LAYOUT_TOOLTIPS.padding" placement="top" :teleported="false"><span>画布边距</span></el-tooltip></template>
                <el-input-number v-model="layout.padding" :min="0" :max="512" controls-position="right" />
              </el-form-item>
            </div>
            <div v-if="layout.packingMode === 'grid'" class="form-row layout-secondary-row">
              <el-form-item class="cell-toggle"><template #label><el-tooltip :content="SPRITE_LAYOUT_TOOLTIPS.normalizeCells" placement="top" :teleported="false"><span>统一单元格</span></el-tooltip></template>
                <el-switch v-model="layout.normalizeCells" />
              </el-form-item>
              <el-form-item v-if="layout.packingMode === 'grid' && layout.normalizeCells"><template #label><el-tooltip :content="SPRITE_LAYOUT_TOOLTIPS.cellWidth" placement="top" :teleported="false"><span>单元格宽度</span></el-tooltip></template>
                <el-input-number v-model="layout.cellWidth" :min="1" :max="2048" controls-position="right" />
              </el-form-item>
              <el-form-item v-if="layout.packingMode === 'grid' && layout.normalizeCells"><template #label><el-tooltip :content="SPRITE_LAYOUT_TOOLTIPS.cellHeight" placement="top" :teleported="false"><span>单元格高度</span></el-tooltip></template>
                <el-input-number v-model="layout.cellHeight" :min="1" :max="2048" controls-position="right" />
              </el-form-item>
            </div>
          </el-form>
        </el-card>
      </section>
      <section class="preview-column">
        <el-card class="preview-card" shadow="never">
          <div class="card-heading preview-heading">
            <div>
              <h2>预览</h2>
              <p v-if="spriteOutputs.length">{{ spriteOutputs.length }} 个输出 · {{ outputFormat.toUpperCase() }} · 透明背景</p>
              <p v-else>生成后预览雪碧图尺寸与透明背景效果</p>
            </div>
            <div class="preview-heading-actions"><el-tag v-if="spriteOutputs.length" type="success">已生成</el-tag></div>
          </div>
          <div class="preview-stage" :class="{ 'has-outputs': spriteOutputs.length > 0 }">
            <div v-if="spriteOutputs.length" class="output-list">
              <article v-for="output in spriteOutputs" :key="output.id" class="output-item">
                <div class="output-heading">
                  <el-input v-model="output.name" size="small" aria-label="雪碧图文件名" @change="refreshMarkdown" />
                  <span>{{ output.result.width }} × {{ output.result.height }}px</span>
                </div>
                <img :src="outputFormat === 'svg' ? output.result.svgDataUrl : output.result.dataUrl" :alt="`${output.name} 预览`" />
              </article>
            </div>
            <div v-else class="preview-placeholder">
              <el-icon><Grid /></el-icon>
              <strong>等待生成雪碧图</strong>
              <span>添加素材后点击“一键生成”</span>
            </div>
          </div>
          <div v-if="spriteOutputs.length" class="export-panel">
            <div class="export-title"><span>导出文件</span><small>多个雪碧图共用一个 Markdown 文档{{ layout.packingMode === 'compact' ? '，并生成 config.js 和 SpriteIcon.vue' : '' }}</small></div>
            <el-radio-group v-model="outputFormat" size="small" @change="refreshMarkdown">
              <el-radio-button value="png">PNG</el-radio-button>
              <el-radio-button value="svg">SVG</el-radio-button>
            </el-radio-group>
            <el-input style="height: 32px" v-model="markdownName" size="small" placeholder="Markdown 文件名">
              <template #append>.md</template>
            </el-input>
            <el-input style="height: 32px" v-if="layout.packingMode === 'compact'" v-model="configName" size="small" placeholder="Config 文件名"><template #append>.js</template></el-input>
            <el-button type="primary" :disabled="spriteOutputs.length === 0" @click="componentPreviewVisible = true">预览组件</el-button>
            <el-button type="primary" :icon="Download" :loading="exporting" @click="exportFiles">导出到指定目录</el-button>
          </div>
        </el-card>
        <el-card class="markdown-card" shadow="never">
          <div class="card-heading">
            <div>
              <h2>标识文档</h2>
              <p>包含序号、识别文字、文件名和原始尺寸，可随雪碧图一起导出。</p>
            </div>
            <el-button v-if="markdownContent" text :icon="DocumentCopy" @click="copyMarkdown">复制 Markdown</el-button>
          </div>
          <pre v-if="markdownContent" class="markdown-preview">{{ markdownContent }}</pre>
          <div v-else class="markdown-empty">生成雪碧图后，这里会显示 Markdown 内容。</div>
        </el-card>
      </section>
    </div>
    <SpriteComponentPreviewDialog v-model:visible="componentPreviewVisible" :outputs="spriteOutputs" :config-name="normalizedOutputName(configName, 'sprite-config')" :format="outputFormat" />
  </div>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'; import { ElMessage } from 'element-plus'
import { ArrowDown, ArrowUp, Close, Delete, DocumentCopy, Download, EditPen, Folder, FolderOpened, Grid, InfoFilled, MagicStick, Picture, Refresh, Scissor, UploadFilled } from '@element-plus/icons-vue'
import SpriteComponentPreviewDialog from '@/components/sprite/SpriteComponentPreviewDialog.vue'; import spriteIconSource from '@/components/sprite/SpriteIcon.vue?raw'
import { DEFAULT_SPRITE_LAYOUT, SPRITE_EXTENSIONS, SPRITE_LAYOUT_TOOLTIPS } from '@/features/sprite/config'
import { buildSprite, sliceDesignSprite } from '@/features/sprite/spriteGenerator'; import { buildSpriteConfigModule } from '@/features/sprite/spriteConfig'
import type { SpriteAsset, SpriteBuildResult, SpriteDesignMode, SpriteOutputFormat, SpriteSourceSelection } from '@/features/sprite/types'
interface SpriteAssetGroup { id: string; sourceName: string; assets: SpriteAsset[] }
interface SpriteOutput { id: string; name: string; sourceName: string; result: SpriteBuildResult }
const supportedExtensions = SPRITE_EXTENSIONS
const assets = ref<SpriteAsset[]>([])
const layout = reactive({ ...DEFAULT_SPRITE_LAYOUT })
const designMode = ref<SpriteDesignMode>('separate')
const outputFormat = ref<SpriteOutputFormat>('png')
const designGroups = ref<SpriteAssetGroup[]>([]); const spriteOutputs = ref<SpriteOutput[]>([]); const componentPreviewVisible = ref(false)
const markdownContent = ref('')
const markdownName = ref('sprite-sprite'); const configName = ref('sprite-config')
const previewUrls = computed(() => assets.value.map((asset) => asset.dataUrl))
const spriteTooltipPopperOptions = {
  strategy: 'absolute' as const,
  modifiers: [{ name: 'preventOverflow', options: { boundary: 'clippingParents', padding: 8 } }],
}
const building = ref(false)
const slicing = ref(false)
const exporting = ref(false)
const hasGeneratedPreview = ref(false)
let previewTimer: ReturnType<typeof setTimeout> | undefined
watch([assets, layout], schedulePreviewUpdate, { deep: true })
/** 将原生选择结果转换为页面素材，并按路径去重。 */
async function appendSelections(selections: Array<{ path: string; name: string; mime: string; dataUrl: string }>) {
  const knownPaths = new Set(assets.value.map((asset) => asset.path))
  const nextAssets = selections.filter((item) => !knownPaths.has(item.path)).map((item) => {
    const image = new Image()
    const asset: SpriteAsset = {
      id: `${item.path}-${Date.now()}-${Math.random()}`,
      path: item.path,
      name: item.name,
      dataUrl: item.dataUrl,
      mime: item.mime,
      label: item.name.replace(/\.[^.]+$/, ''),
      width: 0,
      height: 0,
      ready: false,
      recognizing: false,
    }
    image.onload = () => {
      asset.width = image.naturalWidth
      asset.height = image.naturalHeight
      asset.ready = true
    }
    image.src = item.dataUrl
    return asset
  })
  assets.value.push(...nextAssets)
  if (nextAssets.length > 0) {
    const manualGroup = designGroups.value.find((group) => group.id === 'manual-assets')
    if (manualGroup) manualGroup.assets.push(...nextAssets)
    else designGroups.value.push({ id: 'manual-assets', sourceName: '手动添加素材', assets: nextAssets })
    invalidateBuild()
  }
  if (nextAssets.length > 0) ElMessage.success(`已加入 ${nextAssets.length} 张图片。`)
  if (selections.length !== nextAssets.length) ElMessage.info('重复素材已自动忽略。')
}
/** 打开多选文件对话框。 */
async function addFiles() {
  const selections = await window.electronAPI?.selectSpriteFiles('files')
  if (!selections || selections.length === 0) return
  try {
    if (selections.length === 1 && await isLikelyDesignSheet(selections[0])) {
      await replaceWithSlicedDesign([selections[0] as SpriteSourceSelection])
      return
    }
  } catch (error) {
    ElMessage.warning(error instanceof Error ? error.message : '无法判断图片类型，将按普通素材加入。')
  }
  await appendSelections(selections)
}
/** 递归加入一个目录中的图片，允许重复执行以组合多个目录。 */
async function addFolder() {
  const selections = await window.electronAPI?.selectSpriteFiles('directory')
  if (selections) await appendSelections(selections)
}
/** 导入包含多个图标与文字的整张设计稿，并按参考脚本规则自动切片。 */
async function sliceDesign() {
  const selections = await window.electronAPI?.selectSpriteFiles('files')
  if (!selections || selections.length === 0) return
  await replaceWithSlicedDesign(selections as SpriteSourceSelection[])
}
/** 判断单张图片是否更像包含多个图标的设计稿，而不是独立素材。 */
async function isLikelyDesignSheet(selection: { dataUrl: string }): Promise<boolean> {
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('图片尺寸读取失败。'))
    image.src = selection.dataUrl
  })
  return image.naturalWidth >= 900 || image.naturalHeight >= 400
}
/** 执行设计稿切片并把结果应用到当前素材列表。 */
async function replaceWithSlicedDesign(selections: SpriteSourceSelection[]) {
  slicing.value = true
  try {
    const results = await Promise.all(selections.map((selection) => sliceDesignSprite(selection)))
    const groups = results.map((result, index) => ({
      id: `${selections[index].path}-${index}`,
      sourceName: selections[index].name,
      assets: result.assets,
    }))
    designGroups.value = groups
    assets.value = groups.flatMap((group) => group.assets)
    layout.columns = 10
    layout.gapX = 0
    layout.gapY = 0
    layout.padding = 0
    layout.normalizeCells = true
    layout.cellWidth = 270
    layout.cellHeight = 270
    invalidateBuild()
    const iconCount = results.reduce((count, result) => count + result.assets.length, 0)
    const pendingLabels = results.reduce((count, result) => count + result.assets.filter((asset) => asset.label === '待确认').length, 0)
    if (pendingLabels > 0) ElMessage.warning(`已从 ${selections.length} 张设计稿切出 ${iconCount} 个图标，但有 ${pendingLabels} 个标签未识别，请检查 OCR 模型连接或手动修正。`)
    else ElMessage.success(`已从 ${selections.length} 张设计稿自动切出 ${iconCount} 个图标，标签已写入素材列表。`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '设计稿自动切片失败。')
  } finally {
    slicing.value = false
  }
}
/** 将拖放的本地图片读成数据 URL。 */
async function handleDrop(event: DragEvent) {
  const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => ['image/png', 'image/jpeg', 'image/svg+xml'].includes(file.type))
  try {
    const selections = await Promise.all(files.map(async (file) => ({ path: `drop://${file.name}-${file.size}-${file.lastModified}`, name: file.name, mime: file.type, dataUrl: await readFileAsDataUrl(file) })))
    await appendSelections(selections)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '拖放图片读取失败。')
  }
}
/** 读取浏览器拖放文件。 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('拖放图片读取失败。'))
    reader.readAsDataURL(file)
  })
}
/** 执行一次中文/英文标识文字识别。 */
async function recognizeAsset(asset: SpriteAsset) {
  asset.recognizing = true
  asset.recognitionError = undefined
  try {
    const result = await window.electronAPI?.recognizeSprite(asset.dataUrl)
    if (!result) throw new Error('OCR 主进程不可用，请重启桌面端后重试。')
    const recognized = result.text.replace(/\s+/g, ' ').trim()
    if (recognized) asset.label = recognized
    else asset.recognitionError = '未识别到文字，可手动填写。'
  } catch (error) {
    asset.recognitionError = error instanceof Error ? `识别失败：${error.message}` : '识别失败，请手动填写。'
  } finally {
    asset.recognizing = false
  }
}
/** 调整素材顺序，顺序同时决定序号和合成位置。 */
function moveAsset(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= assets.value.length) return
  const [asset] = assets.value.splice(index, 1)
  assets.value.splice(target, 0, asset)
  syncGroupsFromAssets()
  invalidateBuild()
}
/** 删除指定素材。 */
function removeAsset(index: number) {
  assets.value.splice(index, 1)
  syncGroupsFromAssets()
  invalidateBuild()
}
/** 清空全部素材与生成结果。 */
function clearAssets() {
  assets.value = []
  designGroups.value = []
  hasGeneratedPreview.value = false
  invalidateBuild()
}
/** 让分组顺序与素材列表中的手动排序保持一致。 */
function syncGroupsFromAssets() {
  const order = new Map(assets.value.map((asset, index) => [asset.id, index]))
  designGroups.value = designGroups.value
    .map((group) => ({ ...group, assets: group.assets.filter((asset) => order.has(asset.id)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) }))
    .filter((group) => group.assets.length > 0)
}
/** 清除旧预览，避免排列或素材变化时继续显示过期结果。 */
function invalidateBuild() {
  spriteOutputs.value = []
  markdownContent.value = ''
}
/** 素材或排列参数变化后防抖刷新右侧预览。 */
function schedulePreviewUpdate() {
  if (!hasGeneratedPreview.value || assets.value.length === 0 || assets.value.some((asset) => !asset.ready)) return
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    previewTimer = undefined
    if (!building.value) void generateSprite()
  }, 180)
}
/** 恢复默认排列参数并清除当前生成结果。 */
function resetLayout() {
  Object.assign(layout, DEFAULT_SPRITE_LAYOUT)
  invalidateBuild()
  ElMessage.success('排列设置已重置。')
}
/** 切换设计稿输出模式后清除旧结果，要求用户按当前模式重新生成。 */
function handleDesignModeChange() {
  invalidateBuild()
  if (!building.value && assets.value.length > 0 && assets.value.every((asset) => asset.ready)) void generateSprite()
}
/** 清理用户输入的输出文件名，避免重复追加扩展名。 */
function normalizedOutputName(value: string, fallback: string): string {
  return (value.trim().replace(/\.(?:png|svg)$/i, '').replace(/[\\/:*?"<>|]/g, '-') || fallback)
}
/** 校验多个输出的文件名，避免雪碧图互相覆盖。 */
function validateOutputNames(): string | null { const seen = new Map<string, string>(); for (const output of spriteOutputs.value) { const name = normalizedOutputName(output.name, 'sprite-sheet'); const key = name.toLocaleLowerCase(); const previous = seen.get(key); if (previous) return `雪碧图导出名称重复：${previous} 与 ${name}，请修改后再导出。`; seen.set(key, name) } return null }
/** 生成统一的 Markdown 文档，分别模式也只导出一个 md 文件。 */
function outputMarkdown(output: SpriteOutput): string {
  const fileName = `${normalizedOutputName(output.name, 'sprite-sheet')}.${outputFormat.value}`
  return output.result.markdown.replace(/\| [^|]+ \| [^|]+ \| \d+ \|/, (row) => row.replace(/^\| [^|]+ \|/, `| ${fileName} |`))
}
function composeMarkdown(outputs: SpriteOutput[]): string {
  if (outputs.length === 1) return outputMarkdown(outputs[0])
  return [
    '# 雪碧图标识文档',
    '',
    '> 本文档由 API Workbench 雪碧图工具自动生成，包含本次所有雪碧图输出。',
    '',
    ...outputs.map((output, index) => `## ${index + 1}. ${output.name}\n\n${outputMarkdown(output).replace(/^# .*\n\n?/, '')}`),
    '',
  ].join('\n')
}
/** 文件名或输出格式变化后同步 Markdown 里的文件引用。 */
function refreshMarkdown() {
  if (spriteOutputs.value.length > 0) markdownContent.value = composeMarkdown(spriteOutputs.value)
}
/** 返回稳定且不重复的默认输出名。 */
function createOutputName(sourceName: string, index: number, usedNames: Set<string>): string {
  const base = sourceName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '-').trim() || `sprite-${index + 1}`
  const stem = `${base}-sprite`
  let name = stem
  let suffix = 2
  while (usedNames.has(name)) name = `${stem}-${suffix++}`
  usedNames.add(name)
  return name
}
/** 根据当前配置生成一个或多个雪碧图和统一 Markdown。 */
async function generateSprite() {
  if (building.value) return
  if (assets.value.some((asset) => !asset.ready)) {
    ElMessage.warning('图片仍在读取，请稍候再生成。')
    return
  }
  building.value = true
  try {
    const groups = designGroups.value.length > 0 ? designGroups.value : [{ id: 'all-assets', sourceName: '全部素材', assets: assets.value }]
    const targetGroups = designMode.value === 'merge' ? [{ id: 'merged', sourceName: groups.map((group) => group.sourceName).join('、'), assets: groups.flatMap((group) => group.assets) }] : groups
    const usedNames = new Set<string>()
    const outputs: SpriteOutput[] = []
    for (let index = 0; index < targetGroups.length; index += 1) {
      const group = targetGroups[index]
      if (group.assets.length === 0) continue
      const name = designMode.value === 'merge' ? 'stat-sprite' : createOutputName(group.sourceName, index, usedNames)
      const result = await buildSprite(group.assets, layout, { fileName: name, sourceName: group.sourceName })
      outputs.push({ id: `${group.id}-${Date.now()}-${index}`, name, sourceName: group.sourceName, result })
    }
    spriteOutputs.value = outputs
    markdownContent.value = composeMarkdown(outputs)
    hasGeneratedPreview.value = true
    ElMessage.success(outputs.length > 1 ? `已生成 ${outputs.length} 个雪碧图。` : '雪碧图已生成。')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '雪碧图生成失败。')
  } finally {
    building.value = false
  }
}
/** 将所有雪碧图和一个 Markdown 导出到用户选择的目录。 */
async function exportFiles() {
  if (spriteOutputs.value.length === 0 || !window.electronAPI) return
  const duplicateError = validateOutputNames(); if (duplicateError) { ElMessage.error(duplicateError); return }
  const directory = await window.electronAPI.selectDirectory()
  if (!directory) return
  const separator = directory.includes('\\') ? '\\' : '/'
  const safeMarkdownName = markdownName.value.trim().replace(/\.md$/i, '').replace(/[\\/:*?"<>|]/g, '-') || 'sprite-sprite'
  const markdownPath = `${directory}${separator}${safeMarkdownName}.md`
  exporting.value = true
  try {
    refreshMarkdown()
    const writeResults: Array<{ success: boolean; error?: string }> = []
    for (const output of spriteOutputs.value) {
      const safeName = normalizedOutputName(output.name, 'sprite-sheet')
      const filePath = `${directory}${separator}${safeName}.${outputFormat.value}`
      const result = outputFormat.value === 'png'
        ? await window.electronAPI.writeBinaryFile(filePath, output.result.base64)
        : await window.electronAPI.writeFile(filePath, output.result.svg)
      writeResults.push(result)
    }
    const markdownResult = await window.electronAPI.writeFile(markdownPath, markdownContent.value)
    writeResults.push(markdownResult)
    if (layout.packingMode === 'compact') {
      const safeConfigName = configName.value.trim().replace(/\.js$/i, '').replace(/[\\/:*?"<>|]/g, '-') || 'sprite-config'
      const configPath = `${directory}${separator}${safeConfigName}.js`
      writeResults.push(await window.electronAPI.writeFile(configPath, buildSpriteConfigModule(spriteOutputs.value.map((output) => ({ name: normalizedOutputName(output.name, 'sprite-sheet'), placements: output.result.placements, width: output.result.width, height: output.result.height })), outputFormat.value)))
      writeResults.push(await window.electronAPI.writeFile(`${directory}${separator}SpriteIcon.vue`, spriteIconSource))
    }
    const failed = writeResults.find((result) => !result.success)
    if (failed) throw new Error(failed.error || '文件写入失败。')
    ElMessage.success(`已导出 ${spriteOutputs.value.length} 个雪碧图、1 个 Markdown${layout.packingMode === 'compact' ? '、1 个 config.js 和 1 个 SpriteIcon.vue' : ''}。`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导出失败。')
  } finally {
    exporting.value = false
  }
}
/** 复制当前 Markdown 内容。 */
async function copyMarkdown() {
  if (!markdownContent.value) return
  try {
    await navigator.clipboard.writeText(markdownContent.value)
    ElMessage.success('Markdown 已复制。')
  } catch {
    ElMessage.error('复制失败，请直接从预览区域复制。')
  }
}
</script>
<style scoped>
.sprite-page { min-height: 0; overflow: hidden; padding-bottom: 16px; }
.page-kicker { color: var(--brand-primary); font-size: 11px; font-weight: 700; letter-spacing: .14em; margin-bottom: 5px; }
.header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.workspace-grid { display: grid; flex: 1; grid-template-columns: minmax(0, .96fr) minmax(0, 1.04fr); grid-template-rows: minmax(0, 1.25fr) minmax(0, .75fr); gap: 18px; align-items: stretch; min-height: 0; overflow: hidden; }
.control-column, .preview-column { display: contents; min-width: 0; }
.source-card { grid-column: 1; grid-row: 1; }
.preview-card { grid-column: 2; grid-row: 1; }
.layout-card { grid-column: 1; grid-row: 2; }
.markdown-card { grid-column: 2; grid-row: 2; }
.control-card, .preview-card, .markdown-card { min-height: 0; height: 100%; overflow: hidden; border-radius: 8px !important; }
.source-card, .layout-card { min-width: 0; }
.source-card :deep(.el-card__body), .layout-card :deep(.el-card__body), .preview-card :deep(.el-card__body), .markdown-card :deep(.el-card__body) { display: flex; flex: 1; min-height: 0; flex-direction: column; overflow: hidden; }
.layout-card :deep(.el-card__body) { overflow: auto; }
.card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.card-heading h2 { margin: 0; color: var(--text-primary); font-size: 15px; font-weight: 650; }
.card-heading p { margin: 4px 0 0; color: var(--text-tertiary); font-size: 12px; }
.source-actions { display: flex; flex-wrap: nowrap; gap: 8px; margin-bottom: 10px; }
.source-actions > * { min-width: 0; flex: 1 1 0; }
.source-actions .el-button { width: 100%; }
.design-mode-row { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; }
.field-label { color: var(--text-secondary); font-size: 12px; white-space: nowrap; }
.design-mode-row small { color: var(--text-tertiary); font-size: 11px; }
.source-note { display: flex; align-items: flex-start; gap: 6px; margin: 0 0 12px; color: var(--text-tertiary); font-size: 11px; line-height: 1.5; }
.source-note .el-icon { flex: 0 0 auto; margin-top: 2px; color: var(--brand-primary); }
.drop-zone { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 12px; border: 1px dashed #b8c6dc; border-radius: 8px; background: #f8fafd; color: var(--text-secondary); }
.drop-zone .el-icon { color: var(--brand-primary); font-size: 22px; }
.drop-zone strong { color: var(--text-primary); font-size: 13px; }
.drop-zone span { font-size: 11px; }
.empty-assets { display: flex; flex: 1; align-items: center; justify-content: center; gap: 8px; min-height: 84px; color: var(--text-tertiary); font-size: 12px; }
.empty-assets .el-icon { font-size: 20px; }
.asset-list { display: flex; flex: 1; min-height: 0; flex-direction: column; gap: 7px; margin-top: 12px; overflow: auto; padding: 1px 2px 2px 0; }
.asset-row { display: grid; grid-template-columns: 26px 48px minmax(0, 1fr) auto; align-items: center; gap: 9px; min-height: 70px; padding: 7px 8px; border: 1px solid var(--border-light); border-radius: 6px; background: #fff; }
.asset-index { color: var(--brand-primary); font-size: 12px; font-weight: 700; text-align: center; }
.asset-thumb { width: 48px; height: 48px; overflow: hidden; cursor: zoom-in; border: 1px solid var(--border-light); border-radius: 4px; background: repeating-conic-gradient(#f0f3f8 0 25%, #fff 0 50%) 50% / 10px 10px; }
.asset-thumb :deep(img) { width: 100%; height: 100%; object-fit: contain; }
.asset-info { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.asset-title-row { display: flex; min-width: 0; align-items: baseline; gap: 8px; }
.asset-info strong { min-width: 0; overflow: hidden; color: var(--text-primary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.asset-meta { flex: 0 0 auto; color: var(--text-tertiary); font-size: 10px; white-space: nowrap; }
.asset-info :deep(.el-input) { width: 100%; }
.asset-info :deep(.el-input__wrapper) { padding: 0 7px; box-shadow: 0 0 0 1px var(--border-light) inset; }
.recognition-error { color: var(--danger); font-size: 10px; }
.asset-actions { position: relative; display: flex; align-items: center; gap: 0; overflow: visible; }
.asset-actions :deep(.el-tooltip) { display: inline-flex; }
.asset-actions :deep(.el-button) { margin-left: 0; padding: 5px; }
.layout-form :deep(.el-form-item) { margin-bottom: 12px; }
.form-row { display: grid; gap: 12px; }
.layout-primary-row, .layout-secondary-row { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.layout-cell-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.layout-form :deep(.el-input-number) { width: 100%; }
.layout-form small { display: block; margin-top: 3px; color: var(--text-tertiary); font-size: 10px; }
.cell-toggle :deep(.el-form-item__content) { min-height: 32px; align-items: center; }
.preview-card { display: flex; min-height: 0; flex-direction: column; }
.preview-heading { margin-bottom: 12px; } .preview-heading-actions { display: flex; align-items: center; gap: 8px; }
.preview-stage { display: flex; min-height: 0; flex: 1; align-items: center; justify-content: center; overflow: auto; padding: 20px; border: 1px solid var(--border-light); border-radius: 6px; background: repeating-conic-gradient(#f0f3f8 0 25%, #fff 0 50%) 50% / 16px 16px; }
.preview-stage.has-outputs { align-items: stretch; justify-content: flex-start; }
.preview-stage img { display: block; max-width: 100%; max-height: 420px; object-fit: contain; image-rendering: auto; }
.output-list { display: flex; width: 100%; min-height: 0; flex: 0 0 auto; flex-direction: column; gap: 14px; overflow: visible; }
.output-item { display: flex; min-height: 0; flex: 0 0 auto; flex-direction: column; gap: 8px; padding: 10px; border: 1px solid var(--border-light); border-radius: 6px; background: rgba(255, 255, 255, .76); }
.output-heading { display: flex; align-items: center; gap: 10px; }
.output-heading .el-input { min-width: 0; flex: 1; }
.output-heading > span { flex: 0 0 auto; color: var(--text-tertiary); font-size: 11px; }
.output-item img { align-self: center; width: auto; height: auto; max-width: 100%; max-height: none; }
.preview-placeholder { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-tertiary); }
.preview-placeholder .el-icon { color: #aab9d1; font-size: 46px; }
.preview-placeholder strong { color: var(--text-secondary); font-size: 14px; }
.preview-placeholder span { font-size: 12px; }
.export-panel { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto auto; align-items: end; gap: 10px; margin-top: 14px; }
.export-title { display: flex; flex-direction: column; gap: 2px; grid-column: 1 / -1; color: var(--text-primary); font-size: 12px; font-weight: 600; }
.export-title small { color: var(--text-tertiary); font-weight: 400; }
.export-panel .el-input { min-width: 0; }
.export-panel .el-radio-group { grid-column: 1 / -1; }
.markdown-card { min-height: 0; }
.markdown-preview { flex: 1; min-height: 0; margin: 0; overflow: auto; padding: 14px; border-radius: 6px; background: #f8fafd; color: #334155; font: 12px/1.65 'Fira Code', Consolas, monospace; white-space: pre-wrap; }
.markdown-empty { display: flex; flex: 1; min-height: 110px; align-items: center; justify-content: center; color: var(--text-tertiary); font-size: 12px; border: 1px dashed var(--border-color); border-radius: 6px; }
@media (max-width: 1060px) { .workspace-grid { display: flex; overflow: auto; flex-direction: column; } .control-column, .preview-column { display: flex; flex-direction: column; gap: 18px; } .control-card, .preview-card, .markdown-card { height: auto; min-height: 320px; } .preview-card { min-height: 420px; } }
@media (max-width: 640px) { .page-header { flex-direction: column; } .header-actions { width: 100%; } .header-actions .el-button { flex: 1; } .source-actions { flex-wrap: wrap; } .source-actions > * { flex-basis: calc(50% - 4px); } .source-actions > :first-child { flex-basis: 100%; } .design-mode-row { flex-wrap: wrap; } .layout-primary-row, .layout-secondary-row, .layout-cell-row { grid-template-columns: 1fr 1fr; } .asset-row { grid-template-columns: 22px 42px minmax(0, 1fr); } .asset-thumb { width: 42px; height: 42px; } .asset-actions { grid-column: 3; justify-content: flex-end; } .export-panel { grid-template-columns: 1fr; } .export-panel .el-radio-group { grid-column: auto; } }
</style>
