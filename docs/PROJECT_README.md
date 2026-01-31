# Perf-Monitor 项目阅读文档

## 📋 项目概述

**perf-monitor** 是一个高性能的 JavaScript 性能监控库，专门用于监控和分析 Web 应用（包括主线程和 Web Worker）的性能表现。该项目提供了完整的性能数据采集、分析和可视化解决方案。

### 核心特性

- ✅ **主线程性能监控**：使用 JS Self-Profiling API 进行采样分析
- ✅ **Worker 线程监控**：手动插桩模式收集 Worker 性能数据
- ✅ **多维度监控**：内存、网络、GC、GPU 全方位监控
- ✅ **标准格式输出**：生成 Chrome DevTools `.cpuprofile` 格式和 Speedscope 格式
- ✅ **可视化组件**：基于 Lit 的 UI 组件，集成 Speedscope 可视化
- ✅ **灵活配置**：支持采样模式、插桩模式和混合模式

---

## 📁 项目结构

```
perf-monitor/
├── src/                          # 核心源代码
│   ├── core/                     # 核心监控模块
│   │   ├── profiler.ts          # 主线程 Profiler（JS Self-Profiling API）
│   │   ├── worker-profiler.ts   # Worker 线程性能监控
│   │   ├── performance-monitor.ts # 统一性能监控管理器
│   │   ├── cpuprofile-generator.ts # CPUProfile 格式生成器
│   │   ├── memory-monitor.ts    # 内存监控
│   │   ├── network-monitor.ts   # 网络监控
│   │   ├── gc-monitor.ts        # GC 监控
│   │   ├── gpu-monitor.ts       # GPU 监控
│   │   ├── function-marker.ts   # 函数标记功能
│   │   ├── main-thread-instrumentation.ts # 主线程插桩
│   │   ├── instrument-decorator.ts # 装饰器支持
│   │   └── worker-profiler-storage.ts # IndexedDB 存储
│   ├── components/              # Lit Web Components
│   │   ├── performance-viewer.ts # 性能可视化组件
│   │   ├── performance-dialog.ts # 性能对话框组件
│   │   ├── performance-controls.ts # 性能控制组件
│   │   └── performance-analyzer-button.ts # 分析按钮组件
│   ├── utils/                   # 工具函数
│   │   ├── performance-helpers.ts # 性能监控辅助函数
│   │   ├── inject-analyzer.ts   # 注入分析器（旧版）
│   │   ├── inject-controls.ts   # 注入控制组件（新版）
│   │   └── auto-open-profile.ts  # 自动打开 Profile
│   ├── types/                   # TypeScript 类型定义
│   │   └── index.ts
│   ├── index.ts                 # 主入口文件（导出所有 API）
│   └── main.ts                  # 示例入口（Vite 项目）
├── demos/                       # 示例项目
│   └── demo1/                   # Demo 1：多 Worker 图片加载示例
│       ├── src/
│       │   ├── App.vue          # Vue 应用主组件
│       │   └── workers/
│       │       └── image-worker.ts # Worker 示例
│       ├── plugins/
│       │   └── auto-open-profile-plugin.ts # Vite 插件
│       └── profile-viewer.html  # Profile 查看器页面
├── docs/                        # 文档目录
│   ├── USAGE_SCENARIOS.md       # 使用场景说明
│   └── INSTRUMENTATION_MODE_UPGRADE.md # 插桩模式升级方案
└── package.json                 # 项目配置
```

---

## 🏗️ 核心架构

### 1. 性能监控模式

项目支持三种性能分析模式：

#### 采样模式（Sampling Mode）
- **适用场景**：主线程性能分析
- **技术实现**：JS Self-Profiling API
- **特点**：自动采样函数调用栈，无需手动插桩
- **限制**：需要 Document Policy 支持，仅 Chrome/Edge/Electron

#### 插桩模式（Instrumentation Mode）
- **适用场景**：Worker 线程、主线程降级方案
- **技术实现**：手动插桩记录函数执行时间
- **特点**：精确控制，不依赖浏览器 API
- **优势**：始终可用，跨浏览器兼容

#### 混合模式（Hybrid Mode）
- **适用场景**：主线程采样 + Worker 插桩
- **技术实现**：同时使用采样和插桩
- **特点**：最全面的性能数据

