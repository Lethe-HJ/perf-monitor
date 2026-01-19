# 性能分析模式升级方案 - 插桩模式（Instrumentation Mode）

## 当前实现 vs 需求对比

### 1. 性能分析模式定义

**当前状态：**
- ❌ 打桩方式没有定义为一种明确的模式
- 仅在注释中说明是"手动插桩"

**需求：**
- ✅ 定义为一种性能分析模式，建议命名为：**`instrumentation` 模式（插桩模式）**

**修改方案：**
- 在 `PerformanceMonitorConfig` 中添加 `profilingMode?: 'sampling' | 'instrumentation' | 'hybrid'`
- `sampling`: 使用 JS Self-Profiling API（主线程）
- `instrumentation`: 手动插桩模式（Worker 线程，或主线程降级方案）
- `hybrid`: 混合模式（主线程采样 + Worker 插桩）

---

### 2. WorkerProfiler API 简化

**当前状态：**
```typescript
// ❌ 每次调用都需要传入 workerId
const endFetch = workerProfiler.startFunction('fetchImage', workerId);
```

**需求：**
```typescript
// ✅ workerId 在实例化时设置，后续调用无需传入
const endFetch = workerProfiler.startFunction('fetchImage');
```

**修改方案：**

1. **修改 `WorkerProfiler` 构造函数：**
```typescript
export class WorkerProfiler {
  private workerId: string;
  private performanceData: WorkerPerformanceData[] = [];
  private callStack: string[] = [];

  constructor(workerId?: string) {
    // 如果没有传入 workerId，使用时间戳作为唯一标识
    this.workerId = workerId || `worker-${Date.now()}`;
  }

  startFunction(functionName: string): () => void {
    // 不再需要 workerId 参数，使用 this.workerId
  }
}
```

2. **修改 Worker 初始化方式：**
```typescript
// 在 Worker 中，从消息中获取 workerId 并初始化
let workerProfiler: WorkerProfiler;

self.addEventListener('message', (event) => {
  const { type, workerId } = event.data;
  
  if (type === 'INIT_WORKER') {
    // 初始化时传入 workerId
    workerProfiler = new WorkerProfiler(workerId);
  }
});
```

3. **主线程创建 Worker 时发送初始化消息：**
```typescript
const worker = new Worker(url);
worker.postMessage({ 
  type: 'INIT_WORKER', 
  workerId: `worker-${image.id}` // 或使用 Date.now() 如果没有序号
});
```

---

### 3. 装饰器支持

**当前状态：**
- ❌ 没有装饰器支持，需要手动调用 `startFunction` 和 `end()`

**需求：**
- ✅ 提供 `@instrument` 装饰器简化函数打桩

**修改方案：**

创建 `src/core/instrument-decorator.ts`:

```typescript
/**
 * 函数插桩装饰器
 * 自动记录函数执行时间
 */

let workerProfilerInstance: WorkerProfiler | null = null;

/**
 * 设置 WorkerProfiler 实例（在 Worker 初始化时调用）
 */
export function setWorkerProfiler(profiler: WorkerProfiler): void {
  workerProfilerInstance = profiler;
}

/**
 * 获取 WorkerProfiler 实例
 */
function getWorkerProfiler(): WorkerProfiler {
  if (!workerProfilerInstance) {
    throw new Error('WorkerProfiler not initialized. Call setWorkerProfiler() first.');
  }
  return workerProfilerInstance;
}

/**
 * @instrument 装饰器
 * 自动记录被装饰函数的执行时间
 * 
 * @example
 * ```typescript
 * import { instrument } from '@src/core/instrument-decorator';
 * 
 * class ImageProcessor {
 *   @instrument
 *   async fetchImage(url: string) {
 *     // 函数实现
 *   }
 * }
 * ```
 */
export function instrument(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;

  descriptor.value = function (...args: any[]) {
    const profiler = getWorkerProfiler();
    const functionName = `${target.constructor?.name || 'Anonymous'}.${propertyKey}`;
    const endFunction = profiler.startFunction(functionName);
    
    try {
      const result = originalMethod.apply(this, args);
      
      // 处理 Promise
      if (result instanceof Promise) {
        return result.finally(() => endFunction());
      }
      
      endFunction();
      return result;
    } catch (error) {
      endFunction();
      throw error;
    }
  };

  return descriptor;
}
```

