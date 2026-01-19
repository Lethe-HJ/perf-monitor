<script setup lang="ts">
import { ref, onUnmounted, onMounted } from 'vue'
import { 
  PerformanceMonitor, 
  markFunction, 
  injectPerformanceControls, 
  removePerformanceControls,
  createPerformanceCallbacks,
  getMainThreadInstrumentation
} from '@/index'

// 标记主线程函数
markFunction('renderImage', {
  category: 'render',
  description: '渲染图片到 Canvas',
  color: '#4ecdc4',
})

markFunction('composeGrid', {
  category: 'render',
  description: '组合九宫格',
  color: '#95e1d3',
})

// 性能监控实例
const performanceMonitor = new PerformanceMonitor({
  sampleInterval: 10,
  memorySampleInterval: 100,
  enableGC: true,
  enableNetwork: true,
  enableGPU: true,
})

// 主线程插桩实例（用于补充采样模式可能不可用的情况）
const mainThreadInstrumentation = getMainThreadInstrumentation('web-main')

// 状态
const isLoading = ref(false)
const isAnalyzing = ref(false)

// 九宫格图片数据
interface ImageItem {
  id: number
  loaded: boolean
  imageData: any | null
  loadTime: number | null
  position: number | null
}

const images = ref<ImageItem[]>(
  Array.from({ length: 9 }, (_, i) => ({
    id: i,
    loaded: false,
    imageData: null,
    loadTime: null,
    position: null,
  }))
)

const renderOrder = ref<number[]>([])
const workers: Worker[] = []

// 生成大图片 URL
// 使用本地资源文件夹中的 Kodak 测试图片集（前9张，尺寸一致）
function generateLargeImageUrl(id: number): string {
  // id 范围是 0-8，对应图片编号 1-9
  const imageNumber = String(id + 1).padStart(2, '0')
  return `/images/kodim${imageNumber}.png`
  
  // 备选方案：
  // 方案 1：使用在线图片服务
  // return `https://source.unsplash.com/8000x6000/?nature,landscape&sig=${id}`
  
  // 方案 2：使用 Picsum Photos
  // return `https://picsum.photos/8000/6000?random=${id}`
}

