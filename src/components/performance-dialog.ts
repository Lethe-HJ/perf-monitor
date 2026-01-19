/**
 * 性能分析对话框组件（使用 Lit）
 * 包含 Speedscope 火焰图可视化
 */

import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { CPUProfile } from '../types/index.js';

@customElement('performance-dialog')
export class PerformanceDialog extends LitElement {
  static properties = {
    profile: { type: Object, attribute: false },
    open: { type: Boolean, attribute: false },
  };

  declare profile: CPUProfile | null;
  declare open: boolean;
  static styles = css`
    :host {
      display: block;
    }

    .dialog-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
    }

    .dialog-container {
      background: white;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      width: 90vw;
      max-width: 1200px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .dialog-header {
      padding: 20px;
      border-bottom: 1px solid #ddd;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }

    .dialog-title {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #333;
    }

    .close-button {
      width: 32px;
      height: 32px;
      border: none;
      background: #f5f5f5;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      color: #666;
      transition: all 0.2s;
    }

    .close-button:hover {
      background: #e0e0e0;
      color: #333;
    }

    .dialog-content {
      flex: 1;
      overflow: auto;
      padding: 20px;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      color: #666;
    }

    .error {
      padding: 20px;
      color: #d32f2f;
      background: #ffebee;
      border-radius: 4px;
      margin: 10px;
    }

    .profile-stats {
      margin-bottom: 20px;
      padding: 15px;
      background: #f5f5f5;
      border-radius: 4px;
    }

    .profile-stats p {
      margin: 5px 0;
      font-size: 14px;
      color: #666;
    }

    .profile-stats strong {
      color: #333;
      margin-right: 8px;
    }

    .flamegraph-container {
      width: 100%;
      height: 600px;
      border: 1px solid #ddd;
      border-radius: 4px;
      overflow: hidden;
      background: #fff;
    }

    .actions {
      padding: 15px 20px;
      border-top: 1px solid #ddd;
      display: flex;
      gap: 10px;
      flex-shrink: 0;
    }

    .btn {
      padding: 8px 16px;
      border: 1px solid #ccc;
      background: #fff;
      cursor: pointer;
      font-size: 14px;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .btn:hover {
      background: #f5f5f5;
    }

    .btn-download {
      background: #28a745;
      color: white;
      border-color: #28a745;
    }

    .btn-download:hover {
      background: #218838;
    }
  `;

  @state()
  private isLoading = false;

  @state()
  private error: string | null = null;

  private flamegraphContainer: HTMLDivElement | null = null;

  updated(changedProperties: Map<string | number | symbol, unknown>) {
    if (changedProperties.has('profile') && this.profile && this.open) {
      this.renderFlamegraph();
    }
  }

  firstUpdated() {
    this.flamegraphContainer = this.shadowRoot?.querySelector(
      '#flamegraph-container'
    ) as HTMLDivElement;
  }