**使用示例：**
```typescript
// 在 image-worker.ts 中
import { instrument, setWorkerProfiler } from '../../../../src/core/instrument-decorator.js';
import { WorkerProfiler } from '../../../../src/core/worker-profiler.js';

let workerProfiler: WorkerProfiler;

self.addEventListener('message', (event) => {
  const { type, workerId } = event.data;
  
  if (type === 'INIT_WORKER') {
    workerProfiler = new WorkerProfiler(workerId);
    setWorkerProfiler(workerProfiler);
  }
});

class ImageLoader {
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

---

### 4. IndexedDB 存储方案

**当前状态：**
- ❌ 数据通过 `postMessage` 实时发送到主线程
- 主线程通过 `addWorkerPerformanceData` 收集数据

**需求：**
- ✅ Worker 线程将数据缓存到 IndexedDB
- ✅ 主线程结束时，通过消息获取完整数据
- ✅ 主线程获取后传递给 Vite 插件接口

**修改方案：**

1. **创建 IndexedDB 工具类：**

创建 `src/core/worker-profiler-storage.ts`:

```typescript
/**
 * Worker 性能数据 IndexedDB 存储
 */

const DB_NAME = 'perf-monitor-worker-data';
const STORE_NAME = 'performance-data';
const VERSION = 1;

export class WorkerProfilerStorage {
  private db: IDBDatabase | null = null;
  private workerId: string;

