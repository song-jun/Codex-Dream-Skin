/**
 * 雪碧图素材的来源与识别状态。
 */
export interface SpriteAsset {
  /** 素材的稳定标识。 */
  id: string
  /** 原始文件路径。 */
  path: string
  /** 文件名。 */
  name: string
  /** 浏览器可加载的数据 URL。 */
  dataUrl: string
  /** 图片 MIME 类型。 */
  mime: string
  /** 识别或手动编辑后的标识文字。 */
  label: string
  /** 由图片实际尺寸计算的宽度。 */
  width: number
  /** 由图片实际尺寸计算的高度。 */
  height: number
  /** 图片读取是否完成。 */
  ready: boolean
  /** OCR 是否正在执行。 */
  recognizing: boolean
  /** OCR 失败时的提示。 */
  recognitionError?: string
}

/** 用户选择的原始设计稿文件。 */
export interface SpriteSourceSelection {
  /** 原始文件路径。 */
  path: string
  /** 原始文件名。 */
  name: string
  /** 图片 MIME 类型。 */
  mime: string
  /** 图片数据 URL。 */
  dataUrl: string
}

/** 设计稿自动切片结果。 */
export interface SpriteSliceResult {
  /** 按设计稿阅读顺序排列的图标素材。 */
  assets: SpriteAsset[]
  /** 设计稿原始宽度。 */
  sourceWidth: number
  /** 设计稿原始高度。 */
  sourceHeight: number
}

/**
 * 雪碧图排列配置。
 */
export interface SpriteLayoutOptions {
  /** 每行最多放置的图片数量，0 表示自动换行。 */
  columns: number
  /** 图片之间的水平间距。 */
  gapX: number
  /** 图片之间的垂直间距。 */
  gapY: number
  /** 画布内边距。 */
  padding: number
  /** 是否将每个素材统一到同一单元格尺寸。 */
  normalizeCells: boolean
  /** 单元格宽度。 */
  cellWidth: number
  /** 单元格高度。 */
  cellHeight: number
  /** 图片在单元格中的对齐方式。 */
  objectFit: 'contain' | 'center'
}

/**
 * 生成结果，包括图片数据和 Markdown 文档。
 */
export interface SpriteBuildResult {
  /** 导出的雪碧图宽度。 */
  width: number
  /** 导出的雪碧图高度。 */
  height: number
  /** PNG 数据 URL。 */
  dataUrl: string
  /** 不含 data URL 头的 PNG Base64。 */
  base64: string
  /** 内嵌原始素材的 SVG 文本。 */
  svg: string
  /** SVG 预览数据 URL。 */
  svgDataUrl: string
  /** 标识映射 Markdown。 */
  markdown: string
}

/** 设计稿生成模式。 */
export type SpriteDesignMode = 'separate' | 'merge'

/** 雪碧图导出格式。 */
export type SpriteOutputFormat = 'png' | 'svg'
