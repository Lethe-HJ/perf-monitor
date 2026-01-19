/**
 * 性能监控核心类型定义
 */

// CPUProfile 格式类型
export interface CPUProfile {
  nodes: ProfileNode[];
  samples: number[];
  timeDeltas: number[];
  startTime: number;
  endTime: number;
}

export interface ProfileNode {
  id: number;
  callFrame: {
    functionName: string;
    scriptId: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
  hitCount?: number;
  children?: number[];
  deoptReason?: string;
  positionTicks?: any[];
  // 扩展字段：函数标记信息
  marker?: FunctionMarker;
}

// 函数标记类型
export interface FunctionMarker {
  functionName: string;
  category: 'network' | 'render' | 'compute' | 'custom';
  description?: string;
  color?: string;
}

// 内存采样数据
export interface MemorySample {
  time: number;
  heapSize: number;
  totalHeapSize?: number;
  heapLimit?: number;
}

// 网络请求数据
export interface NetworkRequest {
  name: string;
  duration: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  startTime: number;
  responseEnd: number;
  method?: string;
}

// GC 事件
export interface GCEvent {
  time: number;
  memoryBefore: number;
  memoryAfter: number;
  freed: number;
}

// GPU 帧数据
export interface FrameData {
  time: number;
  duration: number;
  dropped: boolean;
}

// Worker 性能数据
export interface WorkerPerformanceData {
  workerId: string;
  functionName: string;
  startTime: number;
  endTime: number;
  duration: number;
  memoryBefore?: number;
  memoryAfter?: number;
  callStack?: string[];
  marker?: FunctionMarker;
}

// 性能分析模式
export type ProfilingMode = 
  | 'sampling'        // 采样模式：使用 JS Self-Profiling API（主线程）
  | 'instrumentation' // 插桩模式：手动插桩（Worker 线程，或主线程降级方案）
  | 'hybrid';         // 混合模式：主线程采样 + Worker 插桩

// 性能监控配置
export interface PerformanceMonitorConfig {
  sampleInterval?: number;      // 采样间隔（毫秒）
  maxBufferSize?: number;        // 最大缓冲区大小
  memorySampleInterval?: number; // 内存采样间隔（毫秒）
  enableGC?: boolean;            // 是否启用 GC 监控
  enableNetwork?: boolean;       // 是否启用网络监控
  enableGPU?: boolean;           // 是否启用 GPU 监控
  profilingMode?: ProfilingMode; // 性能分析模式（默认：主线程 'sampling'，Worker 'instrumentation'）
}
