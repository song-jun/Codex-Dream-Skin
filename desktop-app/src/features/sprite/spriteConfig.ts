import type { SpriteOutputFormat, SpritePlacement } from './types'

interface ConfigOutput {
  name: string
  placements: SpritePlacement[]
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
  const serialized = JSON.stringify(entries, null, 2)
  return `/**
 * API Workbench 雪碧图紧凑模式配置。
 * value 为本次导出配置中的全局序号，label 为识别或手动修正后的名称。
 */
export const SPRITE_CONFIG = ${serialized}

/** 根据 label 或 value 返回可直接用于 Vue :style 的 CSS 对象。 */
export function getSpriteCss(query) {
  const item = typeof query === 'number'
    ? SPRITE_CONFIG.find((entry) => entry.value === query)
    : SPRITE_CONFIG.find((entry) => entry.label === query)
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
export function getSpriteCssText(query) {
  const style = getSpriteCss(query)
  if (!style) return ''
  return Object.entries(style).map(([key, value]) => \`${'${key}'}:${'${value}'}\`).join(';')
}

export default SPRITE_CONFIG
`
}