### 2. 核心模块说明

#### 2.1 MainThreadProfiler (`src/core/profiler.ts`)

封装 JS Self-Profiling API，用于主线程性能采样。

**主要方法：**
- `isSupported()`: 检查浏览器是否支持 Self-Profiling API
- `isAllowed()`: 检查 Document Policy 是否允许使用
- `start()`: 开始性能采样
- `stop()`: 停止采样并获取 trace 数据

**使用示例：**
```typescript
const profiler = new MainThreadProfiler(10, 18000);
if (await profiler.start()) {
  // 执行需要监控的代码
  const trace = await profiler.stop();
}
```

#### 2.2 WorkerProfiler (`src/core/worker-profiler.ts`)

Worker 线程性能监控，使用手动插桩方式。

**主要特性：**
- 支持 IndexedDB 存储（避免频繁 postMessage）
- 自动维护调用栈
- 记录内存变化
- 支持函数标记

**使用示例：**
```typescript
// 在 Worker 中
const workerProfiler = new WorkerProfiler('worker-0', true);

// 记录函数执行
const endFunction = workerProfiler.startFunction('fetchImage');
try {
  // 执行函数逻辑
  await fetchImage();
} finally {
  endFunction(); // 记录结束
}

// 获取所有性能数据
const data = await workerProfiler.getAllPerformanceData();
```

#### 2.3 PerformanceMonitor (`src/core/performance-monitor.ts`)

统一性能监控管理器，整合所有监控模块。

**主要功能：**
- 统一启动/停止所有监控
- 收集主线程和 Worker 数据
- 生成 CPUProfile 和 Speedscope 格式
- 支持多线程并行显示

**使用示例：**
```typescript
const monitor = new PerformanceMonitor({
  sampleInterval: 10,
  enableGC: true,
  enableNetwork: true,
  enableGPU: true,
});

// 开始监控
await monitor.start();

// 添加 Worker 数据
monitor.addWorkerPerformanceData(workerData);

// 停止并生成报告
await monitor.stop();
const profile = await monitor.generateSpeedscopeProfile();
```

#### 2.4 CPUProfileGenerator (`src/core/cpuprofile-generator.ts`)

将各种监控数据转换为标准的 CPUProfile 格式。

**主要方法：**
- `generateFromTrace()`: 从 Self-Profiling trace 生成
- `generateFromWorkerData()`: 从 Worker 数据生成
- `generateSpeedscopeFormat()`: 生成 Speedscope 格式（支持多线程）
- `mergeProfiles()`: 合并多个 profile

#### 2.5 其他监控模块

- **MemoryMonitor**: 定期采样 `performance.memory`
- **NetworkMonitor**: 使用 `PerformanceObserver` 监听资源加载
- **GCMonitor**: 通过内存突然下降推断 GC 事件
- **GPUMonitor**: 监控 `requestAnimationFrame` 和 Paint 事件

---

## 🔧 核心功能详解

### 1. 函数标记系统 (`src/core/function-marker.ts`)

允许开发者标记特殊函数，在性能分析中高亮显示。

**使用示例：**
```typescript
import { markFunction } from 'perf-monitor';

// 标记网络相关函数
markFunction('fetchImage', {
  category: 'network',
  description: '图片下载',
  color: '#ff6b6b',
});

// 标记渲染相关函数
markFunction('renderImage', {
  category: 'render',
  description: '图片渲染',
  color: '#4ecdc4',
});
```

**分类类型：**
- `network`: 网络操作（红色）
- `render`: 渲染操作（青色）
- `compute`: 计算操作（黄色）
- `custom`: 自定义（浅绿色）

### 2. 装饰器支持 (`src/core/instrument-decorator.ts`)

提供 `@instrument` 装饰器简化函数插桩。

**使用示例：**
```typescript
import { instrument } from 'perf-monitor';
import { setWorkerProfiler } from 'perf-monitor';

// 在 Worker 中初始化
const workerProfiler = new WorkerProfiler('worker-0');
setWorkerProfiler(workerProfiler);

// 使用装饰器
class ImageProcessor {
  @instrument
  async fetchImage(url: string) {
    const response = await fetch(url);
    return response.blob();
  }
  
  @instrument
  async decodeImage(blob: Blob) {
    return createImageBitmap(blob);
  }
}
```

