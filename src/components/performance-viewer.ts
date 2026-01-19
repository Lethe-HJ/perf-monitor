/**
 * 性能可视化组件（使用 Lit）
 * 集成 Speedscope 展示火焰图
 */

import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { CPUProfile } from '../types/index.js';

@customElement('performance-viewer')
export class PerformanceViewer extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .viewer-container {
      width: 100%;
      height: 600px;
      border: 1px solid #ddd;
      border-radius: 4px;
      overflow: hidden;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #666;
    }

    .error {
      padding: 20px;
      color: #d32f2f;
      background-color: #ffebee;
      border-radius: 4px;
      margin: 10px;
    }
  `;

  @property({ type: Object })
  profile: CPUProfile | null = null;

  @state()
  private isLoading = false;

  @state()
  private error: string | null = null;

  private speedscopeContainer: HTMLDivElement | null = null;

  updated(changedProperties: Map<string | number | symbol, unknown>) {
    if (changedProperties.has('profile') && this.profile) {
      this.renderProfile();
    }
  }

  firstUpdated() {
    this.speedscopeContainer = this.shadowRoot?.querySelector(
      '#speedscope-container'
    ) as HTMLDivElement;
  }

  private async renderProfile() {
    if (!this.profile || !this.speedscopeContainer) {
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      // 注意：Speedscope 是 Node.js 工具，需要在命令行中使用
      // 请使用下载的 Profile 文件，然后运行: npx speedscope profile-*.cpuprofile
      // 这里显示提示信息
      this.speedscopeContainer.innerHTML = `
        <div style="padding: 40px 20px; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <h3 style="margin: 0 0 16px 0; color: #333;">性能数据已准备</h3>
          <p style="margin: 8px 0; color: #666;">Speedscope 是命令行工具，无法在浏览器中直接使用。</p>
          <p style="margin: 8px 0; color: #666;">请使用下载的 Profile 文件，然后在命令行中运行：</p>
          <code style="background: #f5f5f5; padding: 12px 16px; border-radius: 4px; display: inline-block; margin-top: 16px; font-size: 14px; color: #333;">
            npx speedscope profile-*.cpuprofile
          </code>
        </div>
      `;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Failed to render profile';
      console.error('Failed to render profile:', error);
    } finally {
      this.isLoading = false;
    }
  }

  render() {
    if (!this.profile) {
      return html`<div class="loading">No profile data available</div>`;
    }

    if (this.error) {
      return html`<div class="error">Error: ${this.error}</div>`;
    }

    return html`
      <div class="viewer-container">
        ${this.isLoading
          ? html`<div class="loading">Loading profile...</div>`
          : html`<div id="speedscope-container"></div>`}
      </div>
    `;
  }
}

// 声明全局类型（用于 TypeScript）
declare global {
  interface HTMLElementTagNameMap {
    'performance-viewer': PerformanceViewer;
  }
}
