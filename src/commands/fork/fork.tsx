import { feature } from 'bun:bundle';
import React from 'react';
import { AgentTool } from '@claude-code-best/builtin-tools/tools/AgentTool/AgentTool.js';
import { isInForkChild } from '@claude-code-best/builtin-tools/tools/AgentTool/forkSubagent.js';
import { logForDebugging } from '../../utils/debug.js';
import type { LocalJSXCommandOnDone, LocalJSXCommandContext } from '../../types/command.js';

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  // 检查功能开关
  if (!feature('FORK_SUBAGENT')) {
    onDone('Fork subagent feature is not enabled. Set FEATURE_FORK_SUBAGENT=1 to enable.', { display: 'system' });
    return null;
  }

  // 递归分叉防护
  if (isInForkChild(context.messages)) {
    onDone('Fork is not available inside a forked worker. Complete your task directly using your tools.', {
      display: 'system',
    });
    return null;
  }

  const directive = args.trim();
  if (!directive) {
    onDone('Usage: /fork <directive>\nExample: /fork Fix the null check in validate.ts', { display: 'system' });
    return null;
  }

  // Find the last assistant message to fork from
  const lastAssistantMessage = [...context.messages].reverse().find(m => m.type === 'assistant') as any; // Type assertion to avoid complex type import

  if (!lastAssistantMessage) {
    onDone('Cannot fork: no assistant response in conversation history.', { display: 'system' });
    return null;
  }

  try {
    // 复用 AgentTool 逻辑处理分叉路径
    // 。省略 subagent_type 将触发隐式分叉。
    const input = {
      prompt: directive,
      run_in_background: true, // fork 始终异步运行
      description: `Fork: ${directive.slice(0, 30)}${directive.length > 30 ? '...' : ''}`,
    };

    // Call AgentTool with proper parameters:
    // - input: the agent parameters (no subagent_type => fork path)
    // - toolUseContext: the current context (ToolUseContext)
    // - canUseTool: permission-check function from context
    // - assistantMessage: the last assistant message to fork from
    AgentTool.call(input, context, context.canUseTool!, lastAssistantMessage).catch(error => {
      logForDebugging(`Fork subagent async error: ${error}`, { level: 'error' });
    });

    // Notify user that fork has been started
    onDone(`Forked subagent started with directive: "${directive}"`, { display: 'system' });
    return null;
  } catch (error) {
    // Catches synchronous setup errors only
    logForDebugging(`Fork command setup error: ${error}`, { level: 'error' });
    onDone(`Fork failed: ${error instanceof Error ? error.message : String(error)}`, { display: 'system' });
    return null;
  }
}
