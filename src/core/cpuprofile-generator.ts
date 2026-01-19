/**
 * CPUProfile 格式生成器
 * 将各种监控数据转换为标准的 Chrome DevTools .cpuprofile 格式
 */

import type { CPUProfile, ProfileNode, WorkerPerformanceData } from '../types/index.js';
import { getFunctionMarker } from './function-marker.js';

interface ProfilerTrace {
  resources?: any[];
  frames?: any[];
  stacks?: any[];
  samples?: any[];
}

interface NodeMap {
  [key: string]: number; // functionName -> nodeId
}

export class CPUProfileGenerator {
  private nodes: ProfileNode[] = [];
  private samples: number[] = [];
  private timeDeltas: number[] = [];
  private nodeMap: NodeMap = {};
  private nodeIdCounter = 0;
  private scriptIdCounter = 0;
  private scriptMap: Map<string, string> = new Map();
  private startTime: number = 0;

  /**
   * 从 Self-Profiling API trace 生成 CPUProfile
   * @param trace Profiler trace 数据
   * @param startTime 开始时间
   * @param endTime 结束时间
   * @param threadName 线程名称，默认为 "Main Thread"
   */
  generateFromTrace(
    trace: ProfilerTrace | null,
    startTime: number,
    endTime: number,
    threadName: string = 'Main Thread'
  ): CPUProfile {
    this.reset();
    this.startTime = startTime;

    if (!trace || !trace.samples || !trace.stacks) {
      return this.getEmptyProfile(startTime, endTime);
    }

    // 处理 trace 数据，传入线程名称
    this.processTrace(trace, startTime, threadName);

    return {
      nodes: this.nodes,
      samples: this.samples,
      timeDeltas: this.timeDeltas,
      startTime,
      endTime,
    };
  }

  /**
   * 从 Worker 性能数据生成 CPUProfile
   * 支持按 workerId 分组，为每个 Worker 生成独立的 profile
   */
  generateFromWorkerData(
    workerData: WorkerPerformanceData[],
    startTime: number,
    endTime: number
  ): CPUProfile {
    // 按 workerId 分组
    const workerGroups = new Map<string, WorkerPerformanceData[]>();
    for (const data of workerData) {
      const workerId = data.workerId || 'unknown';
      if (!workerGroups.has(workerId)) {
        workerGroups.set(workerId, []);
      }
      workerGroups.get(workerId)!.push(data);
    }

    // 如果只有一个 Worker 组，直接生成
    if (workerGroups.size === 1) {
      const [workerId, data] = Array.from(workerGroups.entries())[0];
      return this.generateFromSingleWorkerData(data, startTime, endTime, workerId);
    }

    // 如果有多个 Worker 组，为每个 Worker 生成 profile 后合并
    const profiles: CPUProfile[] = [];
    for (const [workerId, data] of workerGroups.entries()) {
      const profile = this.generateFromSingleWorkerData(data, startTime, endTime, workerId);
      profiles.push(profile);
    }

    // 合并所有 Worker profiles
    if (profiles.length === 0) {
      return this.getEmptyProfile(startTime, endTime);
    } else if (profiles.length === 1) {
      return profiles[0];
    } else {
      return this.mergeProfiles(profiles);
    }
  }

  /**
   * 从单个 Worker 的性能数据生成 CPUProfile
   */
  generateFromSingleWorkerData(
    workerData: WorkerPerformanceData[],
    startTime: number,
    endTime: number,
    workerId: string
  ): CPUProfile {
    this.reset();
    this.startTime = startTime;

    // 按时间排序
    const sortedData = workerData.sort((a, b) => a.startTime - b.startTime);

    // 为每个函数执行创建节点和采样
    // 需要确保 timeDeltas 是递增的累积时间
    for (const data of sortedData) {
      this.addWorkerPerformanceData(data, workerId);
    }

    // 确保 timeDeltas 是递增的（累积时间）
    this.normalizeTimeDeltas();

    return {
      nodes: this.nodes,
      samples: this.samples,
      timeDeltas: this.timeDeltas,
      startTime,
      endTime,
    };
  }

