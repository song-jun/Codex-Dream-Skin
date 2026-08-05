import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { resolve } from 'node:path'

export default defineConfig({
  envPrefix: ['VITE_', 'OPENAPI_'],
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
      imports: ['vue', 'vue-router'],
      dts: false,
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: false,
    }),
  ],
  base: './',
  clearScreen: false,
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: 'dist-ui',
    emptyOutDir: true,
    // pinyin 携带全量汉字词典，作为按需加载的独立块保留构建提示余量。
    chunkSizeWarningLimit: 6200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')

          if (normalizedId.includes('/src/core/dict/')) return 'core-dictionary'
          if (normalizedId.includes('/src/core/')) return 'core-generator'
          if (normalizedId.includes('/node_modules/pinyin/')) return 'pinyin'
          if (!normalizedId.includes('/node_modules/')) return
          if (normalizedId.includes('/@element-plus/icons-vue/')) return 'element-icons'
          if (normalizedId.includes('/highlight.js/')) return 'highlight'
          if (normalizedId.includes('/element-plus/')) return 'element-plus'
          if (
            normalizedId.includes('/node_modules/vue/') ||
            normalizedId.includes('/node_modules/pinia/') ||
            normalizedId.includes('/node_modules/vue-router/') ||
            normalizedId.includes('/node_modules/@vue/')
          ) return 'vue-vendor'
        },
      },
      onwarn(warning, warn) {
        if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('@vueuse/core')) return
        if (warning.message?.includes('#__PURE__')) return
        warn(warning)
      },
    },
  },
})
