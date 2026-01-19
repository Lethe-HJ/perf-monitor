# 使用场景说明

## JS Self-Profiling API 可用性

### 哪些情况下可以使用

JS Self-Profiling API 需要满足以下条件才能使用：

#### 1. ✅ Electron 渲染进程（推荐）

在 Electron 应用中，如果满足以下条件，可以使用：

**必须条件：**
- Electron 使用的 Chromium 版本支持该 API（通常 Electron 15+）
- 页面必须设置 Document Policy 允许 `js-profiling`

**配置方式：**

**方式 A：在 HTML 中添加 meta 标签**
```html
<meta http-equiv="Document-Policy" content="js-profiling=*" />
```

**方式 B：在主进程中设置响应头**
```javascript
// main.js
const { session } = require('electron');

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Document-Policy': ['js-profiling']
      }
    });
  });
});
```

**方式 C：使用自定义协议**
```javascript
// main.js
const { protocol } = require('electron');

protocol.registerHttpProtocol('app', (request, callback) => {
  // 设置 Document-Policy 头部
  // ...
});
```

#### 2. ✅ Localhost/本地开发服务器

通过 HTTP/HTTPS 协议在本地开发时可以使用：

- 使用 `http://localhost` 或 `http://127.0.0.1`
- 在 HTML 中添加 `<meta http-equiv="Document-Policy" content="js-profiling" />`
- 或在服务器响应中设置 `Document-Policy: js-profiling` HTTP 头部（不需要 `=*`）

#### 3. ✅ Chrome 扩展

在 Chrome 扩展的 content script 或 background script 中可以使用：

- 需要在 manifest.json 中声明权限
- 需要设置适当的 Document Policy

#### 4. ⚠️ 受限场景

以下情况下可能无法使用或需要特殊配置：

**file:// 协议：**
- 纯 `file://` 协议加载的 HTML 文件通常无法设置 Document Policy
- 解决方案：使用本地开发服务器（如 Vite dev server）

**生产环境网页：**
- 大多数生产环境的网页由于安全策略无法使用
- 服务器需要设置 `Document-Policy: js-profiling` HTTP 响应头
- 或者页面中包含 meta 标签（但可能被 CSP 限制）

**跨域场景：**
- 跨域加载的资源可能受限制
- 需要确保正确的 CORS 和 Document Policy 配置

### 哪些情况下无法使用

#### ❌ 普通生产环境网页
- 大多数网站由于安全策略不允许
- 除非服务器明确设置 Document Policy 头部

#### ❌ file:// 协议
- 本地文件直接打开时通常无法设置 Document Policy

#### ❌ 其他浏览器
- Firefox：不支持
- Safari：不支持
- 仅支持 Chrome/Edge 和基于 Chromium 的应用（如 Electron）

### 浏览器支持情况

| 环境 | 支持情况 | 说明 |
|------|---------|------|
| Chrome | ✅ 支持 | 需要 Document Policy |
| Edge | ✅ 支持 | 需要 Document Policy |
| Electron | ✅ 支持 | 需要正确配置 Document Policy |
| Firefox | ❌ 不支持 | 尚未实现 |
| Safari | ❌ 不支持 | 尚未实现 |

## 降级方案

即使 JS Self-Profiling API 不可用，本性能监控库仍然可以工作：

### Worker 性能监控（始终可用）

- 手动插桩方式收集 Worker 内的性能数据
- 不依赖 Self-Profiling API
- 可以生成完整的性能报告

### 其他监控指标（始终可用）

- 内存监控：`performance.memory`（Chrome）
- 网络监控：`PerformanceObserver`
- GC 监控：通过内存变化推断
- GPU 监控：`requestAnimationFrame` 和 Paint 事件

### 自动降级

代码会自动检测 Profiler 是否可用：

```typescript
// 如果 Profiler 不可用，会自动使用 Worker 数据
const profile = await performanceMonitor.generateProfile();
// 即使 Profiler 失败，profile 仍然包含 Worker 性能数据
```

## 推荐使用场景

### 1. Electron 应用开发 ⭐ 推荐

**为什么适合：**
- 完全控制渲染进程环境
- 可以设置 Document Policy
- 不受浏览器安全策略限制

**使用方式：**
```html
<!-- 在 index.html 中 -->
<meta http-equiv="Document-Policy" content="js-profiling=*" />
```

### 2. 本地开发调试

**使用本地开发服务器：**
```bash
cd demos/demo1
yarn dev
# 访问 http://localhost:5173
```

在 HTML 中添加 Document Policy meta 标签即可。

### 3. 内部工具/管理系统

**如果服务器可控：**
- 设置 `Document-Policy: js-profiling` HTTP 响应头
- 或在 HTML 中添加 meta 标签

## 实际使用建议

### 检查是否可用

```typescript
import { MainThreadProfiler } from '@/index';

const profiler = new MainThreadProfiler();

// 检查支持情况
if (profiler.isSupported() && profiler.isAllowed()) {
  console.log('✅ Profiler 可用');
} else {
  console.log('⚠️ Profiler 不可用，将使用降级方案');
}
```

### 错误处理

代码已经内置了优雅降级：

```typescript
// 即使 Profiler 失败，也不会中断执行
await performanceMonitor.start(); // 不会抛出异常

// 生成报告时会自动选择可用的数据源
const profile = await performanceMonitor.generateProfile();
// profile 可能包含 Profiler 数据，也可能只包含 Worker 数据
```

## 总结

**最佳使用场景：**
1. ✅ **Electron 应用** - 完全可控，推荐使用
2. ✅ **本地开发环境** - 通过 Vite/Webpack dev server
3. ✅ **内部工具** - 服务器可控的环境

**降级方案：**
- 即使 Profiler 不可用，Worker 监控和其他指标仍然可用
- 可以生成完整的性能报告（基于 Worker 数据）

**建议：**
- 在生产环境使用 Electron 或可控服务器时启用 Profiler
- 在其他场景下，依赖 Worker 监控和其他指标已经足够强大