// 开始加载图片
async function startLoading() {
  if (isLoading.value) return

  // 插桩：开始加载图片
  const endStartLoading = mainThreadInstrumentation.startFunction('startLoading')

  isLoading.value = true
  renderOrder.value = []
  
  // 重置图片状态
  images.value = Array.from({ length: 9 }, (_, i): ImageItem => ({
    id: i,
    loaded: false,
    imageData: null,
    loadTime: null,
    position: null,
  }))

  // 注意：性能监控由浮动按钮控制，这里不再自动启动
  // 如果需要在加载图片时自动启动，可以取消下面的注释
  // try {
  //   await performanceMonitor.start()
  // } catch (error) {
  //   console.warn('Performance monitoring initialization error:', error)
  // }

  // 创建 9 个 Worker 并发加载图片
  const workerPromises = images.value.map((image) => {
    return new Promise<void>((resolve, reject) => {
      const worker = new Worker(
        new URL('./workers/image-worker.ts', import.meta.url),
        { type: 'module' }
      )

      workers.push(worker)
      const workerId = `worker-${image.id}`

      worker.onmessage = async (event) => {
        const { type, workerId: msgWorkerId, imageData, loadTime, error, perfData } = event.data

        // 收集 Worker 性能数据（新的 IndexedDB 方式）
        if (type === 'PERF_DATA_RESPONSE' && perfData) {
          // 一次性获取所有性能数据
          if (Array.isArray(perfData)) {
            perfData.forEach((data) => {
              performanceMonitor.addWorkerPerformanceData(data)
            })
          }
          return
        }

        // 性能数据错误
        if (type === 'PERF_DATA_ERROR') {
          console.warn(`[Worker ${msgWorkerId}] 获取性能数据失败:`, error)
          return
        }

        // 旧的实时发送方式（已弃用，但保留兼容）
        if (type === 'PERF_DATA' && event.data.data) {
          performanceMonitor.addWorkerPerformanceData(event.data.data)
          return
        }

        if (type === 'IMAGE_LOADED') {
          // 插桩：处理 Worker 返回的图片数据
          const endHandleImageLoaded = mainThreadInstrumentation.startFunction(`handleImageLoaded-${image.id}`)
          
          const imageIndex = parseInt((msgWorkerId || workerId).split('-')[1] || '0')
          
          // 记录加载顺序
          renderOrder.value.push(imageIndex)
          
          // 更新图片数据
          const targetImage = images.value[imageIndex]
          if (targetImage) {
            targetImage.loaded = true
            targetImage.loadTime = loadTime
            
            // 立即渲染（先完成先渲染）
            if (imageData) {
              await renderImage(imageIndex, imageData)
            }
          }
          
          endHandleImageLoaded()
          resolve()
        } else if (type === 'IMAGE_ERROR') {
          const errorMsg = error || 'Unknown error'
          console.error(`Worker ${msgWorkerId || workerId} error:`, errorMsg)
          // 不立即 reject，允许其他 Worker 继续工作
          // 可以选择部分失败或全部失败
          reject(new Error(`Worker ${msgWorkerId || workerId}: ${errorMsg}`))
        }
      }

      worker.onerror = (error) => {
        console.error(`Worker error:`, error)
        reject(error)
      }

      // 插桩：创建 Worker
      const endCreateWorker = mainThreadInstrumentation.startFunction(`createWorker-${image.id}`)
      
      // 先发送初始化消息（传入 workerId）
      worker.postMessage({
        type: 'INIT_WORKER',
        workerId,
      })

      // 然后发送加载任务（不再需要 workerId，因为已在初始化时传入）
      worker.postMessage({
        type: 'LOAD_IMAGE',
        imageUrl: generateLargeImageUrl(image.id),
      })
      
      endCreateWorker()
    })
  })

  // 等待所有 Worker 完成（允许部分失败）
  try {
    // 使用 allSettled 允许部分成功
    const results = await Promise.allSettled(workerPromises)
    
    // 统计成功和失败的数量
    const succeeded = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    
    if (failed > 0) {
      console.warn(`图片加载完成：成功 ${succeeded} 个，失败 ${failed} 个`)
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`图片 ${index} 加载失败:`, result.reason)
        }
      })
    } else {
      console.log(`所有 ${succeeded} 个图片加载成功`)
    }
    
    // 继续监控 1 秒以捕获最后的渲染和 GC
    setTimeout(async () => {
      // 插桩：收集性能数据
      const endCollectPerfData = mainThreadInstrumentation.startFunction('collectPerformanceData')
      
      // 在停止记录前，从所有 Worker 获取性能数据（IndexedDB 方式）
      console.log('[App] 从 Workers 获取性能数据...')
      const perfDataPromises = workers.map((worker) => {
        return new Promise<void>((resolve) => {
          // 设置超时，避免等待过久
          const timeout = setTimeout(() => {
            console.warn('[App] Worker 获取性能数据超时')
            resolve()
          }, 5000)

          // 监听一次性响应
          const handler = async (event: MessageEvent) => {
            const { type, workerId, perfData } = event.data
            if (type === 'PERF_DATA_RESPONSE' && perfData) {
              clearTimeout(timeout)
              worker.removeEventListener('message', handler)
              // 批量添加性能数据
              if (Array.isArray(perfData)) {
                perfData.forEach((data) => {
                  performanceMonitor.addWorkerPerformanceData(data)
                })
                console.log(`[App] Worker ${workerId} 返回 ${perfData.length} 条性能数据`)
              }
              resolve()
            } else if (type === 'PERF_DATA_ERROR') {
              clearTimeout(timeout)
              worker.removeEventListener('message', handler)
              console.warn(`[App] Worker ${workerId} 获取性能数据失败:`, event.data.error)
              resolve()
            }
          }
          worker.addEventListener('message', handler)

          // 发送获取数据请求
          worker.postMessage({ type: 'GET_PERF_DATA' })
        })
      })

      // 等待所有 Worker 返回数据（最多等待 5 秒）
      await Promise.all(perfDataPromises)
      console.log('[App] 所有 Worker 性能数据已收集完成')

      endCollectPerfData()

      // 收集主线程插桩数据并添加到监控器
      const mainThreadPerfData = mainThreadInstrumentation.getAllPerformanceData()
      if (mainThreadPerfData.length > 0) {
        console.log(`[App] 收集到 ${mainThreadPerfData.length} 条主线程插桩数据`)
        performanceMonitor.addMainThreadInstrumentationDataBatch(mainThreadPerfData)
      }

      // 然后停止监控并生成 Profile
      await performanceMonitor.stop()
      isLoading.value = false
      
      endStartLoading()
    }, 1000)
  } catch (error) {
    console.error('Failed to load images:', error)
    isLoading.value = false
  }
}

