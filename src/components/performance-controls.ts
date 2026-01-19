/**
 * 性能分析控制按钮组件（使用 Lit）
 * 包含三个按钮：开始记录、停止记录、刷新
 */

import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('performance-controls')
export class PerformanceControls extends LitElement {
  static properties = {
    isRecording: { type: Boolean, attribute: false },
  };

  // 类型声明（不创建实际字段，只是告诉 TypeScript 这个属性存在）
  declare isRecording: boolean;

  static styles = css`
    :host {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .control-button {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.6);
      color: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      transition: all 0.3s ease;
      backdrop-filter: blur(10px);
    }

    .control-button:hover {
      background: rgba(0, 0, 0, 0.8);
      transform: scale(1.1);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
    }

    .control-button:active {
      transform: scale(0.95);
    }

    .control-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .control-button.recording {
      background: rgba(220, 53, 69, 0.8);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.7;
      }
    }

    .button-icon {
      width: 24px;
      height: 24px;
      display: block;
    }
  `;

  private handleStart() {
    this.dispatchEvent(
      new CustomEvent('start-record', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleStop() {
    this.dispatchEvent(
      new CustomEvent('stop-record', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleRefresh() {
    this.dispatchEvent(
      new CustomEvent('refresh', {
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    return html`
      <!-- 刷新按钮 -->
      <button
        class="control-button"
        @click="${this.handleRefresh}"
        title="刷新"
        ?disabled="${this.isRecording}"
      >
        <svg
          class="button-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
      </button>

      <!-- 开始记录按钮 -->
      <button
        class="control-button ${this.isRecording ? 'recording' : ''}"
        @click="${this.handleStart}"
        title="开始记录"
        ?disabled="${this.isRecording}"
      >
        <svg
          class="button-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <polygon points="10 8 16 12 10 16 10 8"></polygon>
        </svg>
      </button>

      <!-- 停止记录按钮 -->
      <button
        class="control-button"
        @click="${this.handleStop}"
        title="停止记录并下载 Profile"
        ?disabled="${!this.isRecording}"
      >
        <svg
          class="button-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="6" y="6" width="12" height="12" rx="2"></rect>
        </svg>
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'performance-controls': PerformanceControls;
  }
}
