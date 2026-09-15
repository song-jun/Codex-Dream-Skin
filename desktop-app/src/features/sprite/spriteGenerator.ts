import type { SpriteAsset, SpriteBuildResult, SpriteLayoutOptions, SpriteSliceResult, SpriteSourceSelection } from './types'

// ponytail: 分析先限宽，避免超大设计稿让渲染进程内存峰值过高；极限精度需求再迁移到主进程 sharp。
const ANALYSIS_MAX_WIDTH = 1800
// 目标宽度约等于参考脚本将 1x 设计稿放大到 2x 后的识别尺寸；2x 源图不再重复放大。
const OCR_MAX_WIDTH = 7000
const OCR_TARGET_SCALE = 2
const TILE_SIZE = 270
const ICON_TARGET_SIZE = 174
const COMPONENT_MIN_PIXELS = 4
// OCR 已按图标下方坐标过滤，保留低置信度汉字可避免“人数”的“数”等字符被漏掉。
const LABEL_CONFIDENCE = 0

/** 将数据 URL 转成可直接写盘的 Base64 内容。 */
function dataUrlBase64(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

/** 从图片数据 URL 创建可绘制的 HTMLImageElement。 */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片无法读取或 SVG 内容无效。'))
    image.src = dataUrl
  })
}

interface PixelComponent {
  x0: number
  x1: number
  y0: number
  y1: number
  count: number
  grayCount: number
  luminance: number
}

interface SliceCell {
  left: number
  top: number
  width: number
  height: number
  bottom: number
  labelBottom: number
  rawMax: number
}

/** 将原图缩小到分析尺寸，避免设计稿过大时占满渲染进程内存。 */
function createScaledCanvas(image: HTMLImageElement, maxWidth: number, maxScale = 1): { canvas: HTMLCanvasElement; scale: number } {
  const scale = Math.min(maxScale, maxWidth / image.naturalWidth)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前环境不支持 Canvas。')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return { canvas, scale }
}

/** 判断像素是否属于透明设计稿的前景。 */
function isForeground(data: Uint8ClampedArray, index: number, background: [number, number, number, number]): boolean {
  const alpha = data[index + 3]
  if (background[3] < 128) return alpha >= 96
  if (alpha < 96) return false
  return Math.abs(data[index] - background[0]) > 40 || Math.abs(data[index + 1] - background[1]) > 40 || Math.abs(data[index + 2] - background[2]) > 40
}

/** 用四邻域 BFS 获取设计稿中的前景连通域。 */
function detectComponents(imageData: ImageData): PixelComponent[] {
  const { width, height, data } = imageData
  const background: [number, number, number, number] = [data[0], data[1], data[2], data[3]]
  const visited = new Uint8Array(width * height)
  const components: PixelComponent[] = []
  const stack: number[] = []
  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || !isForeground(data, start * 4, background)) continue
    visited[start] = 1
    stack.push(start)
    const component: PixelComponent = { x0: start % width, x1: start % width, y0: Math.floor(start / width), y1: Math.floor(start / width), count: 0, grayCount: 0, luminance: 0 }
    while (stack.length > 0) {
      const current = stack.pop() as number
      const x = current % width
      const y = Math.floor(current / width)
      const pixel = current * 4
      const red = data[pixel]
      const green = data[pixel + 1]
      const blue = data[pixel + 2]
      component.count += 1
      component.luminance += (red + green + blue) / 3
      if (Math.max(red, green, blue) - Math.min(red, green, blue) <= 30) component.grayCount += 1
      component.x0 = Math.min(component.x0, x)
      component.x1 = Math.max(component.x1, x)
      component.y0 = Math.min(component.y0, y)
      component.y1 = Math.max(component.y1, y)
      for (const next of [current - 1, current + 1, current - width, current + width]) {
        const nextX = next % width
        if (next < 0 || next >= width * height || ((next === current - 1 || next === current + 1) && Math.abs(nextX - x) !== 1)) continue
        if (visited[next] || !isForeground(data, next * 4, background)) continue
        visited[next] = 1
        stack.push(next)
      }
    }
    if (component.count >= COMPONENT_MIN_PIXELS) components.push(component)
  }
  return components
}

