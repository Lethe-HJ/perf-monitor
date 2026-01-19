/**
 * 主线程 Profiler
 * 封装 JS Self-Profiling API
 */

interface ProfilerTrace {
  resources: any[];
  frames: any[];
  stacks: any[];
  samples: any[];
}

export class MainThreadProfiler {
  private profiler: any | null = null;
  private isRunning = false;
  private sampleInterval: number;
  private maxBufferSize: number;

  constructor(sampleInterval: number = 10, maxBufferSize: number = 18000) {
    this.sampleInterval = sampleInterval;
    this.maxBufferSize = maxBufferSize;
  }

  /**
   * 检查是否支持 Self-Profiling API
   */
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'Profiler' in window;
  }

  /**
   * 检查是否允许使用 Profiling（检查 Document Policy）
   * 由于 Document Policy 检查可能不可靠，实际会在 start() 中尝试创建来检查
   */
  isAllowed(): boolean {
    if (!this.isSupported()) {
      return false;
    }

    // 尝试检查 Document Policy（如果支持）
    if (typeof document !== 'undefined' && 'policy' in document) {
      try {
        const policy = (document as any).policy;
        if (policy && typeof policy.allowsFeature === 'function') {
          return policy.allowsFeature('js-profiling');
        }
      } catch (e) {
        // 如果检查失败，继续尝试其他方法
      }
    }

    // 如果无法检查 policy，假设可能可用（实际会在 start() 中验证）
    return true;
  }

  /**
   * 开始 Profiling
   * @returns 是否成功启动
   */
  async start(): Promise<boolean> {
    if (!this.isSupported()) {
      console.warn('JS Self-Profiling API is not supported');
      return false;
    }

    if (!this.isAllowed()) {
      console.warn('JS Profiling is disabled by Document Policy. Falling back to Worker-only profiling.');
      return false;
    }

    if (this.isRunning) {
      return true;
    }

    try {
      const ProfilerConstructor = (window as any).Profiler;
      
      // Profiler 构造函数可能需要 options，但创建后可能已经自动开始
      // 尝试两种方式：直接创建，或者使用 start() 方法
      this.profiler = new ProfilerConstructor({
        sampleInterval: this.sampleInterval,
        maxBufferSize: this.maxBufferSize,
      });

      // 检查是否有 start 方法
      if (typeof this.profiler.start === 'function') {
        await this.profiler.start();
      } else {
        // 如果没有 start 方法，说明创建后已经自动开始
        console.log('[Profiler] Profiler 已自动启动（无需调用 start()）');
      }
      
      this.isRunning = true;
      return true;
    } catch (error) {
      console.warn(`Failed to start profiler: ${error}. Falling back to Worker-only profiling.`);
      return false;
    }
  }

  /**
   * 停止 Profiling 并获取 trace 数据
   */
  async stop(): Promise<ProfilerTrace | null> {
    if (!this.profiler || !this.isRunning) {
      return null;
    }

    try {
      const trace = await this.profiler.stop();
      this.isRunning = false;
      this.profiler = null;
      return trace;
    } catch (error) {
      console.error('Failed to stop profiler:', error);
      this.isRunning = false;
      this.profiler = null;
      return null;
    }
  }

  /**
   * 获取是否正在运行
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }
}