  private close() {
    this.open = false;
    this.dispatchEvent(
      new CustomEvent('close', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private async renderFlamegraph() {
    if (!this.profile || !this.flamegraphContainer || !this.open) {
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      // 清空容器
      this.flamegraphContainer.innerHTML = '';

      // 尝试使用 Speedscope（通过 Blob URL 加载）
      await this.renderWithSpeedscope();
      
      this.isLoading = false;
    } catch (error) {
      console.warn('Speedscope render failed, falling back to simple view:', error);
      // 如果 Speedscope 失败，使用简单的可视化
      this.renderSimpleFlamegraph();
      this.isLoading = false;
    }
  }

  private async renderWithSpeedscope() {
    if (!this.profile || !this.flamegraphContainer) return;

    // 将 CPUProfile 转换为标准的 .cpuprofile 格式（Speedscope 支持）
    const cpuprofile = {
      nodes: this.profile.nodes,
      samples: this.profile.samples,
      timeDeltas: this.profile.timeDeltas,
      startTime: this.profile.startTime,
      endTime: this.profile.endTime,
    };

    // 创建 Blob URL
    const jsonString = JSON.stringify(cpuprofile, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const profileUrl = URL.createObjectURL(blob);

    // 使用 speedscope.app 在线版本加载 profile
    // Speedscope 支持通过 URL hash 参数加载文件
    const speedscopeUrl = `https://www.speedscope.app/#profileURL=${encodeURIComponent(profileUrl)}`;

    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    
    // 先添加到容器，再设置 src（这样可以立即看到加载状态）
    this.flamegraphContainer.appendChild(iframe);

    // 等待 iframe 加载
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        URL.revokeObjectURL(profileUrl);
        reject(new Error('iframe load timeout'));
      }, 10000);

      iframe.onload = () => {
        clearTimeout(timeout);
        resolve();
        // 延迟清理 Blob URL（等待 iframe 加载完成）
        setTimeout(() => {
          URL.revokeObjectURL(profileUrl);
        }, 5000);
      };

      iframe.onerror = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(profileUrl);
        reject(new Error('Failed to load speedscope iframe'));
      };

      // 设置 src 触发加载
      iframe.src = speedscopeUrl;
    });
  }

  /**
   * 渲染简单的火焰图（使用 Canvas）- 降级方案
   */
  private renderSimpleFlamegraph() {
    if (!this.flamegraphContainer || !this.profile) return;

    // 创建 Canvas 来绘制简单的火焰图
    const canvas = document.createElement('canvas');
    canvas.width = this.flamegraphContainer.clientWidth || 800;
    canvas.height = 600;
    canvas.style.width = '100%';
    canvas.style.height = '600px';
    canvas.style.background = '#fff';
    this.flamegraphContainer.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 简单的文本说明
    ctx.fillStyle = '#333';
    ctx.font = '16px monospace';
    ctx.fillText('性能分析数据', 20, 30);
    
    ctx.font = '14px monospace';
    ctx.fillText(`节点数: ${this.profile.nodes?.length || 0}`, 20, 60);
    ctx.fillText(`采样数: ${this.profile.samples?.length || 0}`, 20, 85);
    ctx.fillText(
      `持续时间: ${this.profile.startTime && this.profile.endTime ? ((this.profile.endTime - this.profile.startTime) / 1000).toFixed(2) + 's' : 'N/A'}`,
      20,
      110
    );
    
    ctx.fillStyle = '#666';
    ctx.font = '12px monospace';
    ctx.fillText('提示：请下载 Profile 文件并使用 Speedscope 或 Chrome DevTools 查看详细火焰图', 20, 150);
  }

  private downloadProfile() {
    if (!this.profile) {
      return;
    }

    const json = JSON.stringify(this.profile, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-profile-${Date.now()}.cpuprofile`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  render() {
    if (!this.open) {
      return html``;
    }

    return html`
      <div class="dialog-overlay" @click="${this.close}">
        <div class="dialog-container" @click="${(e: Event) => e.stopPropagation()}">
          <div class="dialog-header">
            <h3 class="dialog-title">性能分析报告</h3>
            <button class="close-button" @click="${this.close}">×</button>
          </div>

          <div class="dialog-content">
            ${!this.profile
              ? html`<div class="error">⚠️ 未能生成 Profile 数据</div>`
              : html`
                  <div class="profile-stats">
                    <p><strong>节点数:</strong> ${this.profile.nodes?.length || 0}</p>
                    <p><strong>采样数:</strong> ${this.profile.samples?.length || 0}</p>
                    <p>
                      <strong>持续时间:</strong>
                      ${this.profile.startTime && this.profile.endTime
                        ? `${((this.profile.endTime - this.profile.startTime) / 1000).toFixed(2)}s`
                        : 'N/A'}
                    </p>
                  </div>

                  ${this.isLoading
                    ? html`<div class="loading">正在加载火焰图...</div>`
                    : this.error
                    ? html`<div class="error">错误: ${this.error}</div>`
                    : html`<div id="flamegraph-container" class="flamegraph-container"></div>`}
                `}
          </div>

          ${this.profile
            ? html`
                <div class="actions">
                  <button class="btn btn-download" @click="${this.downloadProfile}">
                    下载 Profile 文件
                  </button>
                </div>
              `
            : ''}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'performance-dialog': PerformanceDialog;
  }
}
