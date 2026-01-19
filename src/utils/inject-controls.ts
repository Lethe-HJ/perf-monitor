/**
 * 动态注入性能分析控制按钮工具
 * 可以将性能分析控制按钮动态添加到页面
 */

// 延迟导入组件，只在需要时加载
import type { CPUProfile } from '../types/index.js';

// 导入类型（用于类型检查）
import type { PerformanceControls } from '../components/performance-controls.js';

// 导入自动打开功能
import { autoOpenProfile, downloadProfile } from './auto-open-profile.js';

// 动态导入组件以触发自定义元素注册
async function ensureComponentsLoaded() {
  await import('../components/performance-controls.js');
}

let controlsInstance: HTMLElement & { isRecording: boolean } | null = null;

export interface PerformanceControlsCallbacks {
  onStart: () => void | Promise<void>;
  onStop: () => CPUProfile | any | null | Promise<CPUProfile | any | null>;
  onRefresh: () => void;
  onGenerateIndividualProfiles?: () => Array<{ threadId: string; profile: any }> | null | Promise<Array<{ threadId: string; profile: any }> | null>;
}

// downloadProfile 已从 auto-open-profile.js 导入

/**
 * 注入性能分析控制按钮到页面
 * @param callbacks 回调函数对象
 */
export async function injectPerformanceControls(callbacks: PerformanceControlsCallbacks): Promise<void> {
  // 确保组件已加载
  await ensureComponentsLoaded();
  
  // 如果已经注入过，先移除
  removePerformanceControls();

  // 创建控制按钮
  // 注意：组件必须已经被导入以触发自定义元素注册
  controlsInstance = document.createElement('performance-controls') as HTMLElement & { isRecording: boolean };
  document.body.appendChild(controlsInstance);

  let isRecording = false;

  // 绑定开始记录事件
  controlsInstance.addEventListener('start-record', async () => {
    if (isRecording) return;
    
    try {
      isRecording = true;
      controlsInstance!.isRecording = true;
      await Promise.resolve(callbacks.onStart());
      console.log('[Performance Monitor] 开始记录性能数据');
    } catch (error) {
      console.error('[Performance Monitor] 开始记录失败:', error);
      isRecording = false;
      controlsInstance!.isRecording = false;
    }
  });

  // 绑定停止记录事件
  controlsInstance.addEventListener('stop-record', async () => {
    if (!isRecording) return;
    
    try {
      isRecording = false;
      controlsInstance!.isRecording = false;
      console.log('[Performance Monitor] 停止记录，生成 Profile...');
      
      // 优先尝试生成多个独立的 profile 文件并打开集成页面（开发环境）
      const isDev = import.meta.env.DEV;
      let openedViewer = false;
      
      if (isDev) {
        try {
          if (callbacks.onGenerateIndividualProfiles) {
            const individualProfiles = await Promise.resolve(callbacks.onGenerateIndividualProfiles());
            if (individualProfiles && individualProfiles.length > 0) {
              await openProfileViewer(individualProfiles);
              openedViewer = true;
              console.log('[Performance Monitor] 已打开集成页面');
            }
          }
        } catch (error) {
          console.warn('[Performance Monitor] 打开集成页面失败:', error);
        }
      }

      // 如果没有成功打开集成页面，则使用旧方案（命令行打开或下载）
      if (!openedViewer) {
        const profile = await Promise.resolve(callbacks.onStop());
        
        if (profile) {
          // 检测是否为 Speedscope 格式（有 $schema 字段）
          const isSpeedscopeFormat = profile && typeof profile === 'object' && '$schema' in profile;
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = isSpeedscopeFormat 
            ? `profile-${timestamp}.speedscope.json`
            : `profile-${timestamp}.cpuprofile`;
          
          // 尝试自动打开（仅在开发环境）
          const autoOpened = await autoOpenProfile(profile, filename);
          
          if (!autoOpened) {
            // 如果自动打开失败，降级到普通下载
            downloadProfile(profile, filename);
            console.log('[Performance Monitor] Profile 已下载');
            if (isSpeedscopeFormat) {
              console.log('[Performance Monitor] 格式: Speedscope（支持多线程并行显示）');
              console.log('[Performance Monitor] 提示: 使用 speedscope 命令打开下载的文件');
              console.log('[Performance Monitor] 例如: npx speedscope profile-*.speedscope.json');
            } else {
              console.log('[Performance Monitor] 格式: CPUProfile');
              console.log('[Performance Monitor] 提示: 使用 speedscope 命令打开下载的文件');
              console.log('[Performance Monitor] 例如: npx speedscope profile-*.cpuprofile');
            }
          }
        } else {
          console.warn('[Performance Monitor] Profile 为空，未生成文件');
        }
      }
      // 注意：如果 openedViewer 为 true，说明已经通过 generateIndividualSpeedscopeProfiles
      // 调用了 profiler.stop()，所以不需要再次调用 onStop()
    } catch (error) {
      console.error('[Performance Monitor] 停止记录失败:', error);
    }
  });

  // 绑定刷新事件
  controlsInstance.addEventListener('refresh', () => {
    if (isRecording) {
      console.warn('[Performance Monitor] 正在记录中，请先停止记录');
      return;
    }
    
    try {
      callbacks.onRefresh();
      console.log('[Performance Monitor] 已重置');
    } catch (error) {
      console.error('[Performance Monitor] 刷新失败:', error);
    }
  });
}

/**
 * 打开性能分析集成页面
 * @param profiles 各个线程的 profile 数据
 */
async function openProfileViewer(profiles: Array<{ threadId: string; profile: any }>): Promise<void> {
  try {
    const isDev = import.meta.env.DEV;
    if (!isDev) {
      console.log('[Profile Viewer] 非开发环境，跳过集成页面');
      return;
    }

    // 保存多个 profile 文件到服务器
    const sessionId = `session-${Date.now()}`;
    const response = await fetch('/__perf_monitor__/save-profiles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profiles,
        sessionId,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log('[Profile Viewer] Profiles 已保存:', result);

      // 构建集成页面 URL，包含 profile 列表
      const profilesParam = encodeURIComponent(JSON.stringify(result.profiles));
      const profileViewerUrl = `/profile-viewer.html?sessionId=${sessionId}&profiles=${profilesParam}`;
      
      // 在新标签页中打开
      window.open(profileViewerUrl, '_blank');
      console.log('[Profile Viewer] 已打开集成页面:', profileViewerUrl);
    } else {
      const error = await response.text();
      console.warn('[Profile Viewer] 保存 profiles 失败:', error);
    }
  } catch (error) {
    console.warn('[Profile Viewer] 打开集成页面失败:', error);
  }
}

/**
 * 移除性能分析控制按钮
 */
export function removePerformanceControls(): void {
  if (controlsInstance && controlsInstance.parentNode) {
    controlsInstance.parentNode.removeChild(controlsInstance);
    controlsInstance = null;
  }
}

/**
 * 更新记录状态
 */
export function updateRecordingState(isRecording: boolean): void {
  if (controlsInstance) {
    controlsInstance.isRecording = isRecording;
  }
}
