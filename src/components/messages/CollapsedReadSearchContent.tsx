import { feature } from 'bun:bundle';
import { basename } from 'path';
import React, { useRef } from 'react';
import { useMinDisplayTime } from '../../hooks/useMinDisplayTime.js';
import { Ansi, Box, Text, useTheme } from '@anthropic/ink';
import { findToolByName, type Tools } from '../../Tool.js';
import { getReplPrimitiveTools } from '@claude-code-best/builtin-tools/tools/REPLTool/primitiveTools.js';
import type { CollapsedReadSearchGroup, NormalizedAssistantMessage } from '../../types/message.js';
import { uniq } from '../../utils/array.js';
import { getToolUseIdsFromCollapsedGroup } from '../../utils/collapseReadSearch.js';
import { getDisplayPath } from '../../utils/file.js';
import { formatDuration, formatSecondsShort } from '../../utils/format.js';
import { isFullscreenEnvEnabled } from '../../utils/fullscreen.js';
import type { buildMessageLookups } from '../../utils/messages.js';
import type { ThemeName } from '../../utils/theme.js';
import { CtrlOToExpand } from '../CtrlOToExpand.js';
import { useSelectedMessageBg } from '../messageActions.js';
import { PrBadge } from '../PrBadge.js';
import { ToolUseLoader } from '../ToolUseLoader.js';

/* eslint-disable @typescript-eslint/no-require-imports */
const teamMemCollapsed = feature('TEAMMEM')
  ? (require('./teamMemCollapsed.js') as typeof import('./teamMemCollapsed.js'))
  : null;
/* eslint-enable @typescript-eslint/no-require-imports */

// Hold each ⤿ hint for a minimum duration so fast-completing tool calls
// (bash commands, file reads, search patterns) are actually readable instead
// of flickering past in a single frame.
const MIN_HINT_DISPLAY_MS = 700;

type Props = {
  message: CollapsedReadSearchGroup;
  inProgressToolUseIDs: Set<string>;
  shouldAnimate: boolean;
  verbose: boolean;
  tools: Tools;
  lookups: ReturnType<typeof buildMessageLookups>;
  /** True if this is the currently active collapsed group (last one, still loading) */
  isActiveGroup?: boolean;
};

/** Render a single tool use in verbose mode */
function VerboseToolUse({
  content,
  tools,
  lookups,
  inProgressToolUseIDs,
  shouldAnimate,
  theme,
}: {
  content: { type: 'tool_use'; id: string; name: string; input: unknown };
  tools: Tools;
  lookups: ReturnType<typeof buildMessageLookups>;
  inProgressToolUseIDs: Set<string>;
  shouldAnimate: boolean;
  theme: ThemeName;
}): React.ReactNode {
  const bg = useSelectedMessageBg();
  // Same REPL-primitive fallback as getToolSearchOrReadInfo — REPL mode strips
  // these from the execution tools list, but virtual messages still need them
  // to render in verbose mode.
  const tool = findToolByName(tools, content.name) ?? findToolByName(getReplPrimitiveTools(), content.name);
  if (!tool) return null;

  const isResolved = lookups.resolvedToolUseIDs.has(content.id);
  const isError = lookups.erroredToolUseIDs.has(content.id);
  const isInProgress = inProgressToolUseIDs.has(content.id);

  const resultMsg = lookups.toolResultByToolUseID.get(content.id);
  const rawToolResult = resultMsg?.type === 'user' ? resultMsg.toolUseResult : undefined;
  const parsedOutput = tool.outputSchema?.safeParse(rawToolResult);
  const toolResult = parsedOutput?.success ? parsedOutput.data : undefined;

  const parsedInput = tool.inputSchema.safeParse(content.input);
  const input = parsedInput.success ? parsedInput.data : undefined;
  const userFacingName = tool.userFacingName(input);
  const toolUseMessage = input ? tool.renderToolUseMessage(input, { theme, verbose: true }) : null;

  return (
    <Box key={content.id} flexDirection="column" marginTop={1} backgroundColor={bg}>
      <Box flexDirection="row">
        <ToolUseLoader shouldAnimate={shouldAnimate && isInProgress} isUnresolved={!isResolved} isError={isError} />
        <Text>
          <Text bold>{userFacingName}</Text>
          {toolUseMessage && <Text>({toolUseMessage})</Text>}
        </Text>
        {input && tool.renderToolUseTag?.(input)}
      </Box>
      {isResolved && !isError && toolResult !== undefined && (
        <Box>
          {tool.renderToolResultMessage?.(toolResult, [], {
            verbose: true,
            tools,
            theme,
          })}
        </Box>
      )}
    </Box>
  );
}