/** 合并同一图标的多个碎片，文字连通域在此之前已被排除。 */
function mergeIconComponents(components: PixelComponent[]): Array<{ x0: number; x1: number; y0: number; y1: number }> {
  const iconComponents = components.filter((component) => {
    const width = component.x1 - component.x0 + 1
    const height = component.y1 - component.y0 + 1
    const grayRatio = component.grayCount / component.count
    const averageLuminance = component.luminance / component.count
    return !(grayRatio >= 0.95 && averageLuminance <= 140 && width <= 30 && height <= 30)
  })
  const parent = iconComponents.map((_, index) => index)
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]))
  for (let i = 0; i < iconComponents.length; i += 1) {
    for (let j = i + 1; j < iconComponents.length; j += 1) {
      const a = iconComponents[i]
      const b = iconComponents[j]
      if (a.x0 - 10 <= b.x1 + 10 && b.x0 - 10 <= a.x1 + 10 && a.y0 - 10 <= b.y1 + 10 && b.y0 - 10 <= a.y1 + 10) parent[find(i)] = find(j)
    }
  }
  const groups = new Map<number, { x0: number; x1: number; y0: number; y1: number }>()
  iconComponents.forEach((component, index) => {
    const root = find(index)
    const group = groups.get(root) ?? { x0: component.x0, x1: component.x1, y0: component.y0, y1: component.y1 }
    group.x0 = Math.min(group.x0, component.x0)
    group.x1 = Math.max(group.x1, component.x1)
    group.y0 = Math.min(group.y0, component.y0)
    group.y1 = Math.max(group.y1, component.y1)
    groups.set(root, group)
  })
  return [...groups.values()]
}

/** 按行列顺序生成图标裁剪框，文字区域留给 OCR。 */
function analyzeDesign(imageData: ImageData, scale: number, sourceWidth: number, sourceHeight: number): SliceCell[] {
  const clusters = mergeIconComponents(detectComponents(imageData))
    .map((cluster) => ({ x0: cluster.x0 / scale, x1: (cluster.x1 + 1) / scale, y0: cluster.y0 / scale, y1: (cluster.y1 + 1) / scale }))
    .filter((cluster) => cluster.x1 - cluster.x0 >= 12 / scale && cluster.y1 - cluster.y0 >= 20 / scale)
    .sort((a, b) => a.y0 - b.y0)
  if (clusters.length === 0) throw new Error('未检测到可切割的彩色图标，请确认设计稿背景透明或与前景有明显差异。')
  const rows: Array<{ top: number; items: typeof clusters }> = []
  clusters.forEach((cluster) => {
    const row = rows.find((candidate) => cluster.y0 - candidate.top <= 40 / scale)
    if (row) row.items.push(cluster)
    else rows.push({ top: cluster.y0, items: [cluster] })
  })
  const cells: SliceCell[] = []
  rows.forEach((row, rowIndex) => {
    row.items.sort((a, b) => (a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2)
    const labelBottom = rows[rowIndex + 1]?.top ?? sourceHeight
    row.items.forEach((cluster) => {
      const left = Math.max(0, cluster.x0 - 3)
      const top = Math.max(0, cluster.y0 - 3)
      const right = Math.min(sourceWidth, cluster.x1 + 3)
      const bottom = Math.min(sourceHeight, cluster.y1 + 3)
      cells.push({ left, top, width: right - left, height: bottom - top, bottom: cluster.y1, labelBottom, rawMax: Math.max(cluster.x1 - cluster.x0, cluster.y1 - cluster.y0) })
    })
  })
  return cells
}

/** 通过整图 TSV OCR 将文字标签按坐标分配到图标序号。 */
async function recognizeDesignLabels(image: HTMLImageElement, cells: SliceCell[]): Promise<string[]> {
  const { canvas, scale } = createScaledCanvas(image, OCR_MAX_WIDTH, OCR_TARGET_SCALE)
  const ocrCanvas = document.createElement('canvas')
  ocrCanvas.width = canvas.width
  ocrCanvas.height = canvas.height
  const ocrContext = ocrCanvas.getContext('2d')
  if (!ocrContext) throw new Error('当前环境不支持 Canvas。')
  ocrContext.fillStyle = '#ffffff'
  ocrContext.fillRect(0, 0, ocrCanvas.width, ocrCanvas.height)
  ocrContext.drawImage(canvas, 0, 0)
  const dataUrl = ocrCanvas.toDataURL('image/png')
  const result = await window.electronAPI?.recognizeSprite(dataUrl)
  if (!result) throw new Error('OCR 主进程不可用，请重启桌面端后重试。')
  const words = result.tsv.split('\n').flatMap((line) => {
    const columns = line.split('\t')
    if (columns.length < 12 || columns[0] !== '5') return []
    const text = columns[11].trim().replace(/[^0-9a-zA-Z\u4e00-\u9fa5%％¥￥·]+/g, '')
    const confidence = Number(columns[10])
    if (!text || confidence < LABEL_CONFIDENCE) return []
    return [{ text, x: Number(columns[6]) / scale, y: Number(columns[7]) / scale, width: Number(columns[8]) / scale, height: Number(columns[9]) / scale }]
  })
  return cells.map((cell) => {
    const centerX = cell.left + cell.width / 2
    const matches = words.filter((word) => {
      const wordCenterX = word.x + word.width / 2
      const wordCenterY = word.y + word.height / 2
      return wordCenterY > cell.bottom && wordCenterY < cell.labelBottom && Math.abs(wordCenterX - centerX) <= Math.max(cell.width * 1.2, 140)
    }).sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2) || a.x - b.x)
    return matches.length > 0 ? matches.map((word) => word.text).join('') : '待确认'
  })
}

