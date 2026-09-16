import type { SpriteOutputFormat, SpritePlacement } from './types'

interface ConfigOutput {
  name: string
  placements: SpritePlacement[]
  width: number
  height: number
}

/** 生成紧凑模式配套的可查询 CSS 配置模块。 */
export function buildSpriteConfigModule(outputs: ConfigOutput[], format: SpriteOutputFormat): string {
  let value = 0
  const entries = outputs.flatMap((output) => output.placements.map((placement) => ({
    label: placement.label,
    value: value++,
    sprite: `${output.name}.${format}`,
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
  })))
  const grouped = outputs.reduce<Record<string, typeof entries>>((result, output) => {
    result[output.name] = entries.filter((entry) => entry.sprite === `${output.name}.${format}`)
    return result
  }, {})
  const serialized = JSON.stringify(entries, null, 2)
  const groupedSerialized = JSON.stringify(grouped, null, 2)
  const dimensions = Object.fromEntries(outputs.map((output) => [output.name, { width: output.width, height: output.height }]))
  const dimensionsSerialized = JSON.stringify(dimensions, null, 2)
  return `/**
 * API Workbench 雪碧图紧凑模式配置。
 * value 为本次导出配置中的全局序号，label 为识别或手动修正后的名称。
 */
export const SPRITE_CONFIG = ${serialized}

/** 按导出的雪碧图名称分组，key 不包含 .png/.svg 后缀。 */
export const SPRITE_CONFIG_BY_SPRITE = ${groupedSerialized}

/** 各雪碧图的原始尺寸，供 SpriteIcon.vue 缩放背景图。 */
export const SPRITE_DIMENSIONS = ${dimensionsSerialized}

/** 根据 label 或 value 返回 CSS；传入 spriteName 可限定某个雪碧图。 */
export function getSpriteCss(query, spriteName) {
  const groupName = typeof spriteName === 'string' ? spriteName.replace(/\.(?:png|svg)$/i, '') : ''
  const source = groupName ? (SPRITE_CONFIG_BY_SPRITE[groupName] || []) : SPRITE_CONFIG
  const item = typeof query === 'number'
    ? source.find((entry) => entry.value === query)
    : source.find((entry) => entry.label === query)
  if (!item) return null
  return {
    display: 'inline-block',
    width: \`${'${item.width}'}px\`,
    height: \`${'${item.height}'}px\`,
    backgroundImage: \`url('./${'${item.sprite}'}')\`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: \`-${'${item.x}'}px -${'${item.y}'}px\`,
  }
}

/** 根据 label 或 value 返回普通 CSS 文本。 */
export function getSpriteCssText(query, spriteName) {
  const style = getSpriteCss(query, spriteName)
  if (!style) return ''
  return Object.entries(style).map(([key, value]) => \`${'${key}'}:${'${value}'}\`).join(';')
}

export default SPRITE_CONFIG
`
}