### 3. IndexedDB 存储 (`src/core/worker-profiler-storage.ts`)

Worker 性能数据使用 IndexedDB 缓存，避免频繁 postMessage 影响性能。

**工作流程：**
1. Worker 执行时，性能数据保存到 IndexedDB
2. 监控结束时，主线程通过消息请求完整数据
3. Worker 从 IndexedDB 读取并发送给主线程

**优势：**
- 减少主线程和 Worker 之间的通信开销
- 支持大量性能数据存储
- 自动降级到内存存储（如果 IndexedDB 不可用）

### 4. 主线程插桩 (`src/core/main-thread-instrumentation.ts`)

当 JS Self-Profiling API 不可用时，可以使用手动插桩作为降级方案。

**使用示例：**
```typescript
import { getMainThreadInstrumentation } from 'perf-monitor';

const instrumentation = getMainThreadInstrumentation();

// 记录函数执行
const endFunction = instrumentation.startFunction('myFunction');
try {
  // 执行代码
} finally {
  endFunction();
}

// 获取数据并添加到 PerformanceMonitor
const data = instrumentation.getAllPerformanceData();
monitor.addMainThreadInstrumentationDataBatch(data);
```

---

## 📦 API 导出

### 核心监控模块

```typescript
// 主线程 Profiler
export { MainThreadProfiler } from './core/profiler.js';

// Worker Profiler
export { WorkerProfiler, workerProfiler } from './core/worker-profiler.js';

// 统一管理器
export { PerformanceMonitor } from './core/performance-monitor.js';

// 各种监控器
export { MemoryMonitor } from './core/memory-monitor.js';
export { NetworkMonitor } from './core/network-monitor.js';
export { GCMonitor } from './core/gc-monitor.js';
export { GPUMonitor } from './core/gpu-monitor.js';

// CPUProfile 生成器
export { CPUProfileGenerator } from './core/cpuprofile-generator.js';

// 主线程插桩
export {
  MainThreadInstrumentation,
  getMainThreadInstrumentation,
  resetMainThreadInstrumentation,
} from './core/main-thread-instrumentation.js';
```

### 函数标记

```typescript
export {
  markFunction,
  getFunctionMarker,
  isFunctionMarked,
  getAllMarkedFunctions,
  clearAllMarkers,
} from './core/function-marker.js';
```

### UI 组件（Lit）

```typescript
export { PerformanceAnalyzerButton } from './components/performance-analyzer-button.js';
export { PerformanceDialog } from './components/performance-dialog.js';
export { PerformanceViewer } from './components/performance-viewer.js';
```

### 工具函数

```typescript
// 性能监控辅助函数（推荐）
export {
  startPerformanceRecording,
  stopPerformanceRecording,
  resetPerformanceMonitor,
  createPerformanceCallbacks,
} from './utils/performance-helpers.js';

// 注入控制组件（新版）
export {
  injectPerformanceControls,
  removePerformanceControls,
  updateRecordingState,
} from './utils/inject-controls.js';

// 自动打开 Profile（开发环境）
export {
  autoOpenProfile,
  downloadProfile,
} from './utils/auto-open-profile.js';
```

### 类型定义

```typescript
export type {
  CPUProfile,
  ProfileNode,
  FunctionMarker,
  MemorySample,
  NetworkRequest,
  GCEvent,
  FrameData,
  WorkerPerformanceData,
  PerformanceMonitorConfig,
  ProfilingMode,
} from './types/index.js';
```

---

## 🚀 使用指南

### 基础使用

#### 1. 安装依赖

```bash
yarn install
```

#### 2. 基础监控

```typescript
import { PerformanceMonitor, createPerformanceCallbacks } from 'perf-monitor';

// 创建监控实例
const monitor = new PerformanceMonitor({
  sampleInterval: 10,
  enableGC: true,
  enableNetwork: true,
  enableGPU: true,
});

// 开始监控
await monitor.start();

// 执行需要监控的代码
// ...

// 停止监控并生成报告
await monitor.stop();
const profile = await monitor.generateSpeedscopeProfile();

// 下载 Profile 文件
const blob = new Blob([JSON.stringify(profile)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'profile.speedscope.json';
a.click();
```