/** 将设计稿图标裁剪并归一化到 270px 高清格子，生成可继续排布的素材列表。 */
export async function sliceDesignSprite(selection: SpriteSourceSelection): Promise<SpriteSliceResult> {
  const image = await loadImage(selection.dataUrl)
  const { canvas: analysisCanvas, scale } = createScaledCanvas(image, ANALYSIS_MAX_WIDTH)
  const analysisContext = analysisCanvas.getContext('2d')
  if (!analysisContext) throw new Error('当前环境不支持 Canvas。')
  const cells = analyzeDesign(analysisContext.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height), scale, image.naturalWidth, image.naturalHeight)
  let labels: string[]
  try {
    labels = await recognizeDesignLabels(image, cells)
  } catch {
    // OCR 模型首次加载可能需要网络；切片本身仍可完成，标签保留待确认状态供用户修正。
    labels = cells.map(() => '待确认')
  }
  const medianRawMax = [...cells].sort((a, b) => a.rawMax - b.rawMax)[Math.floor(cells.length / 2)].rawMax
  const maxRawMax = Math.max(...cells.map((cell) => cell.rawMax))
  const resizeScale = Math.min(ICON_TARGET_SIZE / medianRawMax, (TILE_SIZE * 0.98) / maxRawMax)
  const assets = cells.map((cell, index) => {
    const tile = document.createElement('canvas')
    tile.width = TILE_SIZE
    tile.height = TILE_SIZE
    const context = tile.getContext('2d')
    if (!context) throw new Error('当前环境不支持 Canvas。')
    const drawWidth = Math.min(Math.round(cell.width * resizeScale), TILE_SIZE)
    const drawHeight = Math.min(Math.round(cell.height * resizeScale), TILE_SIZE)
    const drawX = Math.floor((TILE_SIZE - drawWidth) / 2)
    const drawY = Math.floor((TILE_SIZE - drawHeight) / 2)
    context.drawImage(image, cell.left, cell.top, cell.width, cell.height, drawX, drawY, drawWidth, drawHeight)
    return {
      id: `${selection.path}-slice-${index}`,
      path: `${selection.path}#slice-${index}`,
      name: `${String(index + 1).padStart(2, '0')}-${labels[index] || '待确认'}.png`,
      dataUrl: tile.toDataURL('image/png'),
      mime: 'image/png',
      label: labels[index] || '待确认',
      width: TILE_SIZE,
      height: TILE_SIZE,
      ready: true,
      recognizing: false,
    } satisfies SpriteAsset
  })
  return { assets, sourceWidth: image.naturalWidth, sourceHeight: image.naturalHeight }
}

