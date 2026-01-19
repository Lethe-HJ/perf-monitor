/**
 * 性能监控统一管理器
 * 整合所有监控模块，提供统一的接口
 */

import type { CPUProfile, PerformanceMonitorConfig } from '../types/index.js';
import { MainThreadProfiler } from './profiler.js';
import { MemoryMonitor } from './memory-monitor.js';
import { NetworkMonitor } from './network-monitor.js';
import { GCMonitor } from './gc-monitor.js';
import { GPUMonitor } from './gpu-monitor.js';
import { CPUProfileGenerator } from './cpuprofile-generator.js';

export class PerformanceMonitor {
  private profiler: MainThreadProfiler;
  private memoryMonitor: MemoryMonitor;
  private networkMonitor: NetworkMonitor;
  private gcMonitor: GCMonitor;
  private gpuMonitor: GPUMonitor;
  private generator: CPUProfileGenerator;
  private config: PerformanceMonitorConfig;
  private startTime: number = 0;
  private workerPerformanceData: any[] = [];
  private mainThreadInstrumentationData: any[] = []; // 主线程插桩数据

  constructor(config: PerformanceMonitorConfig = {}) {
    this.config = {
      sampleInterval: 10,
      maxBufferSize: 18000,
      memorySampleInterval: 100,
      enableGC: true,
      enableNetwork: true,
      enableGPU: true,
      ...config,
    };

    this.profiler = new MainThreadProfiler(
      this.config.sampleInterval,
      this.config.maxBufferSize
    );
    this.memoryMonitor = new MemoryMonitor(this.config.memorySampleInterval);
    this.networkMonitor = new NetworkMonitor();
    this.gcMonitor = new GCMonitor(50, 5);
    this.gpuMonitor = new GPUMonitor(60);
    this.generator = new CPUProfileGenerator();
  }

  /**
   * 开始所有监控
   */
  async start(): Promise<void> {
    this.startTime = performance.now();
    this.workerPerformanceData = [];
    this.mainThreadInstrumentationData = [];

    // 启动各个监控模块
    // Profiler 可能不可用（Document Policy 限制），但不影响其他监控
    try {
      await this.profiler.start();
    } catch (error) {
      console.warn('Profiler unavailable, continuing with other monitoring:', error);
    }

    this.memoryMonitor.start();

    if (this.config.enableNetwork) {
      this.networkMonitor.start();
    }

    if (this.config.enableGC) {
      this.gcMonitor.start();
    }

    if (this.config.enableGPU) {
      this.gpuMonitor.start();
    }
  }

  /**
   * 停止所有监控
   */
  async stop(): Promise<void> {
    await this.profiler.stop();
    this.memoryMonitor.stop();

    if (this.config.enableNetwork) {
      this.networkMonitor.stop();
    }

    if (this.config.enableGC) {
      this.gcMonitor.stop();
    }

    if (this.config.enableGPU) {
      this.gpuMonitor.stop();
    }
  }

  /**
   * 添加 Worker 性能数据
   */
  addWorkerPerformanceData(data: any): void {
    this.workerPerformanceData.push(data);
  }

  /**
   * 添加主线程插桩性能数据
   */
  addMainThreadInstrumentationData(data: any): void {
    this.mainThreadInstrumentationData.push(data);
  }

  /**
   * 添加多条主线程插桩性能数据（批量）
   */
  addMainThreadInstrumentationDataBatch(dataList: any[]): void {
    this.mainThreadInstrumentationData.push(...dataList);
  }

  /**
   * 生成完整的 CPUProfile（兼容模式）
   * 合并主线程和所有 Worker 线程的数据，每个线程都有清晰的标识
   */
  async generateProfile(): Promise<CPUProfile | null> {
    const endTime = performance.now();

    // 获取 Self-Profiling trace（如果有）
    const trace = await this.profiler.stop();
    const profiles: CPUProfile[] = [];

    // 生成主线程 profile
    if (trace) {
      const mainProfile = this.generator.generateFromTrace(
        trace,
        this.startTime,
        endTime,
        'Main Thread'
      );
      profiles.push(mainProfile);
    }

    // 生成 Worker 线程 profiles（会自动按 workerId 分组）
    if (this.workerPerformanceData.length > 0) {
      const workerProfile = this.generator.generateFromWorkerData(
        this.workerPerformanceData,
        this.startTime,
        endTime
      );
      // 如果 Worker profile 不为空，添加到合并列表
      if (workerProfile.nodes.length > 0 || workerProfile.samples.length > 0) {
        profiles.push(workerProfile);
      }
    }

    // 合并所有 profiles
    if (profiles.length === 0) {
      return null;
    } else if (profiles.length === 1) {
      return profiles[0];
    } else {
      return this.generator.mergeProfiles(profiles);
    }
  }