#### 3. Worker 监控

```typescript
// 主线程
import { PerformanceMonitor, WorkerProfiler } from 'perf-monitor';

const monitor = new PerformanceMonitor();
await monitor.start();

// 创建 Worker
const worker = new Worker('./worker.js', { type: 'module' });

// 初始化 Worker Profiler
worker.postMessage({
  type: 'INIT_WORKER',
  workerId: 'worker-0',
});

// Worker 执行完成后获取数据
worker.postMessage({ type: 'GET_PERF_DATA' });
worker.onmessage = async (event) => {
  const { type, workerId, perfData } = event.data;
  if (type === 'PERF_DATA_RESPONSE') {
    // 添加到监控器
    perfData.forEach(data => monitor.addWorkerPerformanceData(data));
    
    // 生成报告
    const profile = await monitor.generateSpeedscopeProfile();
  }
};
```

```typescript
// Worker 线程 (worker.js)
import { WorkerProfiler, initWorkerProfiler } from 'perf-monitor';

let workerProfiler: WorkerProfiler;

self.addEventListener('message', async (event) => {
  const { type, workerId } = event.data;
  
  if (type === 'INIT_WORKER') {
    workerProfiler = initWorkerProfiler(workerId, true);
  }
  
  if (type === 'GET_PERF_DATA') {
    const allData = await workerProfiler.getAllPerformanceData();
    self.postMessage({
      type: 'PERF_DATA_RESPONSE',
      workerId: workerProfiler.getWorkerId(),
      perfData: allData,
    });
  }
});

// 使用插桩记录函数
const endFunction = workerProfiler.startFunction('processData');
try {
  // 执行逻辑
} finally {
  endFunction();
}
```

#### 4. 使用 UI 组件

```typescript
import { injectPerformanceControls, createPerformanceCallbacks } from 'perf-monitor';

const monitor = new PerformanceMonitor();
const callbacks = createPerformanceCallbacks(monitor);

// 注入控制组件（浮动按钮）
injectPerformanceControls(callbacks);
```

---

## 📊 数据格式

### CPUProfile 格式

标准的 Chrome DevTools `.cpuprofile` 格式：

```typescript
interface CPUProfile {
  nodes: ProfileNode[];      // 函数节点树
  samples: number[];         // 采样点（节点 ID）
  timeDeltas: number[];      // 时间差（毫秒）
  startTime: number;         // 开始时间
  endTime: number;           // 结束时间
}
```

### Speedscope 格式

支持多线程并行显示的 Speedscope 格式：

```json
{
  "$schema": "https://www.speedscope.app/file-format-schema.json",
  "shared": {
    "frames": [...]
  },
  "profiles": [
    {
      "type": "evented",
      "name": "web-main",
      "unit": "milliseconds",
      "startValue": 0,
      "endValue": 1000,
      "events": [...]
    }
  ]
}
```

---

## 🔍 使用场景和限制

### JS Self-Profiling API 可用性

#### ✅ 可以使用的情况

1. **Electron 应用**（推荐）
   - 完全控制渲染进程环境
   - 可以设置 Document Policy
   - 不受浏览器安全策略限制

2. **本地开发服务器**
   - 通过 `localhost` 访问
   - 在 HTML 中添加 Document Policy meta 标签

3. **Chrome 扩展**
   - 在扩展环境中可以使用
   - 需要声明权限

#### ❌ 无法使用的情况

1. **普通生产环境网页**
   - 大多数网站由于安全策略无法使用
   - 除非服务器明确设置 Document Policy 头部

2. **file:// 协议**
   - 本地文件直接打开时无法设置 Document Policy

3. **其他浏览器**
   - Firefox：不支持
   - Safari：不支持
   - 仅支持 Chrome/Edge 和基于 Chromium 的应用

### 降级方案

即使 JS Self-Profiling API 不可用，本监控库仍然可以工作：

- ✅ **Worker 性能监控**：始终可用，手动插桩收集数据
- ✅ **内存监控**：`performance.memory`（Chrome）
- ✅ **网络监控**：`PerformanceObserver`
- ✅ **GC 监控**：通过内存变化推断
- ✅ **GPU 监控**：`requestAnimationFrame` 和 Paint 事件

代码会自动检测并降级，不会中断执行。

