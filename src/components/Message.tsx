import { feature } from 'bun:bundle';
import type { BetaContentBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import type {
  ImageBlockParam,
  TextBlockParam,
  ThinkingBlockParam,
  ToolResultBlockParam,
  ToolUseBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs';
import * as React from 'react';
import type { Command } from '../commands.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { Box } from '@anthropic/ink';
import type { Tools } from '../Tool.js';
import { type ConnectorTextBlock, isConnectorTextBlock } from '../types/connectorText.js';
import type {
  AssistantMessage,
  AttachmentMessage as AttachmentMessageType,
  CollapsedReadSearchGroup as CollapsedReadSearchGroupType,
  GroupedToolUseMessage as GroupedToolUseMessageType,
  NormalizedUserMessage,
  ProgressMessage,
  SystemMessage,
} from '../types/message.js';
import { type AdvisorBlock, isAdvisorBlock } from '../utils/advisor.js';
import { isFullscreenEnvEnabled } from '../utils/fullscreen.js';
import { logError } from '../utils/log.js';
import type { buildMessageLookups } from '../utils/messages.js';
import { CompactSummary } from './CompactSummary.js';
import { AdvisorMessage } from './messages/AdvisorMessage.js';
import { AssistantRedactedThinkingMessage } from './messages/AssistantRedactedThinkingMessage.js';
import { AssistantTextMessage } from './messages/AssistantTextMessage.js';
import { AssistantThinkingMessage } from './messages/AssistantThinkingMessage.js';
import { AssistantToolUseMessage } from './messages/AssistantToolUseMessage.js';
import { AttachmentMessage } from './messages/AttachmentMessage.js';
import { CollapsedReadSearchContent } from './messages/CollapsedReadSearchContent.js';
import { CompactBoundaryMessage } from './messages/CompactBoundaryMessage.js';
import { GroupedToolUseContent } from './messages/GroupedToolUseContent.js';
import { SystemTextMessage } from './messages/SystemTextMessage.js';
import { UserImageMessage } from './messages/UserImageMessage.js';
import { UserTextMessage } from './messages/UserTextMessage.js';
import { UserToolResultMessage } from './messages/UserToolResultMessage/UserToolResultMessage.js';
import { OffscreenFreeze } from './OffscreenFreeze.js';
import { ExpandShellOutputProvider } from './shell/ExpandShellOutputContext.js';

export type Props = {
  message:
    | NormalizedUserMessage
    | AssistantMessage
    | AttachmentMessageType
    | SystemMessage
    | GroupedToolUseMessageType
    | CollapsedReadSearchGroupType;
  lookups: ReturnType<typeof buildMessageLookups>;
  // TODO: Find a way to remove this, and leave spacing to the consumer
  /** Absolute width for the container Box. When provided, eliminates a wrapper Box in the caller. */
  containerWidth?: number;
  addMargin: boolean;
  tools: Tools;
  commands: Command[];
  verbose: boolean;
  inProgressToolUseIDs: Set<string>;
  progressMessagesForMessage: ProgressMessage[];
  shouldAnimate: boolean;
  shouldShowDot: boolean;
  style?: 'condensed';
  width?: number | string;
  isTranscriptMode: boolean;
  isStatic: boolean;
  onOpenRateLimitOptions?: () => void;
  isActiveCollapsedGroup?: boolean;
  isUserContinuation?: boolean;
  /** ID of the last thinking block (uuid:index) to show, used for hiding past thinking in transcript mode */
  lastThinkingBlockId?: string | null;
  /** UUID of the latest user bash output message (for auto-expanding) */
  latestBashOutputUUID?: string | null;
  /** Whether to collapse diff display for this message */
  shouldCollapseDiffs?: boolean;
};

function MessageImpl({
  message,
  lookups,
  containerWidth,
  addMargin,
  tools,
  commands,
  verbose,
  inProgressToolUseIDs,
  progressMessagesForMessage,
  shouldAnimate,
  shouldShowDot,
  style,
  width,
  isTranscriptMode,
  onOpenRateLimitOptions,
  isActiveCollapsedGroup,
  isUserContinuation = false,
  lastThinkingBlockId,
  latestBashOutputUUID,
  shouldCollapseDiffs,
}: Props): React.ReactNode {
  switch (message.type) {
    case 'attachment':
      return (
        <AttachmentMessage
          addMargin={addMargin}
          attachment={message.attachment as import('../utils/attachments.js').Attachment}
          verbose={verbose}
          isTranscriptMode={isTranscriptMode}
        />
      );
    case 'assistant':
      return (
        <Box flexDirection="column" width={containerWidth ?? '100%'}>
          {(message.message.content as BetaContentBlock[]).map((_, index) => (
            <AssistantMessageBlock
              key={index}
              param={_}
              addMargin={addMargin}
              tools={tools}
              commands={commands}
              verbose={verbose}
              inProgressToolUseIDs={inProgressToolUseIDs}
              progressMessagesForMessage={progressMessagesForMessage}
              shouldAnimate={shouldAnimate}
              shouldShowDot={shouldShowDot}
              width={width}
              inProgressToolCallCount={inProgressToolUseIDs.size}
              isTranscriptMode={isTranscriptMode}
              lookups={lookups}
              onOpenRateLimitOptions={onOpenRateLimitOptions}
              thinkingBlockId={`${message.uuid}:${index}`}
              lastThinkingBlockId={lastThinkingBlockId}
              advisorModel={message.advisorModel as string | undefined}
            />
          ))}
        </Box>
      );
    case 'user': {
      if (message.isCompactSummary) {
        return <CompactSummary message={message} screen={isTranscriptMode ? 'transcript' : 'prompt'} />;
      }
      // Precompute the imageIndex prop for each content block. The previous
      // version incremented a counter inside the .map() callback, which
      // React Compiler bails on ("UpdateExpression to variables captured
      // within lambdas"). A plain for loop keeps the mutation out of a
      // closure so the compiler can memoize MessageImpl.
      const imageIndices: number[] = [];
      let imagePosition = 0;
      for (const param of message.message.content as Array<{ type: string }>) {
        if (param.type === 'image') {
          const id = message.imagePasteIds?.[imagePosition];
          imagePosition++;
          imageIndices.push(id ?? imagePosition);
        } else {
          imageIndices.push(imagePosition);
        }
      }
      // Check if this message is the latest bash output - if so, wrap content
      // with provider so OutputLine can show full output via context
      const isLatestBashOutput = latestBashOutputUUID === message.uuid;
      const content = (
        <Box flexDirection="column" width={containerWidth ?? '100%'}>
          {(
            message.message.content as Array<
              TextBlockParam | ImageBlockParam | ToolUseBlockParam | ToolResultBlockParam
            >
          ).map((param, index) => (
            <UserMessage
              key={index}
              message={message}
              addMargin={addMargin}
              tools={tools}
              progressMessagesForMessage={progressMessagesForMessage}
              param={param}
              style={style}
              verbose={verbose}
              imageIndex={imageIndices[index]!}
              isUserContinuation={isUserContinuation}
              lookups={lookups}
              isTranscriptMode={isTranscriptMode}
              shouldCollapseDiffs={shouldCollapseDiffs}
            />
          ))}
        </Box>
      );
      return isLatestBashOutput ? <ExpandShellOutputProvider>{content}</ExpandShellOutputProvider> : content;
    }
    case 'system':
      if (message.subtype === 'compact_boundary') {
        // Fullscreen keeps pre-compact messages in the ScrollBox (REPL.tsx
        // appends instead of resetting, Messages.tsx skips the boundary
        // filter) — scroll up for history, no need for the ctrl+o hint.
        if (isFullscreenEnvEnabled()) {
          return null;
        }
        return <CompactBoundaryMessage />;
      }
      if (message.subtype === 'microcompact_boundary') {
        // Logged at creation time in createMicrocompactBoundaryMessage
        return null;
      }
      if (feature('HISTORY_SNIP')) {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const { isSnipBoundaryMessage } =
          require('../services/compact/snipProjection.js') as typeof import('../services/compact/snipProjection.js');
        const { isSnipMarkerMessage } =
          require('../services/compact/snipCompact.js') as typeof import('../services/compact/snipCompact.js');
        /* eslint-enable @typescript-eslint/no-require-imports */
        if (isSnipBoundaryMessage(message)) {
          /* eslint-disable @typescript-eslint/no-require-imports */
          const { SnipBoundaryMessage } =
            require('./messages/SnipBoundaryMessage.js') as typeof import('./messages/SnipBoundaryMessage.js');
          /* eslint-enable @typescript-eslint/no-require-imports */
          return <SnipBoundaryMessage message={message} />;
        }
        if (isSnipMarkerMessage(message)) {
          // Internal registration marker — not user-facing. The boundary
          // message (above) is what shows when snips actually execute.
          return null;
        }
      }
      if (message.subtype === 'local_command') {
        return (
          <UserTextMessage
            addMargin={addMargin}
            param={{ type: 'text', text: String(message.content ?? '') }}
            verbose={verbose}
            isTranscriptMode={isTranscriptMode}
          />
        );
      }
      return (
        <SystemTextMessage
          message={message}
          addMargin={addMargin}
          verbose={verbose}
          isTranscriptMode={isTranscriptMode}
        />
      );
    case 'grouped_tool_use':
      return (
        <GroupedToolUseContent
          message={message}
          tools={tools}
          lookups={lookups}
          inProgressToolUseIDs={inProgressToolUseIDs}
          shouldAnimate={shouldAnimate}
        />
      );
    case 'collapsed_read_search':
      // OffscreenFreeze: the verb flips "Reading…"→"Read" when tools complete.
      // If the group has scrolled into scrollback by then, the update triggers
      // a full terminal reset (CC-1155). This component is never marked static
      // in prompt mode (shouldRenderStatically returns false to allow live
      // updates between API turns), so the memo can't help. Freeze when
      // offscreen — scrollback shows whatever state was visible when it left.
      return (
        <OffscreenFreeze>
          <CollapsedReadSearchContent
            message={message}
            inProgressToolUseIDs={inProgressToolUseIDs}
            shouldAnimate={shouldAnimate}
            // ctrl+o transcript mode should expand the group the same way
            // --verbose does, so recalled memories + tool details are visible.
            // AttachmentMessage.tsx's standalone relevant_memories branch
            // already checks (verbose || isTranscriptMode); this aligns the
            // collapsed-group path to match.
            verbose={verbose || isTranscriptMode}
            tools={tools}
            lookups={lookups}
            isActiveGroup={isActiveCollapsedGroup}
          />
        </OffscreenFreeze>
      );
  }
}

function UserMessage({
  message,
  addMargin,
  tools,
  progressMessagesForMessage,
  param,
  style,
  verbose,
  imageIndex,
  isUserContinuation,
  lookups,
  isTranscriptMode,
  shouldCollapseDiffs,
}: {
  message: NormalizedUserMessage;
  addMargin: boolean;
  tools: Tools;
  progressMessagesForMessage: ProgressMessage[];
  param: TextBlockParam | ImageBlockParam | ToolUseBlockParam | ToolResultBlockParam;
  style?: 'condensed';
  verbose: boolean;
  imageIndex?: number;
  isUserContinuation: boolean;
  lookups: ReturnType<typeof buildMessageLookups>;
  isTranscriptMode: boolean;
  shouldCollapseDiffs?: boolean;
}): React.ReactNode {
  const { columns } = useTerminalSize();
  switch (param.type) {
    case 'text':
      return (
        <UserTextMessage
          addMargin={addMargin}
          param={param}
          verbose={verbose}
          planContent={message.planContent as string | undefined}
          isTranscriptMode={isTranscriptMode}
          timestamp={message.timestamp as string | undefined}
        />
      );
    case 'image':
      // If previous message is user (text or image), this is a continuation - use connector
      // Otherwise this image starts a new user turn - use margin
      return <UserImageMessage imageId={imageIndex} addMargin={addMargin && !isUserContinuation} />;
    case 'tool_result':
      return (
        <UserToolResultMessage
          param={param}
          message={message}
          lookups={lookups}
          progressMessagesForMessage={progressMessagesForMessage}
          style={style}
          tools={tools}
          verbose={verbose}
          width={columns - 5}
          isTranscriptMode={isTranscriptMode}
          shouldCollapseDiffs={shouldCollapseDiffs}
        />
      );
    default:
      return undefined;
  }
}

function AssistantMessageBlock({
  param,
  addMargin,
  tools,
  commands,
  verbose,
  inProgressToolUseIDs,
  progressMessagesForMessage,
  shouldAnimate,
  shouldShowDot,
  width,
  inProgressToolCallCount,
  isTranscriptMode,
  lookups,
  onOpenRateLimitOptions,
  thinkingBlockId,
  lastThinkingBlockId,
  advisorModel,
}: {
  param:
    | BetaContentBlock
    | ConnectorTextBlock
    | AdvisorBlock
    | TextBlockParam
    | ImageBlockParam
    | ThinkingBlockParam
    | ToolUseBlockParam
    | ToolResultBlockParam;
  addMargin: boolean;
  tools: Tools;
  commands: Command[];
  verbose: boolean;
  inProgressToolUseIDs: Set<string>;
  progressMessagesForMessage: ProgressMessage[];
  shouldAnimate: boolean;
  shouldShowDot: boolean;
  width?: number | string;
  inProgressToolCallCount?: number;
  isTranscriptMode: boolean;
  lookups: ReturnType<typeof buildMessageLookups>;
  onOpenRateLimitOptions?: () => void;
  /** ID of this content block's message:index for thinking block comparison */
  thinkingBlockId: string;
  /** ID of the last thinking block to show, null means show all */
  lastThinkingBlockId?: string | null;
  advisorModel?: string;
}): React.ReactNode {
  if (feature('CONNECTOR_TEXT')) {
    if (isConnectorTextBlock(param)) {
      return (
        <AssistantTextMessage
          param={{ type: 'text', text: param.connector_text }}
          addMargin={addMargin}
          shouldShowDot={shouldShowDot}
          verbose={verbose}
          width={width}
          onOpenRateLimitOptions={onOpenRateLimitOptions}
        />
      );
    }
  }
  switch (param.type) {
    case 'tool_use':
      return (
        <AssistantToolUseMessage
          param={param as ToolUseBlockParam}
          addMargin={addMargin}
          tools={tools}
          commands={commands}
          verbose={verbose}
          inProgressToolUseIDs={inProgressToolUseIDs}
          progressMessagesForMessage={progressMessagesForMessage}
          shouldAnimate={shouldAnimate}
          shouldShowDot={shouldShowDot}
          inProgressToolCallCount={inProgressToolCallCount}
          lookups={lookups}
          isTranscriptMode={isTranscriptMode}
        />
      );
    case 'text':
      return (
        <AssistantTextMessage
          param={param as TextBlockParam}
          addMargin={addMargin}
          shouldShowDot={shouldShowDot}
          verbose={verbose}
          width={width}
          onOpenRateLimitOptions={onOpenRateLimitOptions}
        />
      );
    case 'redacted_thinking':
      if (!isTranscriptMode && !verbose) {
        return null;
      }
      return <AssistantRedactedThinkingMessage addMargin={addMargin} />;
    case 'thinking': {
      if (!isTranscriptMode && !verbose) {
        return null;
      }
      // In transcript mode with hidePastThinking, only show the last thinking block
      const isLastThinking = !lastThinkingBlockId || thinkingBlockId === lastThinkingBlockId;
      return (
        <AssistantThinkingMessage
          addMargin={addMargin}
          param={param as ThinkingBlockParam | { type: 'thinking'; thinking: string }}
          isTranscriptMode={isTranscriptMode}
          verbose={verbose}
          hideInTranscript={isTranscriptMode && !isLastThinking}
        />
      );
    }
    case 'server_tool_use':
    case 'advisor_tool_result':
      if (isAdvisorBlock(param)) {
        return (
          <AdvisorMessage
            block={param}
            addMargin={addMargin}
            resolvedToolUseIDs={lookups.resolvedToolUseIDs}
            erroredToolUseIDs={lookups.erroredToolUseIDs}
            shouldAnimate={shouldAnimate}
            verbose={verbose || isTranscriptMode}
            advisorModel={advisorModel}
          />
        );
      }
      logError(new Error(`Unable to render server tool block: ${param.type}`));
      return null;
    default:
      logError(new Error(`Unable to render message type: ${param.type}`));
      return null;
  }
}

export function hasThinkingContent(m: { type: string; message?: { content: Array<{ type: string }> } }): boolean {
  if (m.type !== 'assistant' || !m.message) return false;
  return m.message.content.some(b => b.type === 'thinking' || b.type === 'redacted_thinking');
}

/** Exported for testing */
export function areMessagePropsEqual(prev: Props, next: Props): boolean {
  if (prev.message.uuid !== next.message.uuid) return false;
  // Only re-render on lastThinkingBlockId change if this message actually
  // has thinking content — otherwise every message in scrollback re-renders
  // whenever streaming thinking starts/stops (CC-941).
  if (
    prev.lastThinkingBlockId !== next.lastThinkingBlockId &&
    hasThinkingContent(next.message as Parameters<typeof hasThinkingContent>[0])
  ) {
    return false;
  }
  // Verbose toggle changes thinking block visibility/expansion
  if (prev.verbose !== next.verbose) return false;
  // Only re-render if this message's "is latest bash output" status changed,
  // not when the global latestBashOutputUUID changes to a different message
  const prevIsLatest = prev.latestBashOutputUUID === prev.message.uuid;
  const nextIsLatest = next.latestBashOutputUUID === next.message.uuid;
  if (prevIsLatest !== nextIsLatest) return false;
  if (prev.isTranscriptMode !== next.isTranscriptMode) return false;
  // containerWidth is an absolute number in the no-metadata path (wrapper
  // Box is skipped). Static messages must re-render on terminal resize.
  if (prev.containerWidth !== next.containerWidth) return false;
  if (prev.isStatic && next.isStatic) return true;
  return false;
}

export const Message = React.memo(MessageImpl, areMessagePropsEqual);
