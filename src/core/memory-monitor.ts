/**
 * 内存监控模块
 * 定期采样 JS 堆内存使用情况
 */

import type { MemorySample } from '../types/index.js';

export class MemoryMonitor {
  private samples: MemorySample[] = [];
  private intervalId: number | null = null;
  private sampleInterval: number;
  private isEnabled = false;

  constructor(sampleInterval: number = 100) {
    this.sampleInterval = sampleInterval;
  }

  /**
   * 开始内存监控
   */
  start(): void {
    if (this.isEnabled) {
      return;
    }

    // 检查浏览器是否支持 performance.memory
    if (typeof performance === 'undefined' || !('memory' in performance)) {
      console.warn('performance.memory is not available');
      return;
    }

    this.isEnabled = true;
    this.samples = [];

    // 立即采样一次
    this.sample();

    // 定期采样
    this.intervalId = window.setInterval(() => {
      this.sample();
    }, this.sampleInterval);
  }

  /**
   * 停止内存监控
   */
  stop(): void {
    this.isEnabled = false;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * 执行一次内存采样
   */
  private sample(): void {
    const memory = (performance as any).memory;
    if (!memory) {
      return;
    }

    this.samples.push({
      time: performance.now(),
      heapSize: memory.usedJSHeapSize,
      totalHeapSize: memory.totalJSHeapSize,
      heapLimit: memory.jsHeapSizeLimit,
    });
  }

  /**
   * 获取所有内存采样数据
   */
  getSamples(): MemorySample[] {
    return [...this.samples];
  }

  /**
   * 获取当前内存使用情况
   */
  getCurrentMemory(): MemorySample | null {
    const memory = (performance as any).memory;
    if (!memory) {
      return null;
    }

    return {
      time: performance.now(),
      heapSize: memory.usedJSHeapSize,
      totalHeapSize: memory.totalJSHeapSize,
      heapLimit: memory.jsHeapSizeLimit,
    };
  }

  /**
   * 清除所有采样数据
   */
  clear(): void {
    this.samples = [];
  }

  /**
   * 获取内存峰值
   */
  getPeakMemory(): MemorySample | null {
    if (this.samples.length === 0) {
      return null;
    }

    return this.samples.reduce((peak, sample) => {
      return sample.heapSize > peak.heapSize ? sample : peak;
    });
  }
}
