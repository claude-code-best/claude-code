import * as React from 'react';
import { useEffect, useRef } from 'react';
import { KeyboardShortcutHint } from '@anthropic/ink';
import { Box, Text } from '@anthropic/ink';
import { useKeybinding } from '../keybindings/useKeybinding.js';

type Props = {
  onRun: () => void;
  onCancel: () => void;
  reason: string;
};

/**
 * 显示关于运行 /issue 命令通知的组件
 * 支持按 ESC 键取消
 */
export function AutoRunIssueNotification({ onRun, onCancel, reason }: Props): React.ReactNode {
  const hasRunRef = useRef(false);

  // Handle ESC key to cancel
  useKeybinding('confirm:no', onCancel, { context: 'Confirmation' });

  // 挂载后立即运行 /issue
  useEffect(() => {
    if (!hasRunRef.current) {
      hasRunRef.current = true;
      onRun();
    }
  }, [onRun]);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text bold>正在运行反馈收集...</Text>
      </Box>
      <Box>
        <Text dimColor>
          随时按 <KeyboardShortcutHint shortcut="Esc" action="cancel" />
        </Text>
      </Box>
      <Box>
        <Text dimColor>原因：{reason}</Text>
      </Box>
    </Box>
  );
}

export type AutoRunIssueReason = 'feedback_survey_bad' | 'feedback_survey_good';

/**
 * 判断 /issue 是否应为 Ant 用户自动运行
 */
export function shouldAutoRunIssue(reason: AutoRunIssueReason): boolean {
  // 仅限 Ant 用户
  if (process.env.USER_TYPE !== 'ant') {
    return false;
  }

  switch (reason) {
    case 'feedback_survey_bad':
      return false;
    case 'feedback_survey_good':
      return false;
    default:
      return false;
  }
}

/**
 * 根据原因返回要自动运行的相应命令
 * 仅限 Ant 内部：good-claude 命令仅存在于 ant 构建中
 */
export function getAutoRunCommand(reason: AutoRunIssueReason): string {
  // 仅 ant 构建具有 /good-claude 命令
  if (process.env.USER_TYPE === 'ant' && reason === 'feedback_survey_good') {
    return '/good-claude';
  }
  return '/issue';
}

/**
 * 获取关于为何自动运行 /issue 的人类可读描述
 */
export function getAutoRunIssueReasonText(reason: AutoRunIssueReason): string {
  switch (reason) {
    case 'feedback_survey_bad':
      return 'You responded "Bad" to the feedback survey';
    case 'feedback_survey_good':
      return 'You responded "Good" to the feedback survey';
    default:
      return 'Unknown reason';
  }
}