/** 计算一组素材的单元格与画布尺寸。 */
function calculateCanvasSize(assets: SpriteAsset[], options: SpriteLayoutOptions): { columns: number; rows: number; width: number; height: number; cellWidth: number; cellHeight: number } {
  const cellWidth = options.normalizeCells ? options.cellWidth : Math.max(...assets.map((asset) => asset.width), 1)
  const cellHeight = options.normalizeCells ? options.cellHeight : Math.max(...assets.map((asset) => asset.height), 1)
  const columns = options.columns > 0 ? Math.min(options.columns, assets.length) : Math.max(assets.length, 1)
  const rows = Math.ceil(assets.length / columns)
  return {
    columns,
    rows,
    cellWidth,
    cellHeight,
    width: options.padding * 2 + columns * cellWidth + Math.max(0, columns - 1) * options.gapX,
    height: options.padding * 2 + rows * cellHeight + Math.max(0, rows - 1) * options.gapY,
  }
}

/** 生成包含序号、文件名和识别标识的 Markdown 文档。 */
interface SpriteBuildMetadata {
  /** 导出文件名（不含扩展名）。 */
  fileName?: string
  /** 当前输出对应的源设计稿名称。 */
  sourceName?: string
}

function buildMarkdown(assets: SpriteAsset[], dimensions: { width: number; height: number }, options: SpriteLayoutOptions, metadata: SpriteBuildMetadata = {}): string {
  const columns = options.columns > 0 ? Math.min(options.columns, assets.length) : Math.max(assets.length, 1)
  const rows = assets.map((asset, index) => `| ${index} | ${asset.label || '未识别'} | ${asset.name} | ${asset.width} × ${asset.height} | ${Math.floor(index / columns)} | ${index % columns} |`).join('\n')
  const sourcePath = assets[0]?.path.split('#slice-')[0] ?? ''
  const sourceName = metadata.sourceName || sourcePath.split(/[\\/]/).pop() || '未记录'
  const fileName = metadata.fileName || 'stat-sprite'
  const spriteRows = Math.ceil(assets.length / columns)
  return [
    `# 雪碧图（${fileName}）使用说明`,
    '',
    '> 本文档由 API Workbench 雪碧图工具自动生成，请勿手动编辑序号表。',
    '> 设计稿先按连通域检测切出图标，再通过整图 OCR 将标签文字按坐标回填。',
    '',
    '## 一、文件说明',
    '',
    '| 雪碧图文件 | 源设计稿 | 图标数 | 雪碧图规格 | 格子尺寸 |',
    '| --- | --- | ---: | ---: | ---: |',
    `| ${fileName} | ${sourceName} | ${assets.length} | ${dimensions.width}×${dimensions.height}px | ${options.cellWidth}×${options.cellHeight}px |`,
    '',
    '> 图标按设计稿阅读顺序切片，透明背景输出；当前页面使用高清 3x 格子时，逻辑格尺寸为 90×90px。',
    '',
    '## 二、图标序号对照表',
    '',
    '序号从 0 开始，按从左到右、从上到下排列。',
    '',
    '| 序号 | 含义 | 切片文件 | 原始尺寸 | 所在行 | 所在列 |',
    '| ---: | --- | --- | ---: | ---: | ---: |',
    rows,
    '',
    '## 三、取图方式',
    '',
    '```ts',
    `const SPRITE_COLS = ${columns};`,
    `const SPRITE_ROWS = ${spriteRows};`,
    'const col = index % SPRITE_COLS;',
    'const row = Math.floor(index / SPRITE_COLS);',
    `const backgroundSize = \`\${SPRITE_COLS * ${options.cellWidth / 3}}px \${SPRITE_ROWS * ${options.cellHeight / 3}}px\`;`,
    `const backgroundPosition = \`-\${col * ${options.cellWidth / 3}}px -\${row * ${options.cellHeight / 3}}px\`;`,
    '```',
    '',
    '## 四、识别说明',
    '',
    '> OCR 首次运行可能需要加载中文语言包；识别失败的项目会保留“待确认”，可在素材列表中手动修改。',
    '',
  ].join('\n')
}

