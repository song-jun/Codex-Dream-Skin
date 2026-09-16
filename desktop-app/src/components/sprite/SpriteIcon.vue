<!--
  组件名称：SpriteIcon
  组件职责：根据雪碧图配置按 label/value 渲染单个图标，也支持预览场景直接传入图标条目。
  属性：label、value、sprite、size、entry、config、spriteUrls、configFile。
  事件：无；异常：配置文件加载失败或找不到图标时不渲染内容。
-->
<template>
  <span v-if="iconStyle" class="sprite-icon" :style="iconStyle" :aria-label="label" />
</template>

<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'

/** SpriteIcon 可查询的单个图标配置。 */
interface SpriteIconEntry {
  label: string
  value: number
  sprite: string
  x: number
  y: number
  width: number
  height: number
}

/** SpriteIcon 使用的配置数据。 */
interface SpriteIconConfig {
  entries: SpriteIconEntry[]
  dimensions: Record<string, { width: number; height: number }>
}

interface SpriteConfigModule {
  SPRITE_CONFIG?: SpriteIconEntry[]
  SPRITE_DIMENSIONS?: Record<string, { width: number; height: number }>
}

const props = defineProps<{
  /** 按名称查询图标。 */
  label?: string
  /** 按全局序号查询图标。 */
  value?: number
  /** 多个雪碧图中存在同名 label 时指定雪碧图名称。 */
  sprite?: string
  /** 限制图标最大边尺寸，单位为 px。 */
  size?: number
  /** 预览场景直接指定条目，避免重复 label 选错图标。 */
  entry?: SpriteIconEntry
  /** 预览场景传入内存中的配置。 */
  config?: SpriteIconConfig
  /** 预览场景传入雪碧图数据 URL，key 为雪碧图文件名。 */
  spriteUrls?: Record<string, string>
  /** 导出后配置文件的相对路径，默认读取同目录 sprite-config.js。 */
  configFile?: string
}>()

const loadedConfig = shallowRef<SpriteIconConfig | null>(null)

/** 从导出的配置模块加载组件所需的数据。 */
async function loadConfig(configFile?: string) {
  if (props.config) return
  const modulePath = configFile || './sprite-config.js'
  try {
    const module = await import(/* @vite-ignore */ modulePath) as SpriteConfigModule
    loadedConfig.value = { entries: module.SPRITE_CONFIG || [], dimensions: module.SPRITE_DIMENSIONS || {} }
  } catch {
    loadedConfig.value = null
  }
}

watch(() => props.config, (config) => {
  loadedConfig.value = config || null
  if (!config) void loadConfig(props.configFile)
}, { immediate: true })
watch(() => props.configFile, (configFile) => {
  if (!props.config) void loadConfig(configFile)
})

const resolvedConfig = computed(() => props.config || loadedConfig.value)
const iconEntry = computed(() => {
  if (props.entry) return props.entry
  const source = resolvedConfig.value?.entries || []
  const spriteName = props.sprite?.replace(/\.(?:png|svg)$/i, '')
  const scoped = spriteName ? source.filter((entry) => entry.sprite.replace(/\.(?:png|svg)$/i, '') === spriteName) : source
  return typeof props.value === 'number'
    ? scoped.find((entry) => entry.value === props.value)
    : scoped.find((entry) => entry.label === props.label)
})
const iconStyle = computed(() => {
  const item = iconEntry.value
  if (!item) return null
  const sourceImage = props.spriteUrls?.[item.sprite] || item.sprite
  const scale = props.size && props.size > 0 ? props.size / Math.max(item.width, item.height) : 1
  const spriteName = item.sprite.replace(/\.(?:png|svg)$/i, '')
  const dimensions = resolvedConfig.value?.dimensions[spriteName]
  return {
    display: 'inline-block',
    width: `${item.width * scale}px`,
    height: `${item.height * scale}px`,
    backgroundImage: `url(${sourceImage})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: dimensions ? `${dimensions.width * scale}px ${dimensions.height * scale}px` : undefined,
    backgroundPosition: `-${item.x * scale}px -${item.y * scale}px`,
  }
})
</script>

<style scoped>
.sprite-icon { display: inline-block; background-repeat: no-repeat; vertical-align: middle; }
</style>