  /**
   * 生成 Speedscope 原生格式（支持并行线程显示）
   */
  async generateSpeedscopeProfile(): Promise<any | null> {
    const endTime = performance.now();

    // 获取 Self-Profiling trace（如果有）
    const trace = await this.profiler.stop();
    
    // 生成主线程 profile（采样模式）
    let mainThreadProfile: CPUProfile | null = null;
    if (trace) {
      mainThreadProfile = this.generator.generateFromTrace(
        trace,
        this.startTime,
        endTime,
        'Main Thread'
      );
    }

    // 如果有主线程插桩数据，也生成一个 profile（插桩模式）
    // 如果采样模式和插桩模式都有数据，会合并到同一个 profile
    if (this.mainThreadInstrumentationData.length > 0) {
      const instrumentationProfile = this.generator.generateFromSingleWorkerData(
        this.mainThreadInstrumentationData,
        this.startTime,
        endTime,
        'web-main' // 主线程 ID
      );
      
      // 如果已经有采样数据，合并；否则使用插桩数据
      if (mainThreadProfile) {
        // 合并采样和插桩数据
        mainThreadProfile = this.generator.mergeProfiles([mainThreadProfile, instrumentationProfile]);
      } else {
        mainThreadProfile = instrumentationProfile;
      }
    }

    // 按 workerId 分组 Worker 数据
    const workerGroups = new Map<string, any[]>();
    for (const data of this.workerPerformanceData) {
      const workerId = data.workerId || 'unknown';
      if (!workerGroups.has(workerId)) {
        workerGroups.set(workerId, []);
      }
      workerGroups.get(workerId)!.push(data);
    }

    // 为每个 Worker 生成独立的 profile
    const workerProfiles = new Map<string, CPUProfile>();
    for (const [workerId, data] of workerGroups.entries()) {
      const profile = this.generator.generateFromSingleWorkerData(
        data,
        this.startTime,
        endTime,
        workerId
      );
      if (profile.nodes.length > 0 || profile.samples.length > 0) {
        workerProfiles.set(workerId, profile);
      }
    }

    // 如果没有任何数据，返回 null
    if (!mainThreadProfile && workerProfiles.size === 0) {
      return null;
    }

    // 生成 Speedscope 格式，传入原始 Worker 数据以便生成更准确的 evented 事件
    console.log(`[PerformanceMonitor] 调用 generateSpeedscopeFormat: workerProfiles.size=${workerProfiles.size}, workerGroups.size=${workerGroups.size}`);
    const result = this.generator.generateSpeedscopeFormat(
      mainThreadProfile,
      workerProfiles,
      workerGroups,
      this.startTime
    );
    console.log(`[PerformanceMonitor] generateSpeedscopeFormat 完成，结果:`, result ? { 
      frames: result.shared?.frames?.length || 0,
      profiles: result.profiles?.length || 0 
    } : null);
    return result;
  }