  /**
   * 合并多个 CPUProfile
   */
  mergeProfiles(profiles: CPUProfile[]): CPUProfile {
    if (profiles.length === 0) {
      throw new Error('Cannot merge empty profiles');
    }

    const merged: CPUProfile = {
      nodes: [],
      samples: [],
      timeDeltas: [],
      startTime: Math.min(...profiles.map((p) => p.startTime)),
      endTime: Math.max(...profiles.map((p) => p.endTime)),
    };

    let nodeIdOffset = 0;
    let cumulativeTime = 0; // 累积时间，确保合并后的 timeDeltas 是递增的

    // 按 startTime 排序 profiles，确保时间顺序正确
    const sortedProfiles = [...profiles].sort((a, b) => a.startTime - b.startTime);

    for (const profile of sortedProfiles) {
      // 计算时间偏移（相对于合并后的 startTime）
      const timeOffset = (profile.startTime - merged.startTime) * 1000; // 转换为微秒

      // 合并节点
      const nodeMapping = new Map<number, number>();
      for (const node of profile.nodes) {
        const newId = nodeIdOffset + node.id;
        nodeMapping.set(node.id, newId);
        merged.nodes.push({ ...node, id: newId });
      }

      // 合并采样和时间差
      // 需要将所有 timeDeltas 转换为相对于合并后 startTime 的累积时间
      for (let i = 0; i < profile.samples.length; i++) {
        const originalNodeId = profile.samples[i];
        const mappedNodeId = nodeMapping.get(originalNodeId) || originalNodeId;
        merged.samples.push(mappedNodeId);
        
        // 将每个 profile 的 timeDeltas 转换为相对于合并后 startTime 的累积时间
        const originalDelta = profile.timeDeltas[i] || 0;
        const adjustedDelta = timeOffset + originalDelta;
        
        // 确保是递增的
        if (adjustedDelta > cumulativeTime) {
          cumulativeTime = adjustedDelta;
        } else {
          cumulativeTime += 1; // 至少增加 1 微秒
        }
        
        merged.timeDeltas.push(cumulativeTime);
      }

      nodeIdOffset += profile.nodes.length;
    }

    return merged;
  }

