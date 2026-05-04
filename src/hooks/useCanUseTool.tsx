import { feature } from 'bun:bundle';
import { APIUserAbortError } from '@anthropic-ai/sdk';
import * as React from 'react';
import { useCallback } from 'react';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js';
import { sanitizeToolNameForAnalytics } from 'src/services/analytics/metadata.js';
import type { ToolUseConfirm } from '../components/permissions/PermissionRequest.js';
import { Text } from '@anthropic/ink';
import type { ToolPermissionContext, Tool as ToolType, ToolUseContext } from '../Tool.js';
import {
  consumeSpeculativeClassifierCheck,
  peekSpeculativeClassifierCheck,
} from '@claude-code-best/builtin-tools/tools/BashTool/bashPermissions.js';
import { BASH_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/BashTool/toolName.js';
import type { AssistantMessage } from '../types/message.js';
import { recordAutoModeDenial } from '../utils/autoModeDenials.js';
import {
  clearClassifierChecking,
  setClassifierApproval,
  setYoloClassifierApproval,
} from '../utils/classifierApprovals.js';
import { logForDebugging } from '../utils/debug.js';
import { AbortError } from '../utils/errors.js';
import { logError } from '../utils/log.js';
import type { PermissionDecision } from '../utils/permissions/PermissionResult.js';
import { hasPermissionsToUseTool } from '../utils/permissions/permissions.js';
import { jsonStringify } from '../utils/slowOperations.js';
import { handleCoordinatorPermission } from './toolPermission/handlers/coordinatorHandler.js';
import { handleInteractivePermission } from './toolPermission/handlers/interactiveHandler.js';
import { handleSwarmWorkerPermission } from './toolPermission/handlers/swarmWorkerHandler.js';
import { createPermissionContext, createPermissionQueueOps } from './toolPermission/PermissionContext.js';
import { logPermissionDecision } from './toolPermission/permissionLogging.js';

export type CanUseToolFn<Input extends Record<string, unknown> = Record<string, unknown>> = (
  tool: ToolType,
  input: Input,
  toolUseContext: ToolUseContext,
  assistantMessage: AssistantMessage,
  toolUseID: string,
  forceDecision?: PermissionDecision<Input>,
) => Promise<PermissionDecision<Input>>;

function useCanUseTool(
  setToolUseConfirmQueue: React.Dispatch<React.SetStateAction<ToolUseConfirm[]>>,
  setToolPermissionContext: (context: ToolPermissionContext) => void,
): CanUseToolFn {
  return useCallback<CanUseToolFn>(
    async (tool, input, toolUseContext, assistantMessage, toolUseID, forceDecision) => {
      return new Promise(resolve => {
        const ctx = createPermissionContext(
          tool,
          input,
          toolUseContext,
          assistantMessage,
          toolUseID,
          setToolPermissionContext,
          createPermissionQueueOps(setToolUseConfirmQueue),
        );

        if (ctx.resolveIfAborted(resolve)) return;

        const decisionPromise =
          forceDecision !== undefined
            ? Promise.resolve(forceDecision)
            : hasPermissionsToUseTool(tool, input, toolUseContext, assistantMessage, toolUseID);

        return decisionPromise
          .then(async result => {
            // [仅限 ANT] 记录所有工具权限决策，包含工具名称和参数
            if (process.env.USER_TYPE === 'ant') {
              logEvent('tengu_internal_tool_permission_decision', {
                toolName: sanitizeToolNameForAnalytics(tool.name),
                behavior: result.behavior as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                // Note: input contains code/filepaths, only log for ants
                input: jsonStringify(input) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                messageID: ctx.messageId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                isMcp: tool.isMcp ?? false,
              });
            }

            // 拥有使用工具的权限，已在配置中授予
            if (result.behavior === 'allow') {
              if (ctx.resolveIfAborted(resolve)) return;
              // Track auto mode classifier approvals for UI display
              if (
                feature('TRANSCRIPT_CLASSIFIER') &&
                result.decisionReason?.type === 'classifier' &&
                result.decisionReason.classifier === 'auto-mode'
              ) {
                setYoloClassifierApproval(toolUseID, result.decisionReason.reason);
              }

              ctx.logDecision({ decision: 'accept', source: 'config' });

              resolve(
                ctx.buildAllow(result.updatedInput ?? input, {
                  decisionReason: result.decisionReason,
                }),
              );
              return;
            }

            const appState = toolUseContext.getAppState();
            const description = await tool.description(input as never, {
              isNonInteractiveSession: toolUseContext.options.isNonInteractiveSession,
              toolPermissionContext: appState.toolPermissionContext,
              tools: toolUseContext.options.tools,
            });

            if (ctx.resolveIfAborted(resolve)) return;

            // 没有使用工具的权限，检查行为
            switch (result.behavior) {
              case 'deny': {
                logPermissionDecision(
                  {
                    tool,
                    input,
                    toolUseContext,
                    messageId: ctx.messageId!,
                    toolUseID,
                  },
                  { decision: 'reject', source: 'config' },
                );
                if (
                  feature('TRANSCRIPT_CLASSIFIER') &&
                  result.decisionReason?.type === 'classifier' &&
                  result.decisionReason.classifier === 'auto-mode'
                ) {
                  recordAutoModeDenial({
                    toolName: tool.name,
                    display: description,
                    reason: result.decisionReason.reason ?? '',
                    timestamp: Date.now(),
                  });
                  toolUseContext.addNotification?.({
                    key: 'auto-mode-denied',
                    priority: 'immediate',
                    jsx: (
                      <>
                        <Text color="error">{tool.userFacingName(input).toLowerCase()} denied by auto mode</Text>
                        <Text dimColor> · /permissions</Text>
                      </>
                    ),
                  });
                }
                resolve(result);
                return;
              }

              case 'ask': {
                // For coordinator workers, await automated checks before showing dialog.
                // Background workers should only interrupt the user when automated checks can't decide.
                if (appState.toolPermissionContext.awaitAutomatedChecksBeforeDialog) {
                  const coordinatorDecision = await handleCoordinatorPermission({
                    ctx,
                    ...(feature('BASH_CLASSIFIER')
                      ? {
                          pendingClassifierCheck: result.pendingClassifierCheck,
                        }
                      : {}),
                    updatedInput: result.updatedInput,
                    suggestions: result.suggestions,
                    permissionMode: appState.toolPermissionContext.mode,
                  });
                  if (coordinatorDecision) {
                    resolve(coordinatorDecision);
                    return;
                  }
                  // null 表示自动化检查均未解决——回退到下面的对
                  // 话框。钩子已运行，分类器已消耗。
                }

                // After awaiting automated checks, verify the request wasn't aborted
                // while we were waiting. Without this check, a stale dialog could appear.
                if (ctx.resolveIfAborted(resolve)) return;

                // 对于群组工作线程，先尝试分类器自动批准
                // ，然后通过邮箱将权限请求转发给领导者。
                const swarmDecision = await handleSwarmWorkerPermission({
                  ctx,
                  description,
                  ...(feature('BASH_CLASSIFIER')
                    ? {
                        pendingClassifierCheck: result.pendingClassifierCheck,
                      }
                    : {}),
                  updatedInput: result.updatedInput,
                  suggestions: result.suggestions,
                });
                if (swarmDecision) {
                  resolve(swarmDecision);
                  return;
                }

                // 宽限期：最多等待 2 秒让推测性分类器
                // 解决，然后再显示对话框（仅限主代理）
                if (
                  feature('BASH_CLASSIFIER') &&
                  result.pendingClassifierCheck &&
                  tool.name === BASH_TOOL_NAME &&
                  !appState.toolPermissionContext.awaitAutomatedChecksBeforeDialog
                ) {
                  const speculativePromise = peekSpeculativeClassifierCheck((input as { command: string }).command);
                  if (speculativePromise) {
                    const raceResult = await Promise.race([
                      speculativePromise.then(r => ({
                        type: 'result' as const,
                        result: r,
                      })),
                      new Promise<{ type: 'timeout' }>(res =>
                        // eslint-disable-next-line no-restricted-syntax -- 解析为一个值，而非 void
                        setTimeout(res, 2000, { type: 'timeout' as const }),
                      ),
                    ]);

                    if (ctx.resolveIfAborted(resolve)) return;

                    if (
                      raceResult.type === 'result' &&
                      raceResult.result.matches &&
                      raceResult.result.confidence === 'high' &&
                      feature('BASH_CLASSIFIER')
                    ) {
                      // Classifier approved within grace period — skip dialog
                      void consumeSpeculativeClassifierCheck((input as { command: string }).command);

                      const matchedRule = raceResult.result.matchedDescription ?? undefined;
                      if (matchedRule) {
                        setClassifierApproval(toolUseID, matchedRule);
                      }

                      ctx.logDecision({
                        decision: 'accept',
                        source: { type: 'classifier' },
                      });
                      resolve(
                        ctx.buildAllow(result.updatedInput ?? (input as Record<string, unknown>), {
                          decisionReason: {
                            type: 'classifier' as const,
                            classifier: 'bash_allow' as const,
                            reason: `Allowed by prompt rule: "${raceResult.result.matchedDescription}"`,
                          },
                        }),
                      );
                      return;
                    }
                    // 超时或无匹配——回退到显示对话框
                  }
                }

                // 显示对话框并在后台启动钩子/分类器
                handleInteractivePermission(
                  {
                    ctx,
                    description,
                    result,
                    awaitAutomatedChecksBeforeDialog: appState.toolPermissionContext.awaitAutomatedChecksBeforeDialog,
                    bridgeCallbacks: feature('BRIDGE_MODE') ? appState.replBridgePermissionCallbacks : undefined,
                    channelCallbacks:
                      feature('KAIROS') || feature('KAIROS_CHANNELS') ? appState.channelPermissionCallbacks : undefined,
                  },
                  resolve,
                );

                return;
              }
            }
          })
          .catch(error => {
            if (error instanceof AbortError || error instanceof APIUserAbortError) {
              logForDebugging(
                `Permission check threw ${error.constructor.name} for tool=${tool.name}: ${error.message}`,
              );
              ctx.logCancelled();
              resolve(ctx.cancelAndAbort(undefined, true));
            } else {
              logError(error);
              resolve(ctx.cancelAndAbort(undefined, true));
            }
          })
          .finally(() => {
            clearClassifierChecking(toolUseID);
          });
      });
    },
    [setToolUseConfirmQueue, setToolPermissionContext],
  );
}

export default useCanUseTool;
