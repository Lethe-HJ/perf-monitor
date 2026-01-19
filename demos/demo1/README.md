# 性能监控 Demo

这是一个展示性能监控功能的示例应用。

## 功能

1. **9 个 Worker 并发加载大图片**：点击"开始加载图片"按钮后，会创建 9 个 Worker 线程并发下载至少 20MB 的大图片
2. **九宫格布局**：图片以 3x3 网格展示
3. **先完成先渲染**：图片下载完成后立即渲染到对应的位置
4. **性能分析**：通过右下角的浮动控制按钮，可以开始/停止记录性能数据，并下载 Profile 文件用于 Speedscope 分析

## 使用方法

1. 安装依赖（在项目根目录）：
```bash
yarn install
```

2. 启动开发服务器（在 demo1 目录）：
```bash
cd demos/demo1

# 普通模式（不启用 JS Self-Profiling API）
yarn dev

# 启用性能监控模式（启用 JS Self-Profiling API）
yarn dev:monitor
```

或者通过环境变量控制：
```bash
# 启用监控
VITE_MONITOR=true yarn dev

# 禁用监控（默认）
VITE_MONITOR=false yarn dev
```

3. 在浏览器中打开应用

4. **使用性能分析控制按钮**（右下角浮动按钮）：
   - **开始记录**：点击开始记录按钮（播放图标）开始监控性能数据
   - **停止记录**：点击停止记录按钮（方块图标）停止监控并自动下载 Profile 文件（`.cpuprofile` 格式）
   - **刷新**：点击刷新按钮重置状态

5. **查看性能报告**：
   - **开发环境自动打开**：在开发环境下，停止记录后会自动将 Profile 文件发送到 Vite 服务器，并尝试使用 `speedscope` 打开
   - **手动打开**：如果自动打开失败，可以使用以下命令：
     ```bash
     # 使用全局安装的 speedscope
     speedscope profile-*.cpuprofile
     
     # 或使用 npx（推荐）
     npx speedscope profile-*.cpuprofile
     ```
   - **文件位置**：Profile 文件保存在系统临时目录 `{tmpdir}/perf-monitor-profiles/`，控制台会显示完整路径

### 编译选项说明

- **`__MONITOR__`**：在代码中可以通过 `__MONITOR__` 变量判断是否启用了监控
- **`VITE_MONITOR`**：环境变量，设置为 `true` 时会在 HTML 中自动添加 Document Policy meta 标签
- 启用监控后，会启用 JS Self-Profiling API（主线程函数调用栈采样）
- 即使不启用，Worker 监控和其他性能指标仍然可用

## 技术实现

- **主线程监控**：使用 JS Self-Profiling API 采集函数调用栈
- **Worker 监控**：手动插桩方式收集 Worker 内的性能数据
- **内存监控**：定期采样 `performance.memory`
- **GC 监控**：通过监控内存突然下降推断 GC 事件
- **网络监控**：使用 PerformanceObserver 监听资源加载
- **GPU 监控**：监控 `requestAnimationFrame` 和 Paint 事件
- **函数标记**：在关键函数处添加标记，在性能分析中高亮显示

## 性能数据格式

生成的性能数据使用标准的 Chrome DevTools `.cpuprofile` 格式，可以：
- 在控制台查看
- 导入 Chrome DevTools
- 使用 Speedscope 等工具可视化

## 使用场景和限制

### JS Self-Profiling API 可用性

**✅ 可以使用的情况：**
1. **Electron 应用**：推荐！在渲染进程中设置 Document Policy 即可使用
2. **本地开发服务器**：通过 `localhost` 访问时可以使用
3. **Chrome 扩展**：在扩展环境中可以使用

**❌ 无法使用的情况：**
1. **普通生产环境网页**：由于安全策略限制，大多数网站无法使用
2. **file:// 协议**：本地文件直接打开时无法使用
3. **其他浏览器**：Firefox、Safari 不支持

### 降级方案

即使 JS Self-Profiling API 不可用，本监控库仍然可以工作：
- ✅ **Worker 性能监控**：始终可用，手动插桩收集数据
- ✅ **内存监控**：`performance.memory`（Chrome）
- ✅ **网络监控**：`PerformanceObserver`
- ✅ **GC 监控**：通过内存变化推断
- ✅ **GPU 监控**：`requestAnimationFrame` 和 Paint 事件

代码会自动检测并降级，不会中断执行。

### 启用 Profiler（可选）

如果想启用 JS Self-Profiling API，在 `index.html` 中取消注释：

```html
<meta http-equiv="Document-Policy" content="js-profiling=*" />
```

## 注意事项

1. **浏览器兼容性**：JS Self-Profiling API 目前仅 Chrome/Edge/Electron 支持
2. **内存要求**：加载 9 个 20MB+ 图片需要足够的内存
3. **网络要求**：使用在线图片时确保网络连接稳定，或使用本地文件
4. **性能开销**：Profiling 本身会有性能开销，建议仅在开发和测试时使用
5. **Document Policy**：使用 Profiler 需要设置 Document Policy（详见上方说明）

**详细使用场景说明请查看：**[使用场景文档](../../docs/USAGE_SCENARIOS.md)