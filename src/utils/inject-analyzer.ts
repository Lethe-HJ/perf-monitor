/**
 * 动态注入性能分析按钮工具
 * 可以将性能分析按钮动态添加到页面
 */

// 延迟导入组件，只在需要时加载
// 这样可以避免在不需要时加载所有组件
import type { CPUProfile } from '../types/index.js';

// 导入类型（用于类型检查）
import type { PerformanceAnalyzerButton } from '../components/performance-analyzer-button.js';
import type { PerformanceDialog } from '../components/performance-dialog.js';

// 动态导入组件以触发自定义元素注册
async function ensureComponentsLoaded() {
  await Promise.all([
    import('../components/performance-analyzer-button.js'),
    import('../components/performance-dialog.js'),
  ]);
}

let buttonInstance: PerformanceAnalyzerButton | null = null;
let dialogInstance: PerformanceDialog | null = null;

/**
 * 注入性能分析按钮到页面
 * @param onAnalyze 点击按钮时的回调函数，返回 Profile 数据或 Promise<Profile>
 */
export async function injectPerformanceAnalyzer(
  onAnalyze: () => CPUProfile | null | Promise<CPUProfile | null>
): Promise<void> {
  // 确保组件已加载
  await ensureComponentsLoaded();
  
  // 如果已经注入过，先移除
  removePerformanceAnalyzer();

  // 创建按钮
  buttonInstance = document.createElement('performance-analyzer-button') as PerformanceAnalyzerButton;
  document.body.appendChild(buttonInstance);

  // 创建对话框
  dialogInstance = document.createElement('performance-dialog') as PerformanceDialog;
  document.body.appendChild(dialogInstance);

  // 绑定按钮点击事件
  buttonInstance.addEventListener('analyze-click', async () => {
    if (dialogInstance) {
      dialogInstance.open = true;
      dialogInstance.profile = null; // 先清空

      try {
        // 调用回调函数获取 Profile
        const profile = await Promise.resolve(onAnalyze());
        if (dialogInstance) {
          dialogInstance.profile = profile;
        }
      } catch (error) {
        console.error('Failed to analyze performance:', error);
        if (dialogInstance) {
          dialogInstance.profile = null;
        }
      }
    }
  });

  // 绑定对话框关闭事件
  dialogInstance.addEventListener('close', () => {
    if (dialogInstance) {
      dialogInstance.open = false;
    }
  });
}

/**
 * 移除性能分析按钮
 */
export function removePerformanceAnalyzer(): void {
  if (buttonInstance && buttonInstance.parentNode) {
    buttonInstance.parentNode.removeChild(buttonInstance);
    buttonInstance = null;
  }

  if (dialogInstance && dialogInstance.parentNode) {
    dialogInstance.parentNode.removeChild(dialogInstance);
    dialogInstance = null;
  }
}

/**
 * 更新对话框中的 Profile 数据
 */
export function updateProfile(profile: CPUProfile | null): void {
  if (dialogInstance) {
    dialogInstance.profile = profile;
    if (profile) {
      dialogInstance.open = true;
    }
  }
}
