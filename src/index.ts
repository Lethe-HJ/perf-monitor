/**
 * 性能监控核心库主入口
 * 导出所有核心功能和类型
 */

// 核心监控模块
export { MainThreadProfiler } from './core/profiler.js';
export { MemoryMonitor } from './core/memory-monitor.js';
export { NetworkMonitor } from './core/network-monitor.js';
export { GCMonitor } from './core/gc-monitor.js';
export { GPUMonitor } from './core/gpu-monitor.js';
export { WorkerProfiler, workerProfiler } from './core/worker-profiler.js';
export { 
  MainThreadInstrumentation,
  getMainThreadInstrumentation,
  resetMainThreadInstrumentation,
} from './core/main-thread-instrumentation.js';
export { CPUProfileGenerator } from './core/cpuprofile-generator.js';
export { PerformanceMonitor } from './core/performance-monitor.js';

// 函数标记功能
export {
  markFunction,
  getFunctionMarker,
  isFunctionMarked,
  getAllMarkedFunctions,
  clearAllMarkers,
} from './core/function-marker.js';

// Lit 组件
export { PerformanceAnalyzerButton } from './components/performance-analyzer-button.js';
export { PerformanceDialog } from './components/performance-dialog.js';
export { PerformanceViewer } from './components/performance-viewer.js';

// 工具函数（旧版，保留兼容）
export {
  injectPerformanceAnalyzer,
  removePerformanceAnalyzer,
  updateProfile,
} from './utils/inject-analyzer.js';

// 工具函数（新版，推荐使用）
export {
  injectPerformanceControls,
  removePerformanceControls,
  updateRecordingState,
  type PerformanceControlsCallbacks,
} from './utils/inject-controls.js';

// 性能监控辅助函数
export {
  startPerformanceRecording,
  stopPerformanceRecording,
  resetPerformanceMonitor,
  createPerformanceCallbacks,
} from './utils/performance-helpers.js';

// 自动打开 Profile 工具（开发环境）
export {
  autoOpenProfile,
  downloadProfile,
} from './utils/auto-open-profile.js';

// 类型定义
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
} from './types/index.js';