/** XML 转义，确保文件名或原始 SVG 内容不会破坏外层 SVG。 */
function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] as string)
}

/** 根据同一套排列规则生成内嵌素材的 SVG 雪碧图。 */
function buildSvg(assets: SpriteAsset[], images: HTMLImageElement[], dimensions: { columns: number; width: number; height: number; cellWidth: number; cellHeight: number }, options: SpriteLayoutOptions): string {
  const items = images.map((image, index) => {
    const column = index % dimensions.columns
    const row = Math.floor(index / dimensions.columns)
    const cellX = options.padding + column * (dimensions.cellWidth + options.gapX)
    const cellY = options.padding + row * (dimensions.cellHeight + options.gapY)
    const scale = Math.min(dimensions.cellWidth / image.naturalWidth, dimensions.cellHeight / image.naturalHeight, 1)
    const drawWidth = options.normalizeCells || options.objectFit === 'contain' ? image.naturalWidth * scale : image.naturalWidth
    const drawHeight = options.normalizeCells || options.objectFit === 'contain' ? image.naturalHeight * scale : image.naturalHeight
    const drawX = cellX + (dimensions.cellWidth - drawWidth) / 2
    const drawY = cellY + (dimensions.cellHeight - drawHeight) / 2
    return `<image href="${escapeXml(assets[index].dataUrl)}" x="${drawX}" y="${drawY}" width="${drawWidth}" height="${drawHeight}" preserveAspectRatio="none" />`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}"><title>雪碧图</title>${items}</svg>`
}

/** 生成透明背景 PNG 雪碧图与配套 Markdown。 */
export async function buildSprite(assets: SpriteAsset[], options: SpriteLayoutOptions, metadata: SpriteBuildMetadata = {}): Promise<SpriteBuildResult> {
  if (assets.length === 0) throw new Error('请先添加至少一张图片。')
  const images = await Promise.all(assets.map((asset) => loadImage(asset.dataUrl)))
  const dimensions = calculateCanvasSize(assets, options)
  const canvas = document.createElement('canvas')
  canvas.width = dimensions.width
  canvas.height = dimensions.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前环境不支持 Canvas。')
  context.clearRect(0, 0, canvas.width, canvas.height)

  images.forEach((image, index) => {
    const column = index % dimensions.columns
    const row = Math.floor(index / dimensions.columns)
    const cellX = options.padding + column * (dimensions.cellWidth + options.gapX)
    const cellY = options.padding + row * (dimensions.cellHeight + options.gapY)
    const scale = Math.min(dimensions.cellWidth / image.naturalWidth, dimensions.cellHeight / image.naturalHeight, 1)
    const drawWidth = options.normalizeCells || options.objectFit === 'contain' ? image.naturalWidth * scale : image.naturalWidth
    const drawHeight = options.normalizeCells || options.objectFit === 'contain' ? image.naturalHeight * scale : image.naturalHeight
    const drawX = cellX + (dimensions.cellWidth - drawWidth) / 2
    const drawY = cellY + (dimensions.cellHeight - drawHeight) / 2
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight)
  })

  const dataUrl = canvas.toDataURL('image/png')
  const svg = buildSvg(assets, images, dimensions, options)
  return {
    width: dimensions.width,
    height: dimensions.height,
    dataUrl,
    base64: dataUrlBase64(dataUrl),
    svg,
    svgDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    markdown: buildMarkdown(assets, dimensions, options, metadata),
  }
}