export function CollapsedReadSearchContent({
  message,
  inProgressToolUseIDs,
  shouldAnimate,
  verbose,
  tools,
  lookups,
  isActiveGroup,
}: Props): React.ReactNode {
  const bg = useSelectedMessageBg();
  const {
    searchCount: rawSearchCount,
    readCount: rawReadCount,
    listCount: rawListCount,
    replCount,
    memorySearchCount,
    memoryReadCount,
    memoryWriteCount,
    messages: groupMessages,
  } = message;
  const [theme] = useTheme();
  const toolUseIds = getToolUseIdsFromCollapsedGroup(message);
  const anyError = toolUseIds.some(id => lookups.erroredToolUseIDs.has(id));
  const hasMemoryOps = memorySearchCount > 0 || memoryReadCount > 0 || memoryWriteCount > 0;
  const hasTeamMemoryOps = feature('TEAMMEM') ? teamMemCollapsed!.checkHasTeamMemOps(message) : false;

  // Track the max seen counts so they only ever increase. The debounce timer
  // causes extra re-renders at arbitrary times; during a brief "invisible window"
  // in the streaming executor the group count can dip, which causes jitter.
  const maxReadCountRef = useRef(0);
  const maxSearchCountRef = useRef(0);
  const maxListCountRef = useRef(0);
  const maxMcpCountRef = useRef(0);
  const maxBashCountRef = useRef(0);
  maxReadCountRef.current = Math.max(maxReadCountRef.current, rawReadCount);
  maxSearchCountRef.current = Math.max(maxSearchCountRef.current, rawSearchCount);
  maxListCountRef.current = Math.max(maxListCountRef.current, rawListCount);
  maxMcpCountRef.current = Math.max(maxMcpCountRef.current, message.mcpCallCount ?? 0);
  maxBashCountRef.current = Math.max(maxBashCountRef.current, message.bashCount ?? 0);
  const readCount = maxReadCountRef.current;
  const searchCount = maxSearchCountRef.current;
  const listCount = maxListCountRef.current;
  const mcpCallCount = maxMcpCountRef.current;
  // Subtract commands surfaced as "Committed …" / "Created PR …" so the
  // same command isn't counted twice. gitOpBashCount is read live (no max-ref
  // needed — it's 0 until results arrive, then only grows).
  const gitOpBashCount = message.gitOpBashCount ?? 0;
  const bashCount = isFullscreenEnvEnabled() ? Math.max(0, maxBashCountRef.current - gitOpBashCount) : 0;

  const hasNonMemoryOps =
    searchCount > 0 ||
    readCount > 0 ||
    listCount > 0 ||
    replCount > 0 ||
    mcpCallCount > 0 ||
    bashCount > 0 ||
    gitOpBashCount > 0;

  const readPaths = message.readFilePaths;
  const searchArgs = message.searchArgs;
  let incomingHint = message.latestDisplayHint;
  if (incomingHint === undefined) {
    const lastSearchRaw = searchArgs?.at(-1);
    const lastSearch = lastSearchRaw !== undefined ? `"${lastSearchRaw}"` : undefined;
    const lastRead = readPaths?.at(-1);
    incomingHint = lastRead !== undefined ? getDisplayPath(lastRead) : lastSearch;
  }

  // Active REPL calls emit repl_tool_call progress with the current inner
  // tool's name+input. Virtual messages don't arrive until REPL completes,
  // so this is the only source of a live hint during execution.
  if (isActiveGroup) {
    for (const id of toolUseIds) {
      if (!inProgressToolUseIDs.has(id)) continue;
      const latest = lookups.progressMessagesByToolUseID.get(id)?.at(-1)?.data as Record<string, unknown> | undefined;
      if (latest?.type === 'repl_tool_call' && latest.phase === 'start') {
        const input = latest.toolInput as {
          command?: string;
          pattern?: string;
          file_path?: string;
        };
        incomingHint =
          input.file_path ??
          (input.pattern ? `"${input.pattern}"` : undefined) ??
          input.command ??
          (latest.toolName as string | undefined);
      }
    }
  }

  const displayedHint = useMinDisplayTime(incomingHint, MIN_HINT_DISPLAY_MS);

  // In verbose mode, render each tool use with its 1-line result summary
  if (verbose) {
    const toolUses: NormalizedAssistantMessage[] = [];
    for (const msg of groupMessages) {
      if (msg.type === 'assistant') {
        toolUses.push(msg);
      } else if (msg.type === 'grouped_tool_use') {
        toolUses.push(...msg.messages);
      }
    }

    return (
      <Box flexDirection="column">
        {toolUses.map(msg => {
          const content = (
            msg.message.content as Array<{ type: string; id?: string; name?: string; input?: unknown }>
          )[0];
          if (content?.type !== 'tool_use') return null;
          return (
            <VerboseToolUse
              key={content.id!}
              content={content as { type: 'tool_use'; id: string; name: string; input: unknown }}
              tools={tools}
              lookups={lookups}
              inProgressToolUseIDs={inProgressToolUseIDs}
              shouldAnimate={shouldAnimate}
              theme={theme}
            />
          );
        })}
        {message.hookInfos && message.hookInfos.length > 0 && (
          <>
            <Text dimColor>
              {'  ⎿  '}Ran {message.hookCount} PreToolUse {message.hookCount === 1 ? 'hook' : 'hooks'} (
              {formatSecondsShort(message.hookTotalMs ?? 0)})
            </Text>
            {message.hookInfos.map((info, idx) => (
              <Text key={`hook-${idx}`} dimColor>
                {'     ⎿ '}
                {info.command} ({formatSecondsShort(info.durationMs ?? 0)})
              </Text>
            ))}
          </>
        )}
        {message.relevantMemories?.map(m => (
          <Box key={m.path} flexDirection="column" marginTop={1}>
            <Text dimColor>
              {'  ⎿  '}Recalled {basename(m.path)}
            </Text>
            <Box paddingLeft={5}>
              <Text>
                <Ansi>{m.content}</Ansi>
              </Text>
            </Box>
          </Box>
        ))}
      </Box>
    );
  }

  // Non-verbose mode: Show counts with blinking grey dot while active, green dot when finalized
  // Use present tense when active, past tense when finalized

  // Defensive: If all counts are 0, don't render the collapsed group
  // This shouldn't happen in normal operation, but handles edge cases
  if (!hasMemoryOps && !hasTeamMemoryOps && !hasNonMemoryOps) {
    return null;
  }

  // Find the slowest in-progress shell command in this group. BashTool yields
  // progress every second but the collapsed renderer never showed it — long
  // commands (npm install, tests) looked frozen. Shown after 2s so fast
  // commands stay clean; the ticking counter reassures that slow ones aren't stuck.
  let shellProgressSuffix = '';
  if (isFullscreenEnvEnabled() && isActiveGroup) {
    let elapsed: number | undefined;
    let lines = 0;
    for (const id of toolUseIds) {
      if (!inProgressToolUseIDs.has(id)) continue;
      const data = lookups.progressMessagesByToolUseID.get(id)?.at(-1)?.data as Record<string, unknown> | undefined;
      if (data?.type !== 'bash_progress' && data?.type !== 'powershell_progress') {
        continue;
      }
      const elapsedSec = data.elapsedTimeSeconds as number | undefined;
      const totalLines = data.totalLines as number | undefined;
      if (elapsed === undefined || (elapsedSec ?? 0) > elapsed) {
        elapsed = elapsedSec;
        lines = totalLines ?? 0;
      }
    }
    if (elapsed !== undefined && elapsed >= 2) {
      const time = formatDuration(elapsed * 1000);
      shellProgressSuffix = lines > 0 ? ` (${time} · ${lines} ${lines === 1 ? 'line' : 'lines'})` : ` (${time})`;
    }
  }

  // Build non-memory parts first (search, read, repl, mcp, bash) — these render
  // before memory so the line reads "Ran 3 bash commands, recalled 1 memory".
  const nonMemParts: React.ReactNode[] = [];

  // Git operations lead the line — they're the load-bearing outcome.
  function pushPart(key: string, verb: string, body: React.ReactNode): void {
    const isFirst = nonMemParts.length === 0;
    if (!isFirst) nonMemParts.push(<Text key={`comma-${key}`}>, </Text>);
    nonMemParts.push(
      <Text key={key}>
        {isFirst ? verb[0]!.toUpperCase() + verb.slice(1) : verb} {body}
      </Text>,
    );
  }
  if (isFullscreenEnvEnabled() && message.commits?.length) {
    const byKind = {
      committed: 'committed',
      amended: 'amended commit',
      'cherry-picked': 'cherry-picked',
    };
    for (const kind of ['committed', 'amended', 'cherry-picked'] as const) {
      const shas = message.commits.filter(c => c.kind === kind).map(c => c.sha);
      if (shas.length) {
        pushPart(kind, byKind[kind], <Text bold>{shas.join(', ')}</Text>);
      }
    }
  }
  if (isFullscreenEnvEnabled() && message.pushes?.length) {
    const branches = uniq(message.pushes.map(p => p.branch));
    pushPart('push', 'pushed to', <Text bold>{branches.join(', ')}</Text>);
  }
  if (isFullscreenEnvEnabled() && message.branches?.length) {
    const byAction = { merged: 'merged', rebased: 'rebased onto' };
    for (const b of message.branches) {
      pushPart(`br-${b.action}-${b.ref}`, byAction[b.action], <Text bold>{b.ref}</Text>);
    }
  }
  if (isFullscreenEnvEnabled() && message.prs?.length) {
    const verbs = {
      created: 'created',
      edited: 'edited',
      merged: 'merged',
      commented: 'commented on',
      closed: 'closed',
      ready: 'marked ready',
    };
    for (const pr of message.prs) {
      pushPart(
        `pr-${pr.action}-${pr.number}`,
        verbs[pr.action],
        pr.url ? <PrBadge number={pr.number} url={pr.url} bold /> : <Text bold>PR #{pr.number}</Text>,
      );
    }
  }

  if (searchCount > 0) {
    const isFirst = nonMemParts.length === 0;
    const searchVerb = isActiveGroup
      ? isFirst
        ? 'Searching for'
        : 'searching for'
      : isFirst
        ? 'Searched for'
        : 'searched for';
    if (!isFirst) {
      nonMemParts.push(<Text key="comma-s">, </Text>);
    }
    nonMemParts.push(
      <Text key="search">
        {searchVerb} <Text bold>{searchCount}</Text> {searchCount === 1 ? 'pattern' : 'patterns'}
      </Text>,
    );
  }

  if (readCount > 0) {
    const isFirst = nonMemParts.length === 0;
    const readVerb = isActiveGroup ? (isFirst ? 'Reading' : 'reading') : isFirst ? 'Read' : 'read';
    if (!isFirst) {
      nonMemParts.push(<Text key="comma-r">, </Text>);
    }
    nonMemParts.push(
      <Text key="read">
        {readVerb} <Text bold>{readCount}</Text> {readCount === 1 ? 'file' : 'files'}
      </Text>,
    );
  }

  if (listCount > 0) {
    const isFirst = nonMemParts.length === 0;
    const listVerb = isActiveGroup ? (isFirst ? 'Listing' : 'listing') : isFirst ? 'Listed' : 'listed';
    if (!isFirst) {
      nonMemParts.push(<Text key="comma-l">, </Text>);
    }
    nonMemParts.push(
      <Text key="list">
        {listVerb} <Text bold>{listCount}</Text> {listCount === 1 ? 'directory' : 'directories'}
      </Text>,
    );
  }

  if (replCount > 0) {
    const replVerb = isActiveGroup ? "REPL'ing" : "REPL'd";
    if (nonMemParts.length > 0) {
      nonMemParts.push(<Text key="comma-repl">, </Text>);
    }
    nonMemParts.push(
      <Text key="repl">
        {replVerb} <Text bold>{replCount}</Text> {replCount === 1 ? 'time' : 'times'}
      </Text>,
    );
  }

  if (mcpCallCount > 0) {
    const serverLabel = message.mcpServerNames?.map(n => n.replace(/^claude\.ai /, '')).join(', ') || 'MCP';
    const isFirst = nonMemParts.length === 0;
    const verb = isActiveGroup ? (isFirst ? 'Querying' : 'querying') : isFirst ? 'Queried' : 'queried';
    if (!isFirst) {
      nonMemParts.push(<Text key="comma-mcp">, </Text>);
    }
    nonMemParts.push(
      <Text key="mcp">
        {verb} {serverLabel}
        {mcpCallCount > 1 && (
          <>
            {' '}
            <Text bold>{mcpCallCount}</Text> times
          </>
        )}
      </Text>,
    );
  }

  if (isFullscreenEnvEnabled() && bashCount > 0) {
    const isFirst = nonMemParts.length === 0;
    const verb = isActiveGroup ? (isFirst ? 'Running' : 'running') : isFirst ? 'Ran' : 'ran';
    if (!isFirst) {
      nonMemParts.push(<Text key="comma-bash">, </Text>);
    }
    nonMemParts.push(
      <Text key="bash">
        {verb} <Text bold>{bashCount}</Text> bash {bashCount === 1 ? 'command' : 'commands'}
      </Text>,
    );
  }

  // Build memory parts (auto-memory) — rendered after nonMemParts
  const hasPrecedingNonMem = nonMemParts.length > 0;
  const memParts: React.ReactNode[] = [];

  if (memoryReadCount > 0) {
    const isFirst = !hasPrecedingNonMem && memParts.length === 0;
    const verb = isActiveGroup ? (isFirst ? 'Recalling' : 'recalling') : isFirst ? 'Recalled' : 'recalled';
    if (!isFirst) {
      memParts.push(<Text key="comma-mr">, </Text>);
    }
    memParts.push(
      <Text key="mem-read">
        {verb} <Text bold>{memoryReadCount}</Text> {memoryReadCount === 1 ? 'memory' : 'memories'}
      </Text>,
    );
  }

  if (memorySearchCount > 0) {
    const isFirst = !hasPrecedingNonMem && memParts.length === 0;
    const verb = isActiveGroup ? (isFirst ? 'Searching' : 'searching') : isFirst ? 'Searched' : 'searched';
    if (!isFirst) {
      memParts.push(<Text key="comma-ms">, </Text>);
    }
    memParts.push(<Text key="mem-search">{`${verb} memories`}</Text>);
  }

  if (memoryWriteCount > 0) {
    const isFirst = !hasPrecedingNonMem && memParts.length === 0;
    const verb = isActiveGroup ? (isFirst ? 'Writing' : 'writing') : isFirst ? 'Wrote' : 'wrote';
    if (!isFirst) {
      memParts.push(<Text key="comma-mw">, </Text>);
    }
    memParts.push(
      <Text key="mem-write">
        {verb} <Text bold>{memoryWriteCount}</Text> {memoryWriteCount === 1 ? 'memory' : 'memories'}
      </Text>,
    );
  }

  return (
    <Box flexDirection="column" marginTop={1} backgroundColor={bg}>
      <Box flexDirection="row">
        {isActiveGroup ? <ToolUseLoader shouldAnimate isUnresolved isError={anyError} /> : <Box minWidth={2} />}
        <Text dimColor={!isActiveGroup}>
          {nonMemParts}
          {memParts}
          {feature('TEAMMEM')
            ? teamMemCollapsed!.TeamMemCountParts({
                message,
                isActiveGroup,
                hasPrecedingParts: hasPrecedingNonMem || memParts.length > 0,
              })
            : null}
          {isActiveGroup && <Text key="ellipsis">…</Text>} <CtrlOToExpand />
        </Text>
      </Box>
      {isActiveGroup && displayedHint !== undefined && (
        // Row layout: 5-wide gutter for ⎿, then a flex column for the text.
        // Ink's wrap stays inside the right column so continuation lines
        // indent under ⎿. MAX_HINT_CHARS in commandAsHint caps total at ~5 lines.
        <Box flexDirection="row">
          <Box width={5} flexShrink={0}>
            <Text dimColor>{'  ⎿  '}</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1}>
            {displayedHint.split('\n').map((line, i, arr) => (
              <Text key={`hint-${i}`} dimColor>
                {line}
                {i === arr.length - 1 && shellProgressSuffix}
              </Text>
            ))}
          </Box>
        </Box>
      )}
      {message.hookTotalMs !== undefined && message.hookTotalMs > 0 && (
        <Text dimColor>
          {'  ⎿  '}Ran {message.hookCount} PreToolUse {message.hookCount === 1 ? 'hook' : 'hooks'} (
          {formatSecondsShort(message.hookTotalMs)})
        </Text>
      )}
    </Box>
  );
}
