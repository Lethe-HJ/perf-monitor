/**
 * GC (垃圾回收) 监控模块
 * 通过监控内存突然下降来推断 GC 事件
 */

import type { GCEvent } from '../types/index.js';

export class GCMonitor {
  private events: GCEvent[] = [];
  private lastMemory: number = 0;
  private threshold: number; // 内存下降阈值（字节）
  private intervalId: number | null = null;
  private sampleInterval: number;
  private isEnabled = false;

  constructor(sampleInterval: number = 50, thresholdMB: number = 5) {
    this.sampleInterval = sampleInterval;
    this.threshold = thresholdMB * 1024 * 1024; // 转换为字节
  }

  /**
   * 开始 GC 监控
   */
  start(): void {
    if (this.isEnabled) {
      return;
    }

    if (typeof performance === 'undefined' || !('memory' in performance)) {
      console.warn('performance.memory is not available for GC monitoring');
      return;
    }

    this.isEnabled = true;
    this.events = [];
    const memory = (performance as any).memory;
    this.lastMemory = memory?.usedJSHeapSize || 0;

    // 定期检查内存变化
    this.intervalId = window.setInterval(() => {
      this.checkGC();
    }, this.sampleInterval);
  }

  /**
   * 停止 GC 监控
   */
  stop(): void {
    this.isEnabled = false;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * 检查是否发生 GC
   */
  private checkGC(): void {
    const memory = (performance as any).memory;
    if (!memory) {
      return;
    }

    const currentMemory = memory.usedJSHeapSize || 0;
    const memoryDrop = this.lastMemory - currentMemory;

    // 如果内存下降超过阈值，可能是 GC
    if (memoryDrop > this.threshold) {
      this.events.push({
        time: performance.now(),
        memoryBefore: this.lastMemory,
        memoryAfter: currentMemory,
        freed: memoryDrop,
      });
    }

    this.lastMemory = currentMemory;
  }

  /**
   * 获取所有 GC 事件
   */
  getEvents(): GCEvent[] {
    return [...this.events];
  }

  /**
   * 获取 GC 事件总数
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * 清除所有 GC 事件记录
   */
  clear(): void {
    this.events = [];
  }

  /**
   * 获取总共释放的内存
   */
  getTotalFreedMemory(): number {
    return this.events.reduce((total, event) => total + event.freed, 0);
  }
}
