/**
 * GPU 渲染监控模块
 * 监控 requestAnimationFrame 执行时间和 Paint 事件
 */

import type { FrameData } from '../types/index.js';

export class GPUMonitor {
  private frames: FrameData[] = [];
  private lastFrameTime: number = 0;
  private frameCallbackId: number | null = null;
  private paintObserver: PerformanceObserver | null = null;
  private paintEvents: PerformanceEntry[] = [];
  private isEnabled = false;
  private targetFPS: number = 60;
  private targetFrameTime: number = 1000 / 60; // ~16.67ms

  constructor(targetFPS: number = 60) {
    this.targetFPS = targetFPS;
    this.targetFrameTime = 1000 / targetFPS;
  }

  /**
   * 开始 GPU 监控
   */
  start(): void {
    if (this.isEnabled) {
      return;
    }

    this.isEnabled = true;
    this.frames = [];
    this.paintEvents = [];
    this.lastFrameTime = performance.now();

    // 监控 requestAnimationFrame
    this.startFrameMonitoring();

    // 监控 Paint 事件
    this.startPaintMonitoring();
  }

  /**
   * 停止 GPU 监控
   */
  stop(): void {
    this.isEnabled = false;

    // 停止帧监控
    if (this.frameCallbackId !== null) {
      cancelAnimationFrame(this.frameCallbackId);
      this.frameCallbackId = null;
    }

    // 停止 Paint 监控
    if (this.paintObserver) {
      this.paintObserver.disconnect();
      this.paintObserver = null;
    }
  }

  /**
   * 开始帧监控
   */
  private startFrameMonitoring(): void {
    const monitorFrame = (currentTime: number) => {
      if (!this.isEnabled) {
        return;
      }

      const frameDuration = currentTime - this.lastFrameTime;
      const dropped = frameDuration > this.targetFrameTime * 1.5; // 允许一定误差

      this.frames.push({
        time: currentTime,
        duration: frameDuration,
        dropped,
      });

      this.lastFrameTime = currentTime;
      this.frameCallbackId = requestAnimationFrame(monitorFrame);
    };

    this.frameCallbackId = requestAnimationFrame(monitorFrame);
  }

  /**
   * 开始 Paint 事件监控
   */
  private startPaintMonitoring(): void {
    if (typeof PerformanceObserver === 'undefined') {
      return;
    }

    try {
      // 记录已有的 Paint 事件
      const existingPaints = performance.getEntriesByType('paint');
      this.paintEvents.push(...existingPaints);

      // 监听新的 Paint 事件
      this.paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'paint') {
            this.paintEvents.push(entry);
          }
        }
      });

      this.paintObserver.observe({ entryTypes: ['paint'] });
    } catch (error) {
      console.warn('Failed to start paint monitoring:', error);
    }
  }

  /**
   * 获取所有帧数据
   */
  getFrames(): FrameData[] {
    return [...this.frames];
  }

  /**
   * 获取 Paint 事件
   */
  getPaintEvents(): PerformanceEntry[] {
    return [...this.paintEvents];
  }

  /**
   * 计算平均 FPS
   */
  getAverageFPS(): number {
    if (this.frames.length === 0) {
      return 0;
    }

    const totalDuration = this.frames.reduce((sum, frame) => sum + frame.duration, 0);
    const averageFrameTime = totalDuration / this.frames.length;
    return 1000 / averageFrameTime;
  }

  /**
   * 获取丢帧数量
   */
  getDroppedFrameCount(): number {
    return this.frames.filter((frame) => frame.dropped).length;
  }

  /**
   * 获取丢帧率
   */
  getDroppedFrameRate(): number {
    if (this.frames.length === 0) {
      return 0;
    }
    return this.getDroppedFrameCount() / this.frames.length;
  }

  /**
   * 清除所有数据
   */
  clear(): void {
    this.frames = [];
    this.paintEvents = [];
  }
}
