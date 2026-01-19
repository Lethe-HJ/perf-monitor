# 技术方案文档

## 需求概述

实现一个性能监控示例：
1. 点击按钮触发 9 个 Worker 线程（尽可能多的并发）
2. 每个 Worker 请求大图片（至少 20MB）并处理
3. 主线程将图片展示成九宫格布局，先下载完成的先渲染
4. 点击性能分析按钮，展示火焰图、函数调用、时间占用、内存分配、GC 行为、网络请求、GPU 渲染等信息
5. 支持在业务函数中标记特殊函数，在性能分析中高亮显示

## 架构设计

### 项目结构

性能监控核心库封装在主项目 `src/` 目录下，使用 **Lit** 作为 Web Components 库来组织 DOM 元素。
业务 Demo 实现放在 `demos/demo1/` 目录下。

```
perf-monitor/
├── src/                          # 主项目 - 性能监控核心库
│   ├── core/                     # 核心监控模块
│   │   ├── profiler.ts           # 主线程 Profiler（Self-Profiling API 封装）
│   │   ├── worker-profiler.ts    # Worker 线程性能监控（手动插桩）
│   │   ├── memory-monitor.ts     # 内存监控
│   │   ├── network-monitor.ts    # 网络请求监控
│   │   ├── gc-monitor.ts         # GC 监控
│   │   ├── gpu-monitor.ts        # GPU 渲染监控
│   │   ├── function-marker.ts    # 函数标记功能（标记特殊函数）
│   │   └── cpuprofile-generator.ts  # 生成 .cpuprofile 格式数据
│   ├── components/               # 使用 Lit 构建的 Web Components
│   │   ├── performance-viewer.ts # 性能可视化组件（集成 Speedscope）
│   │   └── function-markers.ts   # 函数标记管理组件
│   ├── types/                    # TypeScript 类型定义
│   │   └── index.ts
│   └── index.ts                  # 主入口文件，导出所有核心功能
├── demos/
│   └── demo1/                    # 业务 Demo
│       ├── src/
│       │   ├── workers/
│       │   │   └── image-worker.ts    # 图片处理 Worker
│       │   ├── components/
│       │   │   └── ImageGrid.vue      # 九宫格图片渲染组件
│       │   ├── App.vue                # 主应用组件
│       │   └── main.ts
│       ├── package.json
│       └── README.md
└── package.json                  # 主项目依赖（包含 lit）
```

## 技术选型

### 1. 性能数据采集

#### 主线程监控
- **JS Self-Profiling API**：函数调用栈采样
  - `new Profiler({ sampleInterval, maxBufferSize })`
  - 生成采样数据，包含时间戳和调用栈
- **Performance Observer**：
  - `longtask` 类型：监控长任务
  - `measure` 类型：监控自定义性能标记
  - `resource` 类型：监控网络请求
  - `navigation` 类型：监控导航时间
  - `paint` 类型：监控 Paint 事件
- **Performance Timeline API**：
  - `performance.mark()` / `performance.measure()` 手动打点
- **Memory API**：
  - `performance.memory`：定期采样 JS 堆内存
- **Frame Timing**：
  - `requestAnimationFrame` 回调时间差监控帧率

#### Worker 线程监控
- 手动插桩：在 Worker 内关键函数前后记录时间戳
- 通过 `postMessage` 将性能数据发送到主线程
- 记录函数调用栈（手动构建）
- 支持函数标记：在 Worker 函数中标记特殊函数，标记信息会传递到主线程

#### 网络请求监控
- `PerformanceObserver` 监听 `resource` 类型事件
- 收集 `fetch` / `XMLHttpRequest` 的时间线数据
- 记录请求 URL、方法、响应大小、耗时等

#### GC 监控
- 监控内存突然下降（推断 GC 发生）
- 使用 `PerformanceObserver` 监控长暂停（可能是 GC）
- 记录内存前后变化量

#### GPU 渲染监控
- 监控 `requestAnimationFrame` 执行时间
- 监控 Paint 事件（`performance.getEntriesByType('paint')`）
- 监控 Canvas/WebGL 操作耗时

### 2. 数据格式

生成标准的 **Chrome DevTools `.cpuprofile` 格式**：

```typescript
interface CPUProfile {
  nodes: ProfileNode[];  // 函数节点树
  samples: number[];     // 采样点索引
  timeDeltas: number[];  // 每个采样点的时间差（微秒）
  startTime: number;     // 开始时间戳（毫秒）
  endTime: number;       // 结束时间戳（毫秒）
}

interface ProfileNode {
  id: number;
  callFrame: {
    functionName: string;
    scriptId: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
  hitCount?: number;
  children?: number[];
  deoptReason?: string;
  positionTicks?: any[];
}
```

### 3. 可视化方案

- **Speedscope**：用于展示火焰图
  - 安装 `speedscope` npm 包（在主项目中）
  - 将 `.cpuprofile` 数据转换为 Speedscope 格式
  - 使用 Lit 组件封装 Speedscope 视图

