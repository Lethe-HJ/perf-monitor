/**
 * 自动打开 Profile 文件的工具
 * 在开发环境下，通过 Vite 服务器打开 speedscope
 */

/**
 * 发送 Profile 到开发服务器并自动打开
 * @param profile Profile 数据
 * @param filename 文件名
 */
export async function autoOpenProfile(
  profile: any,
  filename: string = `profile-${Date.now()}.cpuprofile`
): Promise<boolean> {
  try {
    // 检查是否在开发环境
    const isDev = import.meta.env.DEV;
    if (!isDev) {
      console.log('[Auto Open] 非开发环境，跳过自动打开');
      return false;
    }

    // 尝试发送到 Vite 开发服务器
    const response = await fetch('/__perf_monitor__/save-and-open', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile,
        filename,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log('[Auto Open]', result.message);
      return true;
    } else {
      const error = await response.text();
      console.warn('[Auto Open] 服务器响应错误:', error);
      return false;
    }
  } catch (error) {
    // 如果服务器不支持，降级到普通下载
    console.warn('[Auto Open] 无法连接到开发服务器，使用普通下载:', error);
    return false;
  }
}

/**
 * 下载 Profile 文件（降级方案）
 */
export function downloadProfile(
  profile: any,
  filename?: string
): void {
  const json = JSON.stringify(profile, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `profile-${Date.now()}.cpuprofile`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log(`[Performance Monitor] Profile 已下载: ${a.download}`);
  console.log(`[Performance Monitor] 使用以下命令打开: speedscope ${a.download}`);
}
