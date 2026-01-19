/**
 * 函数插桩装饰器
 * 自动记录函数执行时间，简化插桩代码
 */

import type { WorkerProfiler } from './worker-profiler.js';

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
    throw new Error(
      'WorkerProfiler not initialized. Call setWorkerProfiler() first, ' +
      'or ensure your Worker receives an INIT_WORKER message with workerId.'
    );
  }
  return workerProfilerInstance;
}

/**
 * @instrument 装饰器
 * 自动记录被装饰函数的执行时间
 * 
 * 使用方式：
 * ```typescript
 * import { instrument } from '@src/core/instrument-decorator';
 * 
 * class ImageProcessor {
 *   @instrument
 *   async fetchImage(url: string) {
 *     const response = await fetch(url);
 *     return response.blob();
 *   }
 * 
 *   @instrument('custom-function-name')
 *   async processData(data: Blob) {
 *     // 使用自定义函数名
 *   }
 * }
 * ```
 * 
 * @param functionName - 可选的函数名（用于性能记录），默认使用 `${类名}.${方法名}`
 */
export function instrument(functionName?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    // 如果未提供函数名，使用类名和方法名组合
    const finalFunctionName = functionName || 
      `${target.constructor?.name || 'Anonymous'}.${propertyKey}`;

    descriptor.value = function (...args: any[]) {
      const profiler = getWorkerProfiler();
      const endFunction = profiler.startFunction(finalFunctionName);
      
      try {
        const result = originalMethod.apply(this, args);
        
        // 处理 Promise（异步函数）
        if (result instanceof Promise) {
          return result.finally(() => {
            endFunction();
          });
        }
        
        // 同步函数
        endFunction();
        return result;
      } catch (error) {
        // 确保在抛出错误前也结束记录
        endFunction();
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * 函数级别的插桩装饰器（不依赖类）
 * 用于装饰独立的函数
 * 
 * 使用方式：
 * ```typescript
 * import { instrumentFunction } from '@src/core/instrument-decorator';
 * 
 * export const fetchImage = instrumentFunction('fetchImage', async (url: string) => {
 *   const response = await fetch(url);
 *   return response.blob();
 * });
 * ```
 * 
 * @param functionName - 函数名（用于性能记录）
 * @param fn - 要装饰的函数
 */
export function instrumentFunction<T extends (...args: any[]) => any>(
  functionName: string,
  fn: T
): T {
  return ((...args: Parameters<T>): ReturnType<T> => {
    const profiler = getWorkerProfiler();
    const endFunction = profiler.startFunction(functionName);
    
    try {
      const result = fn(...args);
      
      // 处理 Promise（异步函数）
      if (result instanceof Promise) {
        return result.finally(() => {
          endFunction();
        }) as ReturnType<T>;
      }
      
      // 同步函数
      endFunction();
      return result;
    } catch (error) {
      // 确保在抛出错误前也结束记录
      endFunction();
      throw error;
    }
  }) as T;
}
