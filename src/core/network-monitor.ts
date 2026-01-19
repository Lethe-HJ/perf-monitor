/**
 * 网络请求监控模块
 * 使用 PerformanceObserver 监听资源加载
 */

import type { NetworkRequest } from '../types/index.js';

export class NetworkMonitor {
  private requests: NetworkRequest[] = [];
  private observer: PerformanceObserver | null = null;
  private isEnabled = false;

  /**
   * 开始网络监控
   */
  start(): void {
    if (this.isEnabled) {
      return;
    }

    if (typeof PerformanceObserver === 'undefined') {
      console.warn('PerformanceObserver is not supported');
      return;
    }

    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry instanceof PerformanceResourceTiming) {
            this.recordRequest(entry);
          }
        }
      });

      this.observer.observe({ entryTypes: ['resource'] });
      this.isEnabled = true;

      // 也记录已有的资源
      this.recordExistingResources();
    } catch (error) {
      console.warn('Failed to start network monitor:', error);
    }
  }

  /**
   * 停止网络监控
   */
  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.isEnabled = false;
  }

  /**
   * 记录一个网络请求
   */
  private recordRequest(entry: PerformanceResourceTiming): void {
    // 尝试从 URL 推断 HTTP 方法（如果可用）
    let method = 'GET';
    
    // 可以通过 fetch 拦截或其他方式获取方法，这里简化处理
    // 在实际应用中，可能需要拦截 fetch/XMLHttpRequest

    this.requests.push({
      name: entry.name,
      duration: entry.duration,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
      startTime: entry.startTime,
      responseEnd: entry.responseEnd,
      method,
    });
  }

  /**
   * 记录已有的资源
   */
  private recordExistingResources(): void {
    try {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      for (const entry of entries) {
        this.recordRequest(entry);
      }
    } catch (error) {
      console.warn('Failed to record existing resources:', error);
    }
  }

  /**
   * 获取所有网络请求
   */
  getRequests(): NetworkRequest[] {
    return [...this.requests];
  }

  /**
   * 获取指定时间范围内的网络请求
   */
  getRequestsInRange(startTime: number, endTime: number): NetworkRequest[] {
    return this.requests.filter(
      (req) => req.startTime >= startTime && req.responseEnd <= endTime
    );
  }

  /**
   * 获取总传输大小
   */
  getTotalTransferSize(): number {
    return this.requests.reduce((total, req) => total + req.transferSize, 0);
  }

  /**
   * 清除所有请求记录
   */
  clear(): void {
    this.requests = [];
  }
}
