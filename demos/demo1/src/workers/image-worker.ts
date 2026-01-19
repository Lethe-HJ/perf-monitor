/**
 * 图片加载 Worker
 * 负责下载大图片并处理
 * 使用插桩模式（Instrumentation Mode）进行性能监控
 */

import { initWorkerProfiler, workerProfiler } from '../../../../src/core/worker-profiler.js';
import { setWorkerProfiler } from '../../../../src/core/instrument-decorator.js';
import { markFunction } from '../../../../src/core/function-marker.js';

// 标记关键函数
markFunction('fetchImage', {
  category: 'network',
  description: '获取图片数据',
  color: '#ff6b6b',
});

markFunction('decodeImage', {
  category: 'compute',
  description: '解码图片数据',
  color: '#ffe66d',
});

markFunction('processImage', {
  category: 'compute',
  description: '处理图片数据',
  color: '#4ecdc4',
});

// 监听主线程消息
self.addEventListener('message', async (event) => {
  const { type, imageUrl, workerId } = event.data;

  // 初始化 Worker Profiler（接收 workerId）
  if (type === 'INIT_WORKER') {
    const profiler = initWorkerProfiler(workerId, true); // 启用 IndexedDB
    setWorkerProfiler(profiler); // 设置给装饰器使用
    console.log(`[Worker] 已初始化，workerId: ${profiler.getWorkerId()}`);
    return;
  }

  // 获取性能数据（主线程请求）
  if (type === 'GET_PERF_DATA') {
    try {
      const allData = await workerProfiler.getAllPerformanceData();
      self.postMessage({
        type: 'PERF_DATA_RESPONSE',
        workerId: workerProfiler.getWorkerId(),
        perfData: allData,
      });
    } catch (error) {
      console.error('[Worker] 获取性能数据失败:', error);
      self.postMessage({
        type: 'PERF_DATA_ERROR',
        workerId: workerProfiler.getWorkerId(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    return;
  }

  if (type === 'LOAD_IMAGE') {
    try {
      // 不再需要传入 workerId 参数
      const endFetch = workerProfiler.startFunction('fetchImage');
      
      // 下载图片
      const response = await fetch(imageUrl);
      if (!response.ok) {
        const errorText = response.statusText || `HTTP ${response.status}`;
        throw new Error(`Failed to fetch image: ${errorText} (${response.status})`);
      }

      const blob = await response.blob();
      
      // 检查 blob 是否有效
      if (!blob || blob.size === 0) {
        throw new Error('Received empty image blob');
      }
      endFetch();

      const endDecode = workerProfiler.startFunction('decodeImage');
      
      // 解码图片
      const imageBitmap = await createImageBitmap(blob);
      endDecode();

      const endProcess = workerProfiler.startFunction('processImage');
      
      // 将图片绘制到 Canvas 并转换为 ImageData
      const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Failed to get 2d context');
      }

      ctx.drawImage(imageBitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      endProcess();

      // 发送处理结果
      self.postMessage({
        type: 'IMAGE_LOADED',
        workerId: workerProfiler.getWorkerId(),
        imageUrl,
        imageData: {
          data: Array.from(imageData.data),
          width: imageData.width,
          height: imageData.height,
        },
        loadTime: performance.now(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error 
        ? `${error.message} (URL: ${imageUrl})` 
        : `Unknown error (URL: ${imageUrl})`;
      
      const currentWorkerId = workerProfiler?.getWorkerId() || workerId || 'unknown';
      console.error(`[Worker ${currentWorkerId}] Image load error:`, errorMessage, error);
      
      self.postMessage({
        type: 'IMAGE_ERROR',
        workerId: currentWorkerId,
        error: errorMessage,
        imageUrl, // 包含 URL 以便调试
      });
    }
  }
});
