/**
 * 性能监控辅助函数
 * 提供常用的性能监控操作封装
 */

import type { PerformanceMonitor } from '../core/performance-monitor.js';
import type { CPUProfile } from '../types/index.js';

/**
 * 开始记录性能数据
 */
export async function startPerformanceRecording(
  monitor: PerformanceMonitor
): Promise<void> {
  console.log('[Performance Monitor] 开始记录性能数据...');
  try {
    await monitor.start();
    console.log('[Performance Monitor] 性能监控已启动');
  } catch (error) {
    console.error('[Performance Monitor] 启动监控失败:', error);
    throw error;
  }
}

/**
 * 停止记录并生成 Profile
 * 优先生成 Speedscope 格式（支持并行线程显示）
 */
export async function stopPerformanceRecording(
  monitor: PerformanceMonitor
): Promise<CPUProfile | any | null> {
  console.log('[Performance Monitor] 停止记录，生成 Profile...');
  try {
    // 停止监控
    await monitor.stop();
    console.log('[Performance Monitor] 监控已停止');

    // 生成 Speedscope 格式（支持多线程并行显示）
    const speedscopeProfile = await monitor.generateSpeedscopeProfile();
    
    if (speedscopeProfile) {
      console.log('[Performance Monitor] Speedscope Profile 已生成（支持多线程）');
      // 返回 Speedscope 格式
      return speedscopeProfile;
    }

    // 降级到 CPUProfile 格式
    const profile = await monitor.generateProfile();
    console.log('[Performance Monitor] CPU Profile 已生成');

    // 获取所有监控数据
    const allData = monitor.getAllMonitoringData();
    console.log('[Performance Monitor] 性能数据:', allData);

    return profile;
  } catch (error) {
    console.error('[Performance Monitor] 生成 Profile 失败:', error);
    return null;
  }
}

/**
 * 重置性能监控状态
 */
export function resetPerformanceMonitor(monitor: PerformanceMonitor): void {
  console.log('[Performance Monitor] 重置性能监控状态...');
  monitor.clear();
  console.log('[Performance Monitor] 已重置');
}

/**
 * 创建标准的性能监控回调函数
 * 适用于 injectPerformanceControls
 */
export function createPerformanceCallbacks(
  monitor: PerformanceMonitor
): {
  onStart: () => Promise<void>;
  onStop: () => Promise<CPUProfile | null>;
  onRefresh: () => void;
  onGenerateIndividualProfiles?: () => Promise<Array<{ threadId: string; profile: any }> | null>;
} {
  return {
    onStart: () => startPerformanceRecording(monitor),
    onStop: () => stopPerformanceRecording(monitor),
    onRefresh: () => resetPerformanceMonitor(monitor),
    onGenerateIndividualProfiles: () => monitor.generateIndividualSpeedscopeProfiles(),
  };
}
