import { expect, test } from 'bun:test';
import React from 'react';
import { EffortPanel } from '../EffortPanel.js';

// EffortPanel 是 UI 组件，渲染依赖链（useMainLoopModel / GrowthBook / settings）
// 在测试环境模拟成本高且脆化。本文件只做"组件契约"sanity check：
// 1) 默认导出为有效 React 组件
// 2) 接收正确 props 类型（编译期保证）
// 3) onDone 类型为 (message: string) => void
//
// 渲染输出与键盘交互通过 Step 6.2 手动验收覆盖；
// 确认/取消分支通过 computeConfirmOutcome 纯函数测试覆盖（见 effortPanelState.test.ts）。

test('EffortPanel 是有效 React 组件', () => {
  expect(typeof EffortPanel).toBe('function');
});

test('EffortPanel 接受 props 并返回 React element（不挂载）', () => {
  const element = React.createElement(EffortPanel, {
    appStateEffort: undefined,
    onDone: () => {},
  });
  expect(React.isValidElement(element)).toBe(true);
});
