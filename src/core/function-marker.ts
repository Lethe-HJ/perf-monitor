/**
 * 函数标记功能
 * 允许开发者标记特殊函数，在性能分析中高亮显示
 */

import type { FunctionMarker } from '../types/index.js';

const markedFunctions = new Map<string, FunctionMarker>();

/**
 * 标记一个函数
 * @param name 函数名称
 * @param options 标记选项
 */
export function markFunction(
  name: string,
  options: Omit<FunctionMarker, 'functionName'>
): void {
  markedFunctions.set(name, {
    functionName: name,
    category: options.category || 'custom',
    description: options.description,
    color: options.color || getDefaultColor(options.category || 'custom'),
  });
}

/**
 * 获取函数的标记信息
 * @param name 函数名称
 * @returns 标记信息或 undefined
 */
export function getFunctionMarker(name: string): FunctionMarker | undefined {
  return markedFunctions.get(name);
}

/**
 * 检查函数是否被标记
 * @param name 函数名称
 * @returns 是否被标记
 */
export function isFunctionMarked(name: string): boolean {
  return markedFunctions.has(name);
}

/**
 * 获取所有标记的函数
 * @returns 所有标记的函数映射
 */
export function getAllMarkedFunctions(): Map<string, FunctionMarker> {
  return new Map(markedFunctions);
}

/**
 * 清除所有标记
 */
export function clearAllMarkers(): void {
  markedFunctions.clear();
}

/**
 * 根据分类获取默认颜色
 */
function getDefaultColor(category: FunctionMarker['category']): string {
  const colorMap: Record<FunctionMarker['category'], string> = {
    network: '#ff6b6b',   // 红色
    render: '#4ecdc4',    // 青色
    compute: '#ffe66d',   // 黄色
    custom: '#95e1d3',    // 浅绿色
  };
  return colorMap[category];
}
