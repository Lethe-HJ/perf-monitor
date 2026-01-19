/**
 * 主线程插桩性能监控
 * 用于主线程的手动插桩，补充采样模式可能不可用的情况
 * 或者与采样模式结合使用（混合模式）
 */

import type { WorkerPerformanceData } from '../types/index.js';
import { getFunctionMarker } from './function-marker.js';

/**
 * 主线程插桩 Profiler
 * 用于主线程的手动插桩，类似 WorkerProfiler 但不需要 IndexedDB（直接存储到内存）
 */
export class MainThreadInstrumentation {
  private mainThreadId: string = 'web-main';
  private performanceData: WorkerPerformanceData[] = [];
  private callStack: string[] = [];

  constructor(mainThreadId: string = 'web-main') {
    this.mainThreadId = mainThreadId;
  }

  /**
   * 获取主线程 ID
   */
  getMainThreadId(): string {
    return this.mainThreadId;
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
    const memoryBefore = (performance as any).memory?.usedJSHeapSize;

    // 返回结束函数
    return () => {
      const endTime = performance.now();
      const memoryAfter = (performance as any).memory?.usedJSHeapSize;

      // 弹出调用栈
      this.callStack.pop();

      // 创建性能数据
      const perfData: WorkerPerformanceData = {
        workerId: this.mainThreadId,
        functionName,
        startTime,
        endTime,
        duration: endTime - startTime,
        memoryBefore,
        memoryAfter,
        callStack: [...this.callStack],
        marker,
      };

      // 保存到内存
      this.performanceData.push(perfData);
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
    const memoryBefore = (performance as any).memory?.usedJSHeapSize;
    const memoryAfter = (performance as any).memory?.usedJSHeapSize;

    const perfData: WorkerPerformanceData = {
      workerId: this.mainThreadId,
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

    // 保存到内存
    this.performanceData.push(perfData);
  }

  /**
   * 获取所有性能数据
   */
  getAllPerformanceData(): WorkerPerformanceData[] {
    return [...this.performanceData];
  }

  /**
   * 清除所有数据
   */
  clear(): void {
    this.performanceData = [];
    this.callStack = [];
  }

  /**
   * 获取数据数量
   */
  getDataCount(): number {
    return this.performanceData.length;
  }
}

// 创建全局单例（主线程使用）
let mainThreadInstrumentationInstance: MainThreadInstrumentation | null = null;

/**
 * 获取或创建主线程插桩实例
 */
export function getMainThreadInstrumentation(
  mainThreadId: string = 'web-main'
): MainThreadInstrumentation {
  if (!mainThreadInstrumentationInstance) {
    mainThreadInstrumentationInstance = new MainThreadInstrumentation(mainThreadId);
  }
  return mainThreadInstrumentationInstance;
}

/**
 * 重置主线程插桩实例
 */
export function resetMainThreadInstrumentation(): void {
  if (mainThreadInstrumentationInstance) {
    mainThreadInstrumentationInstance.clear();
  }
  mainThreadInstrumentationInstance = null;
}
