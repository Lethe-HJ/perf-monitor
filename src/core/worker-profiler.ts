/**
 * Worker 线程性能监控
 * 插桩模式（Instrumentation Mode）收集 Worker 内的性能数据
 */

import type { WorkerPerformanceData } from '../types/index.js';
import { getFunctionMarker } from './function-marker.js';
import { WorkerProfilerStorage } from './worker-profiler-storage.js';

export class WorkerProfiler {
  private workerId: string;
  private performanceData: WorkerPerformanceData[] = [];
  private callStack: string[] = [];
  private storage: WorkerProfilerStorage | null = null;
  private useIndexedDB: boolean;

  /**
   * 构造函数
   * @param workerId - Worker ID，如果不提供则使用时间戳生成唯一 ID
   * @param useIndexedDB - 是否使用 IndexedDB 存储数据（默认 true）
   */
  constructor(workerId?: string, useIndexedDB: boolean = true) {
    // 如果没有传入 workerId，使用时间戳作为唯一标识
    this.workerId = workerId || `worker-${Date.now()}`;
    this.useIndexedDB = useIndexedDB;

    // 如果启用 IndexedDB，初始化存储
    if (this.useIndexedDB && typeof indexedDB !== 'undefined') {
      this.storage = new WorkerProfilerStorage(this.workerId);
      this.storage.init().catch((error) => {
        console.warn('[WorkerProfiler] IndexedDB 初始化失败，降级到内存存储:', error);
        this.useIndexedDB = false;
        this.storage = null;
      });
    }
  }

  /**
   * 获取 Worker ID
   */
  getWorkerId(): string {
    return this.workerId;
  }

  /**
   * 记录函数开始执行
   * @param functionName - 函数名
   * @returns 结束函数，调用后记录函数执行结束
   */
  startFunction(functionName: string): () => void {
    const startTime = performance.now();
    const marker = getFunctionMarker(functionName);

    // 推入调用栈
    this.callStack.push(functionName);

    // 记录内存（如果可用）
    const memoryBefore = (self as any).performance?.memory?.usedJSHeapSize;

    // 返回结束函数
    return () => {
      const endTime = performance.now();
      const memoryAfter = (self as any).performance?.memory?.usedJSHeapSize;

      // 弹出调用栈
      this.callStack.pop();

      // 创建性能数据
      const perfData: WorkerPerformanceData = {
        workerId: this.workerId,
        functionName,
        startTime,
        endTime,
        duration: endTime - startTime,
        memoryBefore,
        memoryAfter,
        callStack: [...this.callStack],
        marker,
      };

      // 保存到内存（备用）
      this.performanceData.push(perfData);

      // 保存到 IndexedDB（如果启用）
      if (this.storage) {
        this.storage.save(perfData).catch((error) => {
          console.warn('[WorkerProfiler] 保存到 IndexedDB 失败:', error);
        });
      }

      // ❌ 不再实时发送到主线程（改用 IndexedDB 缓存，结束时一次性获取）
      // if (typeof self !== 'undefined' && self.postMessage) {
      //   self.postMessage({
      //     type: 'PERF_DATA',
      //     data: perfData,
      //   });
      // }
    };
  }

  /**
   * 手动记录性能数据（用于异步操作）
   */
  record(
    functionName: string,
    startTime: number,
    endTime: number,
    additionalData?: Partial<WorkerPerformanceData>
  ): void {
    const marker = getFunctionMarker(functionName);
    const memoryBefore = (self as any).performance?.memory?.usedJSHeapSize;
    const memoryAfter = (self as any).performance?.memory?.usedJSHeapSize;

    const perfData: WorkerPerformanceData = {
      workerId: this.workerId,
      functionName,
      startTime,
      endTime,
      duration: endTime - startTime,
      memoryBefore,
      memoryAfter,
      callStack: [...this.callStack],
      marker,
      ...additionalData,
    };

    // 保存到内存（备用）
    this.performanceData.push(perfData);

    // 保存到 IndexedDB（如果启用）
    if (this.storage) {
      this.storage.save(perfData).catch((error) => {
        console.warn('[WorkerProfiler] 保存到 IndexedDB 失败:', error);
      });
    }

    // ❌ 不再实时发送到主线程
    // if (typeof self !== 'undefined' && self.postMessage) {
    //   self.postMessage({
    //     type: 'PERF_DATA',
    //     data: perfData,
    //   });
    // }
  }

  /**
   * 获取所有性能数据（从 IndexedDB 或内存）
   * @returns 性能数据数组
   */
  async getAllPerformanceData(): Promise<WorkerPerformanceData[]> {
    // 优先从 IndexedDB 获取
    if (this.storage) {
      try {
        const storedData = await this.storage.getAllData();
        if (storedData.length > 0) {
          return storedData;
        }
      } catch (error) {
        console.warn('[WorkerProfiler] 从 IndexedDB 获取数据失败，使用内存数据:', error);
      }
    }

    // 降级到内存数据
    return [...this.performanceData];
  }

  /**
   * 获取所有性能数据（同步版本，仅从内存获取）
   * @deprecated 使用 getAllPerformanceData() 替代
   */
  getPerformanceData(): WorkerPerformanceData[] {
    return [...this.performanceData];
  }

  /**
   * 清除所有数据（内存和 IndexedDB）
   */
  async clear(): Promise<void> {
    this.performanceData = [];
    this.callStack = [];
    
    if (this.storage) {
      try {
        await this.storage.clear();
      } catch (error) {
        console.warn('[WorkerProfiler] 清空 IndexedDB 数据失败:', error);
      }
    }
  }
}

// 创建全局实例（Worker 中使用，向后兼容）
// 注意：新代码应该在接收到 INIT_WORKER 消息后创建实例
export let workerProfiler: WorkerProfiler;

/**
 * 初始化全局 WorkerProfiler 实例
 * 应该在 Worker 接收到 INIT_WORKER 消息时调用
 */
export function initWorkerProfiler(workerId?: string, useIndexedDB: boolean = true): WorkerProfiler {
  workerProfiler = new WorkerProfiler(workerId, useIndexedDB);
  return workerProfiler;
}

// 默认初始化（向后兼容）
if (typeof self !== 'undefined') {
  workerProfiler = new WorkerProfiler(undefined, true);
}