### 4. 函数标记功能

- **标记特殊函数**：允许开发者在业务代码中标记重要的函数
- **标记 API**：
  ```typescript
  import { markFunction } from '@/src/core/function-marker';
  
  markFunction('loadImage', { 
    category: 'network', 
    description: '加载图片的核心函数' 
  });
  ```
- **性能分析高亮**：标记的函数在火焰图中会高亮显示，并显示额外信息
- **标记信息存储**：标记信息会添加到 `.cpuprofile` 的节点元数据中

## 实现步骤

### 阶段 1：核心监控模块
1. 实现主线程 Profiler 封装
2. 实现 Worker 性能监控
3. 实现内存监控（定期采样）
4. 实现网络请求监控
5. 实现 GC 监控
6. 实现 GPU 渲染监控

### 阶段 2：数据格式转换
1. 实现 .cpuprofile 格式生成器
2. 整合各类监控数据到统一格式

### 阶段 3：业务逻辑
1. 实现图片 Worker（9 个 Worker 并发请求至少 20MB 的大图片）
2. 实现九宫格布局组件（先下载完成的先渲染）
3. 实现触发按钮和性能分析按钮
4. 在业务函数中标记关键函数

### 阶段 4：可视化
1. 集成 Speedscope
2. 实现性能数据展示界面

## 依赖清单

### 主项目 (perf-monitor/package.json)
```json
{
  "dependencies": {
    "lit": "^3.1.0",              // Web Components 库
    "speedscope": "^1.10.0"       // 火焰图可视化
  },
  "devDependencies": {
    "typescript": "~5.9.3",
    "vite": "npm:rolldown-vite@7.2.5"
  }
}
```

### Demo 项目 (demos/demo1/package.json)
```json
{
  "dependencies": {
    "vue": "^3.5.24",
    "perf-monitor": "workspace:*"  // 引用主项目的性能监控库
  },
  "devDependencies": {
    "@types/node": "^24.10.1",
    "@vitejs/plugin-vue": "^6.0.1",
    "@vue/tsconfig": "^0.8.1",
    "typescript": "~5.9.3",
    "vite": "npm:rolldown-vite@7.2.5",
    "vue-tsc": "^3.1.4"
  }
}
```

## 关键技术点

### 1. Self-Profiling API 使用

```typescript
// 检查支持
if ('Profiler' in window) {
  const profiler = new Profiler({
    sampleInterval: 10,  // 10ms 采样间隔
    maxBufferSize: 18000 // 最大缓冲区大小
  });
  
  await profiler.start();
  // ... 执行代码 ...
  const trace = await profiler.stop();
  // trace 包含采样数据
}
```

### 2. Worker 性能数据收集

```typescript
// Worker 内
const perfData = {
  functionName: 'loadImage',
  startTime: performance.now(),
  // ... 执行操作 ...
  endTime: performance.now(),
  memoryBefore: performance.memory?.usedJSHeapSize,
  memoryAfter: performance.memory?.usedJSHeapSize
};

self.postMessage({ type: 'PERF_DATA', data: perfData });
```

### 3. 内存采样

```typescript
const memorySamples: Array<{ time: number; heapSize: number }> = [];

function sampleMemory() {
  if (performance.memory) {
    memorySamples.push({
      time: performance.now(),
      heapSize: performance.memory.usedJSHeapSize
    });
  }
}

// 每 100ms 采样一次
setInterval(sampleMemory, 100);
```

### 4. GC 检测

```typescript
let lastMemory = performance.memory?.usedJSHeapSize || 0;

function detectGC() {
  const currentMemory = performance.memory?.usedJSHeapSize || 0;
  // 内存突然下降超过阈值，可能是 GC
  if (lastMemory - currentMemory > 5 * 1024 * 1024) { // 5MB
    console.log('Possible GC detected', {
      before: lastMemory,
      after: currentMemory,
      freed: lastMemory - currentMemory
    });
  }
  lastMemory = currentMemory;
}
```

### 5. 网络请求监控

```typescript
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry instanceof PerformanceResourceTiming) {
      console.log('Resource loaded', {
        name: entry.name,
        duration: entry.duration,
        transferSize: entry.transferSize,
        // ... 其他时间点
      });
    }
  }
});

observer.observe({ entryTypes: ['resource'] });
```

### 6. GPU 渲染监控

```typescript
let frameCount = 0;
let lastFrameTime = performance.now();

function monitorFrame() {
  const currentTime = performance.now();
  const frameDuration = currentTime - lastFrameTime;
  
  frameCount++;
  if (frameDuration > 16.67) { // 超过一帧时间（60fps）
    console.warn('Frame dropped', frameDuration);
  }
  
  lastFrameTime = currentTime;
  requestAnimationFrame(monitorFrame);
}

requestAnimationFrame(monitorFrame);
```

### 7. 函数标记功能实现