// 渲染图片到九宫格
async function renderImage(imageIndex: number, imageDataObj: any) {
  // 插桩：渲染图片
  const endRenderImage = mainThreadInstrumentation.startFunction(`renderImage-${imageIndex}`)
  
  const renderStart = performance.now()
  
  const canvas = document.querySelector(`#canvas-${imageIndex}`) as HTMLCanvasElement
  if (!canvas) {
    endRenderImage()
    return
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    endRenderImage()
    return
  }

  // 插桩：准备 ImageData
  const endPrepareImageData = mainThreadInstrumentation.startFunction(`prepareImageData-${imageIndex}`)
  
  // 将 ImageData 数据恢复
  const imageData = new ImageData(
    new Uint8ClampedArray(imageDataObj.data),
    imageDataObj.width,
    imageDataObj.height
  )

  endPrepareImageData()

  // 插桩：调整画布大小
  const endResizeCanvas = mainThreadInstrumentation.startFunction(`resizeCanvas-${imageIndex}`)

  // 调整画布大小
  canvas.width = imageData.width
  canvas.height = imageData.height

  // 绘制图片（缩放以适应单元格）
  const cellSize = 300 // 单元格大小
  const scale = Math.min(cellSize / imageData.width, cellSize / imageData.height)
  const scaledWidth = imageData.width * scale
  const scaledHeight = imageData.height * scale

  canvas.width = scaledWidth
  canvas.height = scaledHeight

  endResizeCanvas()

  // 插桩：绘制图片
  const endDrawImage = mainThreadInstrumentation.startFunction(`drawImage-${imageIndex}`)

  // 使用临时 canvas 缩放图片
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = imageData.width
  tempCanvas.height = imageData.height
  const tempCtx = tempCanvas.getContext('2d')!
  tempCtx.putImageData(imageData, 0, 0)

  ctx.drawImage(tempCanvas, 0, 0, scaledWidth, scaledHeight)

  endDrawImage()

  const renderEnd = performance.now()
  console.log(`Image ${imageIndex} rendered in ${renderEnd - renderStart}ms`)
  
  endRenderImage()
}

// 注入性能分析控制按钮
onMounted(async () => {
  // 使用主项目提供的辅助函数创建回调
  const callbacks = createPerformanceCallbacks(performanceMonitor)
  
  // 扩展 onRefresh 回调，添加应用特定的重置逻辑
  const originalRefresh = callbacks.onRefresh
  callbacks.onRefresh = () => {
    // 调用主项目的重置逻辑
    originalRefresh()
    
    // 应用特定的重置逻辑
    images.value = Array.from({ length: 9 }, (_, i) => ({
      id: i,
      loaded: false,
      imageData: null,
      loadTime: null,
      position: null,
    }))
    renderOrder.value = []
    isLoading.value = false
    
    // 重置主线程插桩数据
    mainThreadInstrumentation.clear()
    
    // 清空所有 canvas
    for (let i = 0; i < 9; i++) {
      const canvas = document.querySelector(`#canvas-${i}`) as HTMLCanvasElement
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
        }
      }
    }
  }
  
  await injectPerformanceControls(callbacks)
  console.log('[Performance Monitor] 控制按钮已注入')
})

// 清理 Worker
onUnmounted(() => {
  removePerformanceControls()
  workers.forEach((worker) => worker.terminate())
  performanceMonitor.clear()
})
</script>

<template>
  <div class="app">
    <div class="controls">
      <button 
        @click="startLoading" 
        :disabled="isLoading"
        class="btn btn-primary"
      >
        {{ isLoading ? '加载中...' : '开始加载图片' }}
      </button>
      
    </div>

    <div class="image-grid">
      <div 
        v-for="(image, index) in images" 
        :key="image.id"
        class="grid-item"
      >
        <canvas :id="`canvas-${index}`" class="canvas"></canvas>
        <div v-if="!image.loaded && !isLoading" class="placeholder">
          图片 {{ index + 1 }}
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.app {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.controls {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.btn {
  padding: 10px 20px;
  border: 1px solid #ccc;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #007bff;
  color: white;
  border-color: #007bff;
}

.btn-secondary {
  background: #6c757d;
  color: white;
  border-color: #6c757d;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 20px;
}

.grid-item {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border: 1px solid #ddd;
  overflow: hidden;
  background: #f5f5f5;
}

.canvas {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #999;
  font-size: 14px;
}

.performance-viewer {
  margin-top: 20px;
  padding: 20px;
  border: 1px solid #ddd;
  background: #fff;
}

.performance-viewer h3 {
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 18px;
}

.profile-info {
  margin-top: 10px;
}

.profile-info p {
  margin: 5px 0;
  font-size: 14px;
  color: #666;
}

.profile-stats {
  margin-top: 15px;
  padding: 15px;
  background: #f5f5f5;
  border-radius: 4px;
}

.profile-stats p {
  margin: 8px 0;
  font-size: 14px;
}

.profile-stats strong {
  color: #333;
  margin-right: 8px;
}

.profile-actions {
  margin-top: 15px;
}

.btn-download {
  background: #28a745;
  color: white;
  border-color: #28a745;
}

.btn-download:hover {
  background: #218838;
  border-color: #1e7e34;
}
</style>
