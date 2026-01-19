/**
 * 性能分析浮动按钮组件（使用 Lit）
 * 可以动态添加到页面上的半透明浮动按钮
 */

import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('performance-analyzer-button')
export class PerformanceAnalyzerButton extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
    }

    .floating-button {
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
      font-size: 24px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      transition: all 0.3s ease;
      backdrop-filter: blur(10px);
    }

    .floating-button:hover {
      background: rgba(0, 0, 0, 0.8);
      transform: scale(1.1);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
    }

    .floating-button:active {
      transform: scale(0.95);
    }

    .button-icon {
      width: 28px;
      height: 28px;
      display: block;
    }
  `;

  @property({ type: Function })
  onClick?: () => void;

  private handleClick() {
    if (this.onClick) {
      this.onClick();
    } else {
      // 如果没有传入 onClick，触发自定义事件
      this.dispatchEvent(
        new CustomEvent('analyze-click', {
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  render() {
    return html`
      <button class="floating-button" @click="${this.handleClick}" title="性能分析">
        <svg
          class="button-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="12" y1="2" x2="12" y2="22"></line>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'performance-analyzer-button': PerformanceAnalyzerButton;
  }
}