### 启用 Document Policy

#### 方式 A：HTML meta 标签

```html
<meta http-equiv="Document-Policy" content="js-profiling=*" />
```

#### 方式 B：HTTP 响应头

```javascript
// Node.js Express
app.use((req, res, next) => {
  res.setHeader('Document-Policy', 'js-profiling');
  next();
});
```

#### 方式 C：Electron 主进程

```javascript
const { session } = require('electron');

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Document-Policy': ['js-profiling']
      }
    });
  });
});
```

---

## 📝 Demo 项目

### Demo 1: 多 Worker 图片加载

**位置**：`demos/demo1/`

**功能**：
- 9 个 Worker 并发加载大图片
- 先完成先渲染（九宫格布局）
- 性能监控和分析
- 自动打开 Speedscope 查看器

**运行方式：**

```bash
cd demos/demo1
yarn install
yarn dev
```

**特性**：
- 使用 Vite 插件自动打开 Profile
- 支持动态线程数
- 集成 Speedscope 可视化

---

## 🛠️ 技术栈

- **语言**：TypeScript
- **构建工具**：Vite (rolldown-vite)
- **UI 框架**：Lit (Web Components)
- **可视化**：Speedscope
- **存储**：IndexedDB（Worker 数据）

---

## 📚 相关文档

- [使用场景说明](./docs/USAGE_SCENARIOS.md)
- [插桩模式升级方案](./docs/INSTRUMENTATION_MODE_UPGRADE.md)
- [Demo 使用说明](./demos/demo1/README.md)

---

## 🎯 最佳实践

### 1. 性能监控时机

- ✅ 开发环境：始终启用
- ✅ 测试环境：关键流程启用
- ❌ 生产环境：谨慎使用（有性能开销）

### 2. Worker 监控

- 使用 `@instrument` 装饰器简化插桩
- 启用 IndexedDB 存储（减少通信开销）
- 在 Worker 初始化时设置 workerId

### 3. 函数标记

- 标记关键函数（网络、渲染、计算）
- 使用合适的分类和颜色
- 添加描述信息便于分析

### 4. Profile 分析

- 使用 Speedscope 查看多线程并行执行
- 关注函数标记的高亮区域
- 结合内存、网络数据综合分析

---

## 🔄 数据流

### 主线程监控流程

```
开始监控 → MainThreadProfiler.start()
    ↓
执行代码（自动采样）
    ↓
停止监控 → MainThreadProfiler.stop() → 获取 trace
    ↓
CPUProfileGenerator.generateFromTrace()
    ↓
生成 CPUProfile / Speedscope 格式
```

### Worker 监控流程

```
Worker 初始化 → WorkerProfiler(workerId)
    ↓
函数执行 → startFunction() → 记录开始时间
    ↓
执行逻辑
    ↓
endFunction() → 记录结束时间 → 保存到 IndexedDB
    ↓
监控结束 → getAllPerformanceData() → 从 IndexedDB 读取
    ↓
postMessage 发送到主线程
    ↓
PerformanceMonitor.addWorkerPerformanceData()
    ↓
生成 CPUProfile / Speedscope 格式
```

---

## ⚠️ 注意事项

1. **浏览器兼容性**
   - JS Self-Profiling API 仅 Chrome/Edge/Electron 支持
   - Worker 监控跨浏览器兼容

2. **性能开销**
   - Profiling 本身有性能开销
   - 建议仅在开发和测试时使用
   - 生产环境谨慎启用

3. **内存要求**
   - 大量性能数据会占用内存
   - IndexedDB 可以缓解内存压力

4. **Document Policy**
   - 使用 Profiler 需要设置 Document Policy
   - 详见使用场景文档

---

## 🚧 未来计划

根据 `docs/INSTRUMENTATION_MODE_UPGRADE.md`，项目计划：

1. ✅ 简化 WorkerProfiler API（已完成）
2. ✅ IndexedDB 存储方案（已完成）
3. ✅ 装饰器支持（已完成）
4. ✅ 主线程插桩模式（已完成）
5. 🔄 集成页面动态线程数（进行中）

---

## 📄 许可证

本项目为私有项目。

---

## 👥 贡献

欢迎提交 Issue 和 Pull Request。

---

**最后更新**：2024年