  constructor(workerId: string) {
    this.workerId = workerId;
  }

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('workerId', 'workerId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  /**
   * 保存性能数据
   */
  async save(data: any): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const record = {
        workerId: this.workerId,
        data,
        timestamp: Date.now(),
      };

      const request = store.add(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 获取该 Worker 的所有性能数据
   */
  async getAllData(): Promise<any[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('workerId');
      
      const request = index.getAll(this.workerId);
      request.onsuccess = () => {
        const records = request.result;
        const data = records.map(r => r.data);
        resolve(data);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 清空该 Worker 的数据
   */
  async clear(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('workerId');
      
      const request = index.getAllKeys(this.workerId);
      request.onsuccess = () => {
        const keys = request.result;
        const deletePromises = keys.map(key => {
          return new Promise<void>((resolve, reject) => {
            const deleteRequest = store.delete(key);
            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => reject(deleteRequest.error);
          });
        });
        Promise.all(deletePromises).then(() => resolve()).catch(reject);
      };
      request.onerror = () => reject(request.error);
    });
  }
}
```

2. **修改 WorkerProfiler 使用 IndexedDB：**

```typescript
export class WorkerProfiler {
  private workerId: string;
  private storage: WorkerProfilerStorage | null = null;
  private performanceData: WorkerPerformanceData[] = [];

  constructor(workerId?: string, useIndexedDB: boolean = true) {
    this.workerId = workerId || `worker-${Date.now()}`;
    
    if (useIndexedDB) {
      this.storage = new WorkerProfilerStorage(this.workerId);
      this.storage.init().catch(console.error);
    }
  }

  startFunction(functionName: string): () => void {
    // ... 原有逻辑 ...
    
    return () => {
      // ... 创建 perfData ...
      
      // 保存到 IndexedDB（如果启用）
      if (this.storage) {
        this.storage.save(perfData).catch(console.error);
      }
      
      // 同时保存到内存（备用）
      this.performanceData.push(perfData);
      
      // ❌ 不再实时发送到主线程
      // if (typeof self !== 'undefined' && self.postMessage) {
      //   self.postMessage({ type: 'PERF_DATA', data: perfData });
      // }
    };
  }

  /**
   * 获取所有性能数据（从 IndexedDB 读取）
   */
  async getAllPerformanceData(): Promise<WorkerPerformanceData[]> {
    if (this.storage) {
      return await this.storage.getAllData();
    }
    return [...this.performanceData];
  }
}
```

3. **主线程请求 Worker 数据：**

```typescript
// 在 App.vue 中，停止记录时
worker.postMessage({ type: 'GET_PERF_DATA' });

worker.onmessage = async (event) => {
  const { type, workerId, perfData } = event.data;
  
  if (type === 'PERF_DATA_RESPONSE') {
    // 获取完整的 Worker 性能数据
    const allData = perfData;
    // 传递给 Vite 插件接口
    await sendToVitePlugin(workerId, allData);
  }
};
```

4. **Worker 响应数据请求：**

```typescript
// 在 image-worker.ts 中
self.addEventListener('message', async (event) => {
  const { type } = event.data;
  
  if (type === 'GET_PERF_DATA') {
    const allData = await workerProfiler.getAllPerformanceData();
    self.postMessage({
      type: 'PERF_DATA_RESPONSE',
      workerId: workerProfiler.getWorkerId(),
      perfData: allData,
    });
  }
});
```

---

### 5. 集成页面动态线程数

**当前状态：**
```typescript
// ❌ 硬编码的线程 ID 列表
const commonThreadIds = ['web-main', 'web-worker-0', 'web-worker-1', ...];
```

**需求：**
- ✅ 从服务器目录动态读取 profile 文件列表
- ✅ 根据实际存在的文件生成线程列表

**修改方案：**

修改 `demos/demo1/profile-viewer.html`:

```typescript
// 方案 1: 从 Vite 插件提供的接口获取文件列表
async function loadAvailableProfiles(sessionId: string) {
  try {
    // 调用 Vite 插件的新接口，返回该 session 的所有 profile 文件
    const response = await fetch(`/__perf_monitor__/list-profiles?sessionId=${sessionId}`);
    if (response.ok) {
      const { profiles } = await response.json();
      return profiles; // [{ threadId: 'web-main', url: '...' }, ...]
    }
  } catch (e) {
    console.warn('无法获取 profile 列表:', e);
  }
  
  // 降级方案：尝试常见的线程 ID
  const fallbackThreadIds = ['web-main'];
  for (let i = 0; i < 20; i++) { // 最多尝试 20 个 worker
    fallbackThreadIds.push(`web-worker-${i}`);
  }
  
  // 并行检查哪些文件存在
  const checks = fallbackThreadIds.map(async (threadId) => {
    const url = `/__perf_monitor__/profiles/${sessionId}-${threadId}.speedscope.json`;
    const response = await fetch(url, { method: 'HEAD' });
    if (response.ok) {
      return { threadId, url };
    }
    return null;
  });
  
  const results = await Promise.all(checks);
  return results.filter(Boolean);
}
```

在 Vite 插件中添加 `/__perf_monitor__/list-profiles` 接口：

```typescript
// 在 auto-open-profile-plugin.ts 中
server.middlewares.use('/__perf_monitor__/list-profiles', async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'sessionId required' }));
    return;
  }
  
  const files = await fs.readdir(tempDir);
  const profiles = files
    .filter(f => f.startsWith(`${sessionId}-`) && f.endsWith('.speedscope.json'))
    .map(f => {
      const threadId = f.replace(`${sessionId}-`, '').replace('.speedscope.json', '');
      return {
        threadId,
        url: `/__perf_monitor__/profiles/${f}`,
      };
    });
  
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ profiles }));
});
```

---

## 实施顺序建议

1. **第一步：简化 WorkerProfiler API（第 2 项）**
   - 影响范围小，向后兼容性好
   - 可以保留 `workerId` 参数作为可选参数，逐步迁移

2. **第二步：IndexedDB 存储（第 4 项）**
   - 核心数据流改进
   - 可以同时保留旧的实时发送方式，逐步切换

3. **第三步：装饰器支持（第 3 项）**
   - 可选功能，不影响现有代码
   - 需要 TypeScript 装饰器配置

4. **第四步：模式定义和集成页面优化（第 1、5 项）**
   - 架构层面改进
   - 最后实施，确保其他部分稳定
