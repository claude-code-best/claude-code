import type { LocalJSXCommandCall } from '../../types/command.js';
import { SentryErrorBoundary } from '../../components/SentryErrorBoundary.js';
import { WorkflowsPanel } from './WorkflowsPanel.js';

/**
 * /workflows 的 local-jsx call：构造面板元素返回给 Ink 渲染。
 *
 * 用 SentryErrorBoundary 包裹：useSyncExternalStore / listNamed / 子组件
 * 抛错时不让异常击穿到 REPL 顶层导致整个会话崩溃；boundary 落到本地错误卡片。
 * onDone/context 由命令运行时注入；args 未使用（面板无参数化行为）。
 */
export const call: LocalJSXCommandCall = async (onDone, context, _args) => (
  <SentryErrorBoundary name="WorkflowsPanel">
    <WorkflowsPanel onDone={onDone} context={context} />
  </SentryErrorBoundary>
);
