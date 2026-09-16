import type { SpriteLayoutOptions } from './types'

/** 雪碧图工具支持的素材文件扩展名。 */
export const SPRITE_EXTENSIONS = ['PNG', 'JPG', 'JPEG', 'SVG'] as const

/** 雪碧图工具的默认排列配置。 */
export const DEFAULT_SPRITE_LAYOUT: SpriteLayoutOptions = {
  packingMode: 'grid',
  columns: 10,
  gapX: 16,
  gapY: 16,
  padding: 24,
  normalizeCells: true,
  cellWidth: 96,
  cellHeight: 96,
  objectFit: 'contain',
}

/** 排列设置各字段的交互说明。 */
export const SPRITE_LAYOUT_TOOLTIPS = {
  packingMode: '统一网格适合按行列取图；紧凑自适应会裁掉透明边缘并记录每个图标坐标。',
  columns: '每行放置的图标数量，0 表示自动横排。',
  gapX: '相邻图标之间的水平间距，单位为像素。',
  gapY: '相邻图标之间的垂直间距，单位为像素。',
  padding: '雪碧图画布四周的留白，单位为像素。',
  normalizeCells: '开启后，所有图标使用统一的单元格尺寸。',
  cellWidth: '统一单元格的宽度，单位为像素。',
  cellHeight: '统一单元格的高度，单位为像素。',
} as const

/** 支持的图片 MIME 类型。 */
export const SPRITE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'] as const