#### 标记函数 API
```typescript
// src/core/function-marker.ts

interface FunctionMarker {
  functionName: string;
  category: 'network' | 'render' | 'compute' | 'custom';
  description?: string;
  color?: string;  // 高亮颜色
}

const markedFunctions = new Map<string, FunctionMarker>();

export function markFunction(name: string, options: Omit<FunctionMarker, 'functionName'>) {
  markedFunctions.set(name, { functionName: name, ...options });
}

export function getFunctionMarker(name: string): FunctionMarker | undefined {
  return markedFunctions.get(name);
}

// 在业务代码中使用
markFunction('loadImage', { 
  category: 'network', 
  description: '加载图片的核心函数',
  color: '#ff6b6b'
});
```

#### 在 Profiler 数据中标记
```typescript
// 生成 CPUProfile 时，检查函数是否被标记
function generateProfileNode(functionName: string): ProfileNode {
  const marker = getFunctionMarker(functionName);
  const node: ProfileNode = {
    id: nextId++,
    callFrame: { /* ... */ },
    // 如果有标记，添加特殊元数据
    ...(marker && {
      marker: {
        category: marker.category,
        description: marker.description,
        color: marker.color
      }
    })
  };
  return node;
}
```

### 8. 九宫格布局和先完成先渲染

```typescript
// 图片下载状态管理
interface ImageLoadState {
  id: number;
  url: string;
  imageData?: ImageData;
  loadTime: number;
  loaded: boolean;
}

// 使用 Map 记录加载顺序
const imageLoadOrder: Map<number, ImageLoadState> = new Map();
const renderOrder: number[] = [];  // 渲染顺序

// Worker 完成后立即渲染
worker.onmessage = (e) => {
  const { id, imageData, loadTime } = e.data;
  imageLoadOrder.set(id, { id, imageData, loadTime, loaded: true });
  renderOrder.push(id);
  
  // 立即渲染到九宫格对应位置
  renderImageToGrid(id, imageData);
};

// 九宫格渲染函数
function renderImageToGrid(position: number, imageData: ImageData) {
  const grid = document.querySelector('.image-grid');
  const cell = grid.children[position];  // position 0-8 对应九宫格位置
  
  const canvas = cell.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
}
```

### 9. 大图片资源选择

使用在线图片服务获取大图片（至少 20MB）：

**方案 A：使用 Picsum Photos + 参数控制大小**
```typescript
// 生成至少 20MB 的图片 URL
// Picsum 不直接控制文件大小，需要通过尺寸和格式估算
function generateLargeImageUrl(id: number): string {
  // 估算：PNG 格式，8000x6000 像素约 20-30MB
  return `https://picsum.photos/8000/6000?random=${id}`;
}
```

**方案 B：使用自定义图片服务或本地生成**
```typescript
// 使用 Canvas 生成大图片（测试用）
function generateTestImage(sizeMB: number = 20): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 8000;
  canvas.height = 6000;
  const ctx = canvas.getContext('2d');
  
  // 绘制复杂图案增加文件大小
  // ...
  
  return new Promise(resolve => {
    canvas.toBlob(resolve, 'image/png');
  });
}
```

**方案 C：使用实际的大图片文件（推荐用于生产）**
- 准备 9 个大图片文件（每个 20MB+）
- 放在 `public/images/` 目录
- 直接引用本地路径

## 实现细节补充

### Worker 并发控制
- 同时创建 9 个 Worker 实例
- 每个 Worker 独立下载图片，互不干扰
- 使用 Promise.all 或独立事件监听处理完成事件

### 图片加载性能标记
在关键函数处添加标记：
```typescript
// Worker 中
markFunction('fetchImage', { category: 'network', description: '获取图片数据' });
markFunction('decodeImage', { category: 'compute', description: '解码图片' });
markFunction('processImage', { category: 'compute', description: '处理图片数据' });

// 主线程中
markFunction('renderImage', { category: 'render', description: '渲染图片到 Canvas' });
markFunction('composeGrid', { category: 'render', description: '组合九宫格' });
```

### 性能数据收集时间窗口
- 从点击"开始"按钮时开始收集
- 所有 Worker 完成后继续监控一小段时间（如 1 秒）以捕获最后的渲染和 GC
- 点击"性能分析"按钮时停止收集并生成报告

## 注意事项

1. **Self-Profiling API 兼容性**：仅 Chrome/Edge 支持，需要检查 `'Profiler' in window`
2. **性能开销**：Profiling 本身有性能开销，需要权衡采样频率
3. **内存限制**：大量性能数据可能占用较多内存，9 个 20MB+ 图片需要足够内存
4. **Worker 通信**：Worker 性能数据需要通过 postMessage 传递，注意序列化开销
5. **Speedscope 集成**：需要将数据转换为 Speedscope 支持格式或直接使用其 API
6. **大图片加载**：确保网络连接稳定，或使用本地文件避免网络问题
7. **CORS 问题**：使用在线图片时注意跨域问题
8. **Lit 组件**：性能可视化组件使用 Lit 构建，需要确保正确注册和使用