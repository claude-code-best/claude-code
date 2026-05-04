import { feature } from 'bun:bundle';
import * as React from 'react';
import type { LocalJSXCommandContext } from '../../commands.js';
import { ContextVisualization } from '../../components/ContextVisualization.js';
import { microcompactMessages } from '../../services/compact/microCompact.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import type { Message } from '../../types/message.js';
import { analyzeContextUsage } from '../../utils/analyzeContext.js';
import { getMessagesAfterCompactBoundary } from '../../utils/messages.js';
import { renderToAnsiString } from '../../utils/staticRender.js';

/** 在 API 调用前应用与 query.ts 相同的上下文转换，这样 /context 显示的是模型实际看到的内容，而非 REPL 的原始历史记录。若不使用 projectView，令牌计数会多算被折叠的部分——用户看到 "180k，3 个跨度已折叠"，而 API 实际看到的是 120k。 */
function toApiView(messages: Message[]): Message[] {
  let view = getMessagesAfterCompactBoundary(messages);
  if (feature('CONTEXT_COLLAPSE')) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { projectView } =
      require('../../services/contextCollapse/operations.js') as typeof import('../../services/contextCollapse/operations.js');
    /* eslint-enable @typescript-eslint/no-require-imports */
    view = projectView(view);
  }
  return view;
}

export async function call(onDone: LocalJSXCommandOnDone, context: LocalJSXCommandContext): Promise<React.ReactNode> {
  const {
    messages,
    getAppState,
    options: { mainLoopModel, tools },
  } = context;

  const apiView = toApiView(messages);

  // Apply microcompact to get accurate representation of messages sent to API
  const { messages: compactedMessages } = await microcompactMessages(apiView);

  // Get terminal width for responsive sizing
  const terminalWidth = process.stdout.columns || 80;

  const appState = getAppState();

  // 使用压缩后的消息分析上下文 将
  // 原始消息作为最后一个参数传入，以准确提取 API 使用情况
  const data = await analyzeContextUsage(
    compactedMessages,
    mainLoopModel,
    async () => appState.toolPermissionContext,
    tools,
    appState.agentDefinitions,
    terminalWidth,
    context, // 传递完整上下文以计算系统提示
    undefined, // mainThreadAgentDefinition
    apiView, // Original messages for API usage extraction
  );

  // Render to ANSI string to preserve colors and pass to onDone like local commands do
  const output = await renderToAnsiString(<ContextVisualization data={data} />);
  onDone(output);
  return null;
}
