import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import type { Plugin } from 'vite'
import { autoOpenProfilePlugin } from './plugins/auto-open-profile-plugin'

// 创建插件：根据 VITE_MONITOR 环境变量条件性地添加 Document Policy
// 同时设置 HTTP 响应头和 HTML meta 标签
function monitorPlugin(enableMonitor: boolean): Plugin {
  return {
    name: 'monitor-plugin',
    configureServer(server) {
      if (enableMonitor) {
        console.log('[Monitor Plugin] 已启用 JS Self-Profiling API')
        // 在开发服务器中设置 HTTP 响应头
        server.middlewares.use((req, res, next) => {
          // 为 HTML 文件添加 Document-Policy 响应头
          // js-profiling 应该是一个布尔值，不需要 =*
          if (req.url && (req.url === '/' || req.url.endsWith('.html'))) {
            res.setHeader('Document-Policy', 'js-profiling')
          }
          next()
        })
      }
    },
    transformIndexHtml(html: string) {
      if (enableMonitor) {
        // 如果已存在，则不重复添加
        if (html.includes('Document-Policy') && html.includes('js-profiling')) {
          return html
        }
        // 在 head 标签中添加 meta 标签
        // js-profiling 应该是一个布尔值，不需要 =*
        return html.replace(
          /<head>/i,
          `<head>\n    <meta http-equiv="Document-Policy" content="js-profiling" />`
        )
      } else {
        // 如果 __MONITOR__ 为 false，移除 meta 标签
        return html.replace(
          /<meta\s+http-equiv="Document-Policy"\s+content="js-profiling"\s*\/?>\s*/gi,
          ''
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(() => {
  // 从环境变量读取 VITE_MONITOR 配置，默认为 false
  // 可以通过设置环境变量 VITE_MONITOR=true 来启用
  const enableMonitor = process.env.VITE_MONITOR === 'true'
  
  return {
    plugins: [
      vue(),
      monitorPlugin(enableMonitor),
      autoOpenProfilePlugin(),
    ],
    define: {
      // 在代码中可以使用 __MONITOR__ 变量
      __MONITOR__: JSON.stringify(enableMonitor),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '../../src'),
      },
    },
    worker: {
      format: 'es' as const,
    },
  }
})
