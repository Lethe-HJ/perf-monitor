# performance Monitor

## 描述

一个监控多场景下js应用性能的可视化工具。

## 功能

1. 监控 CPU 和内存使用情况
2. 监控代码执行时间
3. 可视化显示监控数据

## 架构设计

### 核心模块

1. 性能监控模块
2. 数据可视化模块
3. 数据存储模块
4. 数据分析模块
5. 数据报告模块


监控支持环境如下
a. web主线程
b. web worker线程
c. electron 主进程
d. electron 渲染进程
e. nodejs 线程
f. iframe 线程
g. 网络请求线程
h. webgl