  /**
   * 生成多个独立的 Speedscope profile（每个线程一个）
   * 用于集成页面，每个线程可以独立加载
   */
  async generateIndividualSpeedscopeProfiles(): Promise<Array<{ threadId: string; profile: any }> | null> {
    const endTime = performance.now();

    // 获取 Self-Profiling trace（如果有）
    const trace = await this.profiler.stop();
    
    const profiles: Array<{ threadId: string; profile: any }> = [];

    // 生成主线程 profile（采样模式）
    // 即使 trace 为空，也尝试生成主线程 profile（可能存在其他数据）
    let mainThreadProfile: CPUProfile | null = null;
    if (trace) {
      mainThreadProfile = this.generator.generateFromTrace(
        trace,
        this.startTime,
        endTime,
        'Main Thread'
      );
    }

    // 如果有主线程插桩数据，也生成一个 profile（插桩模式）
    // 如果采样模式和插桩模式都有数据，会合并到同一个 profile
    if (this.mainThreadInstrumentationData.length > 0) {
      const instrumentationProfile = this.generator.generateFromSingleWorkerData(
        this.mainThreadInstrumentationData,
        this.startTime,
        endTime,
        'web-main' // 主线程 ID
      );
      
      // 如果已经有采样数据，合并；否则使用插桩数据
      if (mainThreadProfile) {
        // 合并采样和插桩数据
        mainThreadProfile = this.generator.mergeProfiles([mainThreadProfile, instrumentationProfile]);
      } else {
        mainThreadProfile = instrumentationProfile;
      }
    }

    // 为主线程生成 Speedscope 格式
    // 注意：即使 mainThreadProfile 为空，也尝试生成，可能返回一个空的 profile
    const mainSpeedscopeProfile = this.generator.generateSpeedscopeFormat(
      mainThreadProfile,
      new Map(),
      new Map(),
      this.startTime
    );

    // 始终添加主线程 profile，即使数据为空（这样至少会显示 checkbox）
    // 只要 mainSpeedscopeProfile 存在，就添加它
    if (mainSpeedscopeProfile) {
      profiles.push({
        threadId: 'web-main',
        profile: mainSpeedscopeProfile,
      });
      console.log('[PerformanceMonitor] 主线程 profile 已添加:', {
        hasFrames: mainSpeedscopeProfile.shared?.frames?.length > 0,
        hasProfiles: mainSpeedscopeProfile.profiles?.length > 0,
        framesCount: mainSpeedscopeProfile.shared?.frames?.length || 0,
        profilesCount: mainSpeedscopeProfile.profiles?.length || 0,
      });
    } else {
      console.warn('[PerformanceMonitor] 主线程 Speedscope profile 生成失败，使用空 profile');
      // 如果生成失败，至少创建一个空的结构
      profiles.push({
        threadId: 'web-main',
        profile: {
          $schema: 'https://www.speedscope.app/file-format-schema.json',
          shared: { frames: [] },
          profiles: [],
          name: 'Main Thread',
        },
      });
    }

    // 按 workerId 分组 Worker 数据
    const workerGroups = new Map<string, any[]>();
    for (const data of this.workerPerformanceData) {
      const workerId = data.workerId || 'unknown';
      if (!workerGroups.has(workerId)) {
        workerGroups.set(workerId, []);
      }
      workerGroups.get(workerId)!.push(data);
    }

    // 为每个 Worker 生成独立的 profile
    for (const [workerId, data] of workerGroups.entries()) {
      const profile = this.generator.generateFromSingleWorkerData(
        data,
        this.startTime,
        endTime,
        workerId
      );

      if (profile.nodes.length > 0 || profile.samples.length > 0) {
        // 为每个 Worker 生成 Speedscope 格式
        const workerProfiles = new Map<string, CPUProfile>();
        workerProfiles.set(workerId, profile);

        const workerGroupsMap = new Map<string, any[]>();
        workerGroupsMap.set(workerId, data);

        const speedscopeProfile = this.generator.generateSpeedscopeFormat(
          null,
          workerProfiles,
          workerGroupsMap,
          this.startTime
        );

        if (speedscopeProfile && speedscopeProfile.profiles && speedscopeProfile.profiles.length > 0) {
          // 从 workerId 中提取数字索引（例如从 "worker-0" 提取 "0"）
          // 如果 workerId 已经是纯数字，直接使用
          let workerIndex: string;
          if (workerId.startsWith('worker-')) {
            workerIndex = workerId.replace(/^worker-/, '');
          } else {
            workerIndex = workerId;
          }
          
          profiles.push({
            threadId: `web-worker-${workerIndex}`,
            profile: speedscopeProfile,
          });
        }
      }
    }

    return profiles.length > 0 ? profiles : null;
  }

  /**
   * 获取所有监控数据
   */
  getAllMonitoringData() {
    return {
      memory: this.memoryMonitor.getSamples(),
      network: this.networkMonitor.getRequests(),
      gc: this.gcMonitor.getEvents(),
      gpu: {
        frames: this.gpuMonitor.getFrames(),
        paintEvents: this.gpuMonitor.getPaintEvents(),
        averageFPS: this.gpuMonitor.getAverageFPS(),
        droppedFrameRate: this.gpuMonitor.getDroppedFrameRate(),
      },
      worker: this.workerPerformanceData,
    };
  }

  /**
   * 清除所有数据
   */
  clear(): void {
    this.workerPerformanceData = [];
    this.mainThreadInstrumentationData = [];
    this.memoryMonitor.clear();
    this.networkMonitor.clear();
    this.gcMonitor.clear();
    this.gpuMonitor.clear();
  }
}
