import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { resolve } from 'node:path'

const maxProxyResponseBytes = 10 * 1024 * 1024

/** 开发环境代理自定义 Swagger/OpenAPI 请求，避免浏览器 CORS 拦截。 */
function swaggerProxyPlugin() {
  return {
    name: 'swagger-openapi-proxy',
    configureServer(server: { middlewares: { use: (path: string, handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>) => void } }) {
      server.middlewares.use('/swagger-proxy', async (req, res) => {
        try {
          const sourceUrl = new URL(req.url || '/', 'http://127.0.0.1').searchParams.get('url')
          if (!sourceUrl) throw new Error('缺少请求地址')
          const target = new URL(sourceUrl)
          if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('请求地址无效')
          const response = await fetch(target, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
          const contentLength = Number(response.headers.get('content-length') || 0)
          if (contentLength > maxProxyResponseBytes) throw new Error('响应内容过大')
          const body = await response.arrayBuffer()
          if (body.byteLength > maxProxyResponseBytes) throw new Error('响应内容过大')
          res.statusCode = response.status
          res.setHeader('content-type', response.headers.get('content-type') || 'application/json; charset=utf-8')
          res.end(Buffer.from(body))
        } catch (error) {
          res.statusCode = 502
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : '代理请求失败' }))
        }
      })
    },
  }
}

export default defineConfig({
  envPrefix: ['VITE_', 'OPENAPI_'],
  plugins: [
    vue(),
    swaggerProxyPlugin(),
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