  /**
   * 处理 trace 数据
   * @param trace Profiler trace 数据
   * @param startTime 开始时间
   * @param threadName 线程名称，用于标识线程
   */
  private processTrace(trace: ProfilerTrace, startTime: number, threadName: string): void {
    const { samples = [], stacks = [], frames = [] } = trace;

    // 创建节点映射（传入线程名称）
    for (const frame of frames) {
      this.getOrCreateNode(frame, threadName);
    }

    // 处理采样
    // timeDeltas 应该是累积时间（从 startTime 开始的累积微秒数）
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const stack = stacks[sample.stackId];

      if (stack && stack.frameId !== undefined) {
        const frame = frames[stack.frameId];
        const nodeId = this.getOrCreateNode(frame, threadName);
        this.samples.push(nodeId);

        // 计算累积时间（从 startTime 开始的累积微秒数）
        const currentTime = sample.timestamp;
        const cumulativeTime = (currentTime - startTime) * 1000; // 转换为微秒
        this.timeDeltas.push(cumulativeTime);
      }
    }
  }

  /**
   * 获取或创建节点
   * @param frame Frame 数据
   * @param threadName 线程名称，用于标识线程
   */
  private getOrCreateNode(frame: any, threadName: string = 'Main Thread'): number {
    const functionName = frame.name || '(anonymous)';
    // 主线程使用 "main-thread"，Worker 使用 "worker-{id}"
    const baseUrl = frame.resourceId !== undefined ? `script-${frame.resourceId}` : '';
    const url = threadName === 'Main Thread' 
      ? `main-thread://${baseUrl || 'inline'}`
      : `${threadName}://${baseUrl || 'inline'}`;

    // 创建节点键（包含线程信息）
    const nodeKey = `${threadName}::${functionName}::${url}::${frame.line ?? 0}::${frame.column ?? 0}`;

    if (this.nodeMap[nodeKey] !== undefined) {
      return this.nodeMap[nodeKey];
    }

    const nodeId = this.nodeIdCounter++;
    const scriptId = this.getScriptId(url);
    const marker = getFunctionMarker(functionName);

    const node: ProfileNode = {
      id: nodeId,
      callFrame: {
        // 在函数名前添加线程标识（如果不在主线程）
        functionName: threadName === 'Main Thread' 
          ? functionName 
          : `[${threadName}] ${functionName}`,
        scriptId,
        url,
        lineNumber: frame.line ?? 0,
        columnNumber: frame.column ?? 0,
      },
      hitCount: 1,
      ...(marker && { marker }),
    };

    this.nodes.push(node);
    this.nodeMap[nodeKey] = nodeId;

    return nodeId;
  }

  /**
   * 添加 Worker 性能数据
   * @param data Worker 性能数据
   * @param workerId Worker ID，用于标识线程
   */
  private addWorkerPerformanceData(data: WorkerPerformanceData, workerId: string): void {
    // 使用更清晰的线程标识
    const threadName = `Worker-${workerId}`;
    const functionName = data.functionName;
    // URL 格式：worker-{id}://function-name
    const url = `${threadName}://${functionName}`;
    // 节点键包含线程信息，确保不同 Worker 的相同函数名可以区分
    const nodeKey = `${threadName}::${functionName}::${url}::0::0`;

    let nodeId: number;
    if (this.nodeMap[nodeKey] !== undefined) {
      nodeId = this.nodeMap[nodeKey];
      // 增加命中次数
      const node = this.nodes.find((n) => n.id === nodeId);
      if (node) {
        node.hitCount = (node.hitCount || 0) + 1;
      }
    } else {
      nodeId = this.nodeIdCounter++;
      const scriptId = this.getScriptId(url);

      const node: ProfileNode = {
        id: nodeId,
        callFrame: {
          // 在函数名前添加线程标识，例如 "[Worker-1] fetchImage"
          functionName: `[${threadName}] ${functionName}`,
          scriptId,
          url,
          lineNumber: 0,
          columnNumber: 0,
        },
        hitCount: 1,
        ...(data.marker && { marker: data.marker }),
      };

      this.nodes.push(node);
      this.nodeMap[nodeKey] = nodeId;
    }

    // 添加采样点
    // timeDeltas 应该是累积时间（从 startTime 开始的累积微秒数）
    const cumulativeTime = (data.startTime - this.startTime) * 1000; // 转换为微秒
    this.samples.push(nodeId);
    this.timeDeltas.push(cumulativeTime);
  }

  /**
   * 规范化 timeDeltas，确保它们是递增的累积时间
   */
  private normalizeTimeDeltas(): void {
    if (this.timeDeltas.length === 0) return;

    // 确保 timeDeltas 是递增的
    // 如果发现递减的值，说明数据有问题，需要修复
    let lastTime = 0;
    for (let i = 0; i < this.timeDeltas.length; i++) {
      if (this.timeDeltas[i] < lastTime) {
        // 如果当前值小于前一个值，说明时间顺序有问题
        // 修复：使用前一个值加上一个最小间隔
        this.timeDeltas[i] = lastTime + 1; // 至少增加 1 微秒
      }
      lastTime = this.timeDeltas[i];
    }
  }

  /**
   * 获取脚本 ID
   */
  private getScriptId(url: string): string {
    if (this.scriptMap.has(url)) {
      return this.scriptMap.get(url)!;
    }

    const scriptId = `script-${this.scriptIdCounter++}`;
    this.scriptMap.set(url, scriptId);
    return scriptId;
  }

  /**
   * 重置生成器状态
   */
  private reset(): void {
    this.nodes = [];
    this.samples = [];
    this.timeDeltas = [];
    this.nodeMap = {};
    this.nodeIdCounter = 0;
    this.scriptIdCounter = 0;
    this.scriptMap.clear();
  }

  /**
   * 获取空的 CPUProfile
   */
  private getEmptyProfile(startTime: number, endTime: number): CPUProfile {
    return {
      nodes: [],
      samples: [],
      timeDeltas: [],
      startTime,
      endTime,
    };
  }

  /**
   * 生成 Speedscope 原生格式（支持多线程并行显示）
   * 将主线程和 Worker 线程的数据转换为 Speedscope 格式
   * @param mainThreadProfile 主线程 profile
   * @param workerProfiles Worker 线程 profiles
   * @param workerGroups 原始 Worker 数据分组（用于生成准确的 evented 事件）
   */
  generateSpeedscopeFormat(
    mainThreadProfile: CPUProfile | null,
    workerProfiles: Map<string, CPUProfile>,
    workerGroups?: Map<string, WorkerPerformanceData[]>,
    baseStartTime: number = 0
  ): any {
    console.log(`[CPUProfileGenerator] generateSpeedscopeFormat 开始: mainThreadProfile=${!!mainThreadProfile}, workerProfiles.size=${workerProfiles.size}, workerGroups=${workerGroups ? `size=${workerGroups.size}` : 'undefined'}, baseStartTime=${baseStartTime}`);
    
    // 计算实际的时间基准：找到所有 Worker 数据中的最小 startTime
    let actualStartTime = baseStartTime;
    if (workerGroups && workerGroups.size > 0) {
      let minStartTime = Infinity;
      for (const dataArray of workerGroups.values()) {
        for (const data of dataArray) {
          if (data.startTime < minStartTime) {
            minStartTime = data.startTime;
          }
        }
      }
      // 如果找到的最小时间更早，使用最小时间作为基准
      if (minStartTime < actualStartTime && minStartTime !== Infinity) {
        actualStartTime = minStartTime;
        console.log(`[CPUProfileGenerator] 调整时间基准: baseStartTime=${baseStartTime} -> actualStartTime=${actualStartTime} (差值=${actualStartTime - baseStartTime}ms)`);
      }
    }
    
    // 收集所有 frames
    const frameMap = new Map<string, number>();
    const frames: any[] = [];
    let frameId = 0;

    // 从主线程 profile 提取 frames
    if (mainThreadProfile) {
      for (const node of mainThreadProfile.nodes) {
        const key = `${node.callFrame.functionName}::${node.callFrame.url}::${node.callFrame.lineNumber}::${node.callFrame.columnNumber}`;
        if (!frameMap.has(key)) {
          frameMap.set(key, frameId++);
          frames.push({
            name: node.callFrame.functionName,
            file: node.callFrame.url || '(unknown)',
            line: node.callFrame.lineNumber,
            col: node.callFrame.columnNumber,
          });
        }
      }
    }

    // 从 Worker profiles 提取 frames
    for (const profile of workerProfiles.values()) {
      for (const node of profile.nodes) {
        const key = `${node.callFrame.functionName}::${node.callFrame.url}::${node.callFrame.lineNumber}::${node.callFrame.columnNumber}`;
        if (!frameMap.has(key)) {
          frameMap.set(key, frameId++);
          frames.push({
            name: node.callFrame.functionName,
            file: node.callFrame.url || '(unknown)',
            line: node.callFrame.lineNumber,
            col: node.callFrame.columnNumber,
          });
        }
      }
    }

    const profiles: any[] = [];
    const nodeToFrameMap = new Map<string, Map<number, number>>(); // thread -> (nodeId -> frameId)

    // 为主线程生成 sampled profile
    // 注意：即使 mainThreadProfile 存在但没有 samples，也会在后面创建一个空的 profile
    if (mainThreadProfile && mainThreadProfile.samples && Array.isArray(mainThreadProfile.samples) && mainThreadProfile.samples.length > 0) {
      const threadMap = new Map<number, number>();
      
      // 构建 nodeId -> frameId 映射
      for (const node of mainThreadProfile.nodes) {
        const key = `${node.callFrame.functionName}::${node.callFrame.url}::${node.callFrame.lineNumber}::${node.callFrame.columnNumber}`;
        const frameIdx = frameMap.get(key)!;
        threadMap.set(node.id, frameIdx);
      }

      // 转换 samples 和 timeDeltas 为 Speedscope sampled 格式
      const samples: number[] = [];
      const weights: number[] = [];
      
      // 将累积时间转换为相对时间权重
      let lastTime = 0;
      for (let i = 0; i < mainThreadProfile.samples.length; i++) {
        const nodeId = mainThreadProfile.samples[i];
        const frameId = threadMap.get(nodeId);
        if (frameId !== undefined) {
          samples.push(frameId);
          
          // 计算时间权重（从累积时间转换为权重）
          const currentTime = mainThreadProfile.timeDeltas[i] || 0;
          const weight = currentTime - lastTime;
          weights.push(Math.max(weight, 1)); // 至少 1 微秒
          lastTime = currentTime;
        }
      }

      // 只有当 samples 和 weights 都有数据时才添加 profile
      if (samples.length > 0 && weights.length > 0 && samples.length === weights.length) {
        // 确保 samples 和 weights 都是有效的数组
        const validSamples = samples.filter((s, i) => s !== undefined && s !== null && weights[i] !== undefined && weights[i] !== null);
        const validWeights = weights.filter((w, i) => w !== undefined && w !== null && samples[i] !== undefined && samples[i] !== null);
        
        if (validSamples.length > 0 && validWeights.length > 0 && validSamples.length === validWeights.length) {
          // 确保 endValue 是正确的（使用最后一个累积时间）
          const lastTime = mainThreadProfile.timeDeltas.length > 0
            ? mainThreadProfile.timeDeltas[mainThreadProfile.timeDeltas.length - 1]
            : (mainThreadProfile.endTime - mainThreadProfile.startTime) * 1000;
          
          profiles.push({
            type: 'sampled',
            name: 'Main Thread',
            unit: 'microseconds',
            startValue: 0,
            endValue: Math.max(lastTime, 1), // 至少 1 微秒
            samples: validSamples,
            weights: validWeights,
          });

          nodeToFrameMap.set('Main Thread', threadMap);
        } else {
          console.warn('[CPUProfileGenerator] Main Thread profile 过滤后为空:', {
            originalSamples: samples.length,
            originalWeights: weights.length,
            validSamples: validSamples.length,
            validWeights: validWeights.length,
            nodes: mainThreadProfile.nodes.length
          });
        }
      } else {
        console.warn('[CPUProfileGenerator] Main Thread profile 为空或无效:', {
          samples: samples.length,
          weights: weights.length,
          nodes: mainThreadProfile.nodes.length
        });
      }
    } else if (mainThreadProfile) {
      // 如果主线程 profile 存在但没有 samples，创建一个空的 sampled profile
      // 这样至少可以让 speedscope 加载并显示
      console.log('[CPUProfileGenerator] 主线程 profile 存在但没有 samples，创建空的 sampled profile');
      const endTime = mainThreadProfile.endTime || baseStartTime + 1000;
      const startTime = mainThreadProfile.startTime || baseStartTime;
      profiles.push({
        type: 'sampled',
        name: 'Main Thread',
        unit: 'microseconds',
        startValue: 0,
        endValue: Math.max((endTime - startTime) * 1000, 1000),
        samples: [],
        weights: [],
      });
    }

    // 为每个 Worker 生成 evented profile
    console.log(`[CPUProfileGenerator] ===== 开始处理 ${workerProfiles.size} 个 Worker profiles =====`);
    console.log(`[CPUProfileGenerator] workerProfiles keys:`, Array.from(workerProfiles.keys()));
    console.log(`[CPUProfileGenerator] workerProfiles entries count:`, Array.from(workerProfiles.entries()).length);
    
    if (workerProfiles.size === 0) {
      console.warn(`[CPUProfileGenerator] workerProfiles 为空，无法生成 Worker profiles`);
    }
    
    let processedCount = 0;
    for (const [workerId, profile] of workerProfiles.entries()) {
      processedCount++;
      console.log(`[CPUProfileGenerator] ===== 处理第 ${processedCount}/${workerProfiles.size} 个 Worker: ${workerId} =====`);
      console.log(`[CPUProfileGenerator] 处理 Worker-${workerId}: nodes=${profile.nodes.length}, samples=${profile.samples.length}, timeDeltas=${profile.timeDeltas.length}`);
      
      const threadMap = new Map<number, number>();
      // 从 workerId 中提取数字索引（例如从 "worker-0" 提取 "0"）
      let workerIndex: string;
      if (workerId.startsWith('worker-')) {
        workerIndex = workerId.replace(/^worker-/, '');
      } else {
        workerIndex = workerId;
      }
      const threadName = `web-worker-${workerIndex}`;
      
      // 构建 nodeId -> frameId 映射
      // 注意：frameMap 已经在前面阶段收集了所有 frames，所以这里应该能找到
      for (const node of profile.nodes) {
        const key = `${node.callFrame.functionName}::${node.callFrame.url}::${node.callFrame.lineNumber}::${node.callFrame.columnNumber}`;
        let frameIdx = frameMap.get(key);
        
        // 如果找不到，可能是因为 key 格式不完全匹配
        // 尝试查找包含相同函数名的 frame
        if (frameIdx === undefined) {
          for (const [frameKey, frameId] of frameMap.entries()) {
            // 尝试匹配：如果函数名和 URL 匹配
            if (frameKey.includes(node.callFrame.functionName) && 
                frameKey.includes(node.callFrame.url || '')) {
              frameIdx = frameId;
              break;
            }
          }
        }
        
        // 如果仍然找不到，创建新的 frame
        if (frameIdx === undefined) {
          frameIdx = frames.length;
          frames.push({
            name: node.callFrame.functionName,
            file: node.callFrame.url || '(unknown)',
            line: node.callFrame.lineNumber,
            col: node.callFrame.columnNumber,
          });
          frameMap.set(key, frameIdx);
          console.log(`[CPUProfileGenerator] Worker-${workerId}: 创建新 frame "${node.callFrame.functionName}", frameId: ${frameIdx}`);
        }
        
        threadMap.set(node.id, frameIdx);
      }
      
      console.log(`[CPUProfileGenerator] Worker-${workerId}: threadMap 构建完成，大小: ${threadMap.size}/${profile.nodes.length}`);

      // 转换为 evented 格式（使用实际的 startTime/endTime）
      const events: any[] = [];
      
      console.log(`[CPUProfileGenerator] Worker-${workerId}: 检查 workerGroups, has=${workerGroups?.has(workerId)}, size=${workerGroups?.size || 0}`);
      
      // 如果提供了原始 Worker 数据，使用实际的时间戳生成事件
      if (workerGroups && workerGroups.has(workerId)) {
        const workerData = workerGroups.get(workerId)!;
        console.log(`[CPUProfileGenerator] Worker-${workerId}: 找到原始数据，数量: ${workerData.length}`);
        
        // 构建函数名到 frameId 的映射（使用 nodeId -> frameId 映射）
        const functionNameToFrameId = new Map<string, number>();
        
        // 提取函数名前缀模式（例如 "[Worker-1] "）
        const threadPrefix = `[${threadName}] `;
        
        // 首先尝试使用 threadMap（nodeId -> frameId）
        for (const node of profile.nodes) {
          const nodeId = node.id;
          const frameIdx = threadMap.get(nodeId);
          if (frameIdx !== undefined) {
            // 节点函数名格式是 "[Worker-1] fetchImage"，需要提取原始函数名
            let originalFunctionName = node.callFrame.functionName;
            
            // 如果函数名以线程前缀开头，去掉前缀
            if (originalFunctionName.startsWith(threadPrefix)) {
              originalFunctionName = originalFunctionName.substring(threadPrefix.length);
            }
            
            // 使用原始函数名作为键（可能多个节点有相同的函数名，取第一个）
            if (!functionNameToFrameId.has(originalFunctionName)) {
              functionNameToFrameId.set(originalFunctionName, frameIdx);
            }
          }
        }

        // 如果 threadMap 没有映射，使用 frameMap 直接查找
        if (functionNameToFrameId.size === 0) {
          for (const node of profile.nodes) {
            const key = `${node.callFrame.functionName}::${node.callFrame.url}::${node.callFrame.lineNumber}::${node.callFrame.columnNumber}`;
            const frameIdx = frameMap.get(key);
            if (frameIdx !== undefined) {
              // 提取原始函数名
              let originalFunctionName = node.callFrame.functionName;
              if (originalFunctionName.startsWith(threadPrefix)) {
                originalFunctionName = originalFunctionName.substring(threadPrefix.length);
              }
              
              if (!functionNameToFrameId.has(originalFunctionName)) {
                functionNameToFrameId.set(originalFunctionName, frameIdx);
              }
            }
          }
        }

        // 为每个 Worker 数据项生成 O/C 事件
        const eventList: Array<{ at: number; frame: number; type: 'O' | 'C' }> = [];
        
        console.log(`[CPUProfileGenerator] Worker-${workerId}: functionNameToFrameId 映射大小: ${functionNameToFrameId.size}`);
        console.log(`[CPUProfileGenerator] Worker-${workerId}: 映射内容:`, Array.from(functionNameToFrameId.entries()));
        console.log(`[CPUProfileGenerator] Worker-${workerId}: profile.nodes 函数名:`, profile.nodes.map(n => n.callFrame.functionName));
        console.log(`[CPUProfileGenerator] Worker-${workerId}: workerData 函数名:`, workerData.map(d => d.functionName));
        console.log(`[CPUProfileGenerator] Worker-${workerId}: actualStartTime=${actualStartTime}`);
        
        for (const data of workerData) {
          let frameId = functionNameToFrameId.get(data.functionName);
          console.log(`[CPUProfileGenerator] Worker-${workerId}: 处理 "${data.functionName}", 初始 frameId=${frameId}`);
          
          // 如果找不到，尝试从 threadMap 中查找（通过 samples）
          if (frameId === undefined && profile.samples.length > 0) {
            // 查找第一个匹配的 nodeId
            for (let i = 0; i < profile.samples.length; i++) {
              const nodeId = profile.samples[i];
              const node = profile.nodes.find(n => n.id === nodeId);
              if (node) {
                // 提取原始函数名进行比较
                let nodeFunctionName = node.callFrame.functionName;
                if (nodeFunctionName.startsWith(threadPrefix)) {
                  nodeFunctionName = nodeFunctionName.substring(threadPrefix.length);
                }
                
                if (nodeFunctionName === data.functionName) {
                  frameId = threadMap.get(nodeId);
                  if (frameId !== undefined) {
                    functionNameToFrameId.set(data.functionName, frameId);
                    console.log(`[CPUProfileGenerator] Worker-${workerId}: 通过 samples 找到 "${data.functionName}" -> frameId ${frameId}`);
                    break;
                  }
                }
              }
            }
          }
          
          if (frameId !== undefined) {
            // 转换为相对于 actualStartTime 的微秒数
            const startAt = (data.startTime - actualStartTime) * 1000;
            const endAt = (data.endTime - actualStartTime) * 1000;
            
            console.log(`[CPUProfileGenerator] Worker-${workerId}: "${data.functionName}" 时间计算: startAt=${startAt}, endAt=${endAt}, data.startTime=${data.startTime}, data.endTime=${data.endTime}, actualStartTime=${actualStartTime}`);
            
            // 确保时间有效
            if (startAt >= 0 && endAt >= startAt) {
              eventList.push(
                { at: startAt, frame: frameId, type: 'O' },
                { at: endAt, frame: frameId, type: 'C' }
              );
              console.log(`[CPUProfileGenerator] Worker-${workerId}: "${data.functionName}" 事件已添加 (O: ${startAt}, C: ${endAt})`);
            } else {
              console.warn(`[CPUProfileGenerator] Worker-${workerId}: 时间无效 "${data.functionName}": startAt=${startAt}, endAt=${endAt}, actualStartTime=${actualStartTime}, data.startTime=${data.startTime}, data.endTime=${data.endTime}`);
            }
          } else {
            // 如果找不到 frameId，创建一个新的 frame 并使用它
            console.warn(`[CPUProfileGenerator] Worker-${workerId}: 无法找到函数 "${data.functionName}" 对应的 frameId，创建新 frame`);
            
            // 创建新的 frame
            let newFrameId = frames.length;
            const newFrame = {
              name: data.functionName,
              file: `worker-${workerId}://${data.functionName}`,
              line: 0,
              col: 0,
            };
            frames.push(newFrame);
            
            // 添加到 frameMap
            const newKey = `${data.functionName}::worker-${workerId}://${data.functionName}::0::0`;
            frameMap.set(newKey, newFrameId);
            
            // 更新映射
            functionNameToFrameId.set(data.functionName, newFrameId);
            frameId = newFrameId;
            
            console.log(`[CPUProfileGenerator] Worker-${workerId}: 创建新 frame "${data.functionName}", frameId: ${newFrameId}`);
            
            // 使用新创建的 frameId 生成事件（相对于 actualStartTime）
            const startAt = (data.startTime - actualStartTime) * 1000;
            const endAt = (data.endTime - actualStartTime) * 1000;
            
            console.log(`[CPUProfileGenerator] Worker-${workerId}: "${data.functionName}" (新创建 frame) 时间计算: startAt=${startAt}, endAt=${endAt}`);
            
            if (startAt >= 0 && endAt >= startAt) {
              eventList.push(
                { at: startAt, frame: frameId, type: 'O' },
                { at: endAt, frame: frameId, type: 'C' }
              );
              console.log(`[CPUProfileGenerator] Worker-${workerId}: "${data.functionName}" (新创建 frame) 事件已添加`);
            } else {
              console.warn(`[CPUProfileGenerator] Worker-${workerId}: "${data.functionName}" (新创建 frame) 时间无效: startAt=${startAt}, endAt=${endAt}`);
            }
          }
        }

        // 按时间排序
        eventList.sort((a, b) => a.at - b.at);
        events.push(...eventList);
        
        console.log(`[CPUProfileGenerator] Worker-${workerId}: 使用原始数据生成 ${eventList.length} 个事件 (${events.length} 总计)`);
      } else {
        // 降级：使用 samples 生成事件
        console.log(`[CPUProfileGenerator] Worker-${workerId}: 使用 samples 降级生成事件`);
        const sortedEvents: Array<{ time: number; nodeId: number; type: 'O' | 'C' }> = [];
        
        for (let i = 0; i < profile.samples.length; i++) {
          const nodeId = profile.samples[i];
          const frameId = threadMap.get(nodeId);
          if (frameId !== undefined) {
            const time = profile.timeDeltas[i] || 0;
            sortedEvents.push(
              { time, nodeId, type: 'O' },
              { time: time + 100, nodeId, type: 'C' }
            );
          }
        }

        sortedEvents.sort((a, b) => a.time - b.time);

        for (const event of sortedEvents) {
          const frameId = threadMap.get(event.nodeId);
          if (frameId !== undefined) {
            events.push({
              type: event.type,
              at: event.time,
              frame: frameId,
            });
          }
        }
        
        console.log(`[CPUProfileGenerator] Worker-${workerId}: 使用 samples 生成 ${events.length} 个事件`);
      }

      console.log(`[CPUProfileGenerator] ===== Worker-${workerId}: 最终 events 数量: ${events.length}, profile.nodes: ${profile.nodes.length}, profile.samples: ${profile.samples.length} =====`);

      if (events.length > 0) {
        console.log(`[CPUProfileGenerator] Worker-${workerId}: 添加 profile 到 profiles 数组，当前 profiles 长度: ${profiles.length}`);
        const times = events.map(e => e.at);
        const startValue = Math.min(...times);
        const endValue = Math.max(...times);
        
        // 使用 threadName（已在前面计算好，格式为 web-worker-{index}）
        profiles.push({
          type: 'evented',
          name: threadName,
          unit: 'microseconds',
          startValue: startValue || 0,
          endValue: endValue || 0,
          events,
        });

        nodeToFrameMap.set(`Worker-${workerId}`, threadMap);
        console.log(`[CPUProfileGenerator] Worker-${workerId}: profile 已添加，profiles 长度: ${profiles.length}`);
      } else {
        console.warn(`[CPUProfileGenerator] Worker-${workerId}: events 为空，跳过添加 profile`);
      }
    }
    
    console.log(`[CPUProfileGenerator] ===== Worker profiles 处理完成，总计处理 ${processedCount} 个，profiles 数组长度: ${profiles.length} =====`);

    // 如果主线程 profile 存在但没有生成 sampled profile，创建一个空的 sampled profile
    // 这样至少可以让 speedscope 加载，即使没有实际数据
    if (mainThreadProfile && profiles.length === 0) {
      console.log('[CPUProfileGenerator] 主线程 profile 存在但没有生成 sampled profile，创建空的 sampled profile');
      profiles.push({
        type: 'sampled',
        name: 'Main Thread',
        unit: 'microseconds',
        startValue: 0,
        endValue: 1000, // 默认 1 毫秒
        samples: [],
        weights: [],
      });
    }

    // 如果没有 frames，至少创建一个空的 frames 数组
    // 如果没有 profiles，创建一个空的 profiles 数组
    // 这样至少结构是有效的
    if (frames.length === 0 && profiles.length === 0) {
      console.warn('[CPUProfileGenerator] Speedscope 格式生成警告: frames 和 profiles 都为空');
      console.log('[CPUProfileGenerator] frames:', frames.length);
      console.log('[CPUProfileGenerator] profiles:', profiles.length);
      console.log('[CPUProfileGenerator] mainThreadProfile:', mainThreadProfile ? {
        nodes: mainThreadProfile.nodes.length,
        samples: mainThreadProfile.samples.length,
        timeDeltas: mainThreadProfile.timeDeltas.length
      } : null);
      console.log('[CPUProfileGenerator] workerProfiles:', Array.from(workerProfiles.entries()).map(([id, p]) => ({
        id,
        nodes: p.nodes.length,
        samples: p.samples.length,
        timeDeltas: p.timeDeltas.length
      })));
      console.log('[CPUProfileGenerator] workerGroups:', workerGroups ? Array.from(workerGroups.entries()).map(([id, data]) => ({
        id,
        count: data.length
      })) : null);
      
      // 如果主线程 profile 存在，至少创建一个空的 sampled profile
      if (mainThreadProfile) {
        profiles.push({
          type: 'sampled',
          name: 'Main Thread',
          unit: 'microseconds',
          startValue: 0,
          endValue: Math.max((mainThreadProfile.endTime - mainThreadProfile.startTime) * 1000, 1000),
          samples: [],
          weights: [],
        });
      }
    }

    // 输出最终的 profiles 信息用于调试
    console.log(`[CPUProfileGenerator] ===== 最终生成的 profiles 信息 =====`);
    console.log(`[CPUProfileGenerator] profiles 数量: ${profiles.length}`);
    console.log(`[CPUProfileGenerator] frames 数量: ${frames.length}`);
    profiles.forEach((profile, index) => {
      console.log(`[CPUProfileGenerator] Profile[${index}]: name="${profile.name}", type="${profile.type}", events=${profile.events?.length || 0}, samples=${profile.samples?.length || 0}, weights=${profile.weights?.length || 0}, startValue=${profile.startValue}, endValue=${profile.endValue}`);
    });
    
    console.log(`[CPUProfileGenerator] ===== Speedscope 使用提示 =====`);
    console.log(`[CPUProfileGenerator] 在 Speedscope 中查看所有线程的方法：`);
    console.log(`[CPUProfileGenerator] 1. 使用快捷键：按 'n' (下一个) 或 'p' (上一个) 切换线程`);
    console.log(`[CPUProfileGenerator] 2. 切换到 Timeline 视图：Timeline 模式会并行显示所有 ${profiles.length} 个线程`);
    console.log(`[CPUProfileGenerator] 3. 查看顶部工具栏：查找 profile/thread 切换器`);
    
    // 确保 profiles 和 frames 都是数组
    const validProfiles = Array.isArray(profiles) ? profiles : [];
    const validFrames = Array.isArray(frames) ? frames : [];
    
    // 验证每个 profile 的结构
    for (const profile of validProfiles) {
      if (profile.type === 'sampled') {
        // 确保 samples 和 weights 都是数组
        if (!Array.isArray(profile.samples)) {
          console.error('[CPUProfileGenerator] sampled profile samples 不是数组:', profile);
          profile.samples = [];
        }
        if (!Array.isArray(profile.weights)) {
          console.error('[CPUProfileGenerator] sampled profile weights 不是数组:', profile);
          profile.weights = [];
        }
        // 确保 samples 和 weights 长度一致
        if (profile.samples.length !== profile.weights.length) {
          const minLength = Math.min(profile.samples.length, profile.weights.length);
          console.warn(`[CPUProfileGenerator] samples (${profile.samples.length}) 和 weights (${profile.weights.length}) 长度不一致，截断到 ${minLength}`);
          profile.samples = profile.samples.slice(0, minLength);
          profile.weights = profile.weights.slice(0, minLength);
        }
        // 确保 startValue 和 endValue 是数字
        if (typeof profile.startValue !== 'number') {
          profile.startValue = 0;
        }
        if (typeof profile.endValue !== 'number' || profile.endValue <= profile.startValue) {
          profile.endValue = Math.max(profile.startValue + 1000, 1);
        }
      } else if (profile.type === 'evented') {
        if (!Array.isArray(profile.events)) {
          console.error('[CPUProfileGenerator] evented profile events 不是数组:', profile);
          profile.events = [];
        }
      }
    }
    
    // 注意：不设置 activeProfileIndex，让 Speedscope 自动处理多线程显示
    // 如果有多个 profiles，Speedscope 会在 Timeline 视图中并行显示所有线程
    return {
      $schema: 'https://www.speedscope.app/file-format-schema.json',
      shared: {
        frames: validFrames,
      },
      profiles: validProfiles,
      // activeProfileIndex: 0, // 注释掉，让 Speedscope 自动处理多线程显示
      name: 'Performance Profile',
    };
  }
}
