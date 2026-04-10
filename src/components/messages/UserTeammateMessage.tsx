import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import figures from 'figures';
import * as React from 'react';
import { TEAMMATE_MESSAGE_TAG } from '../../constants/xml.js';
import { Ansi, Box, Text, type TextProps } from '@anthropic/ink';
import { toInkColor } from '../../utils/ink.js';

import { jsonParse } from '../../utils/slowOperations.js';
import { isShutdownApproved } from '../../utils/teammateMailbox.js';
import { MessageResponse } from '../MessageResponse.js';
import { tryRenderPlanApprovalMessage } from './PlanApprovalMessage.js';
import { tryRenderShutdownMessage } from './ShutdownMessage.js';
import { tryRenderTaskAssignmentMessage } from './TaskAssignmentMessage.js';

type Props = {
  addMargin: boolean;
  param: TextBlockParam;
  isTranscriptMode?: boolean;
};

type ParsedMessage = {
  teammateId: string;
  content: string;
  color?: string;
  summary?: string;
};

const TEAMMATE_MSG_REGEX = new RegExp(
  `<${TEAMMATE_MESSAGE_TAG}\\s+teammate_id="([^"]+)"(?:\\s+color="([^"]+)")?(?:\\s+summary="([^"]+)")?>\\n?([\\s\\S]*?)\\n?<\\/${TEAMMATE_MESSAGE_TAG}>`,
  'g',
);

/**
 * Parse all teammate messages from XML format:
 * <teammate-message teammate_id="alice" color="red" summary="Brief update">message content</teammate-message>
 * Supports multiple messages in a single text block.
 */
function parseTeammateMessages(text: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  // Use matchAll to find all matches (this is a RegExp method, not child_process)
  for (const match of text.matchAll(TEAMMATE_MSG_REGEX)) {
    if (match[1] && match[4]) {
      messages.push({
        teammateId: match[1],
        color: match[2], // may be undefined
        summary: match[3], // may be undefined
        content: match[4].trim(),
      });
    }
  }

  return messages;
}

function getDisplayName(teammateId: string): string {
  if (teammateId === 'leader') {
    return 'leader';
  }
  return teammateId;
}

export function UserTeammateMessage({ addMargin, param: { text }, isTranscriptMode }: Props): React.ReactNode {
  const messages = parseTeammateMessages(text).filter(msg => {
    // Pre-filter shutdown lifecycle messages to avoid empty wrapper
    // Box elements creating blank lines between model turns
    if (isShutdownApproved(msg.content)) {
      return false;
    }
    try {
      const parsed = jsonParse(msg.content);
      if (parsed?.type === 'teammate_terminated') return false;
    } catch {
      // Not JSON, keep the message
    }
    return true;
  });
  if (messages.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={addMargin ? 1 : 0} width="100%">
      {messages.map((msg, index) => {
        const inkColor = toInkColor(msg.color);
        const displayName = getDisplayName(msg.teammateId);

        // Try to render as plan approval message (request or response)
        const planApprovalElement = tryRenderPlanApprovalMessage(msg.content, displayName);
        if (planApprovalElement) {
          return <React.Fragment key={index}>{planApprovalElement}</React.Fragment>;
        }

        // Try to render as shutdown message (request or rejected)
        const shutdownElement = tryRenderShutdownMessage(msg.content);
        if (shutdownElement) {
          return <React.Fragment key={index}>{shutdownElement}</React.Fragment>;
        }

        // Try to render as task assignment message
        const taskAssignmentElement = tryRenderTaskAssignmentMessage(msg.content);
        if (taskAssignmentElement) {
          return <React.Fragment key={index}>{taskAssignmentElement}</React.Fragment>;
        }

        // Try to parse as structured JSON message
        let parsedIdleNotification: { type?: string } | null = null;
        try {
          parsedIdleNotification = jsonParse(msg.content);
        } catch {
          // Not JSON
        }

        // Hide idle notifications - they are processed silently
        if (parsedIdleNotification?.type === 'idle_notification') {
          return null;
        }

        // Task completed notification - show which task was completed
        if (parsedIdleNotification?.type === 'task_completed') {
          const taskCompleted = parsedIdleNotification as {
            type: string;
            from: string;
            taskId: string;
            taskSubject?: string;
          };
          return (
            <Box key={index} flexDirection="column" marginTop={1}>
              <Text color={inkColor}>{`@${displayName}${figures.pointer}`}</Text>
              <MessageResponse>
                <Text color="success">✓</Text>
                <Text>
                  {' '}
                  Completed task #{taskCompleted.taskId}
                  {taskCompleted.taskSubject && <Text dimColor> ({taskCompleted.taskSubject})</Text>}
                </Text>
              </MessageResponse>
            </Box>
          );
        }

        // Default: plain text message (truncated)
        return (
          <TeammateMessageContent
            key={index}
            displayName={displayName}
            inkColor={inkColor}
            content={msg.content}
            summary={msg.summary}
            isTranscriptMode={isTranscriptMode}
          />
        );
      })}
    </Box>
  );
}

type TeammateMessageContentProps = {
  displayName: string;
  inkColor: TextProps['color'];
  content: string;
  summary?: string;
  isTranscriptMode?: boolean;
};

export function TeammateMessageContent({
  displayName,
  inkColor,
  content,
  summary,
  isTranscriptMode,
}: TeammateMessageContentProps): React.ReactNode {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={inkColor}>{`@${displayName}${figures.pointer}`}</Text>
        {summary && <Text> {summary}</Text>}
      </Box>
      {isTranscriptMode && (
        <Box paddingLeft={2}>
          <Text>
            <Ansi>{content}</Ansi>
          </Text>
        </Box>
      )}
    </Box>
  );
}
