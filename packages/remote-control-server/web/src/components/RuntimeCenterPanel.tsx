import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDashed,
  FileCode2,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Square,
  Trash2,
} from 'lucide-react';
import type { SessionInitInfo } from '../types';
import type { RuntimeWorkflowRun, SessionRuntimeState, ThreadEntry, ToolCallData } from '../lib/types';
import type { deriveRuntimeSnapshot, RuntimeAgent } from '../lib/work-center-model';
import type { ControlRequestResult } from '../lib/rcs-chat-adapter';
import { cn } from '../lib/utils';
import type { TerminalMeta } from '../terminal/useSessionTerminals';
import { AgentDetailDialog } from './AgentDetailDialog';
import { PromptInspector } from './PromptInspector';

type RuntimeData = ReturnType<typeof deriveRuntimeSnapshot>;

interface RuntimeCenterPanelProps {
  entries: ThreadEntry[];
  runtime: RuntimeData;
  runtimeState?: SessionRuntimeState | null;
  sessionInfo?: SessionInitInfo | null;
  terminals: TerminalMeta[];
  terminalSupported: boolean;
  onControl?: (subtype: string, params?: Record<string, unknown>) => Promise<ControlRequestResult>;
  onSendMessage?: (text: string) => Promise<void>;
  onInterrupt?: () => Promise<void>;
}

export function RuntimeCenterPanel({
  entries,
  runtime,
  runtimeState,
  sessionInfo,
  terminals,
  terminalSupported,
  onControl,
  onSendMessage,
  onInterrupt,
}: RuntimeCenterPanelProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  // 弹窗跟随最新 runtime 数据；agent 被裁剪出列表后保留点击时的快照。
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentSnapshot, setAgentSnapshot] = useState<RuntimeAgent | null>(null);
  const selectedAgent = selectedAgentId
    ? (runtime.agents.find(agent => agent.id === selectedAgentId) ?? agentSnapshot)
    : null;
  const workflowRuns = useMemo(
    () => Object.values(runtimeState?.workflowRuns ?? {}).sort((a, b) => b.updatedAt - a.updatedAt),
    [runtimeState?.workflowRuns],
  );
  const browserActivity = useMemo(() => deriveBrowserActivity(entries), [entries]);
  const liveTerminals = terminalSupported ? terminals.filter(item => item.alive) : [];

  const runControl = async (key: string, subtype: string, params: Record<string, unknown> = {}) => {
    if (!onControl) return;
    setActionError(null);
    setBusyAction(key);
    try {
      const result = await onControl(subtype, params);
      if (!result.ok) setActionError(result.error);
    } finally {
      setBusyAction(null);
    }
  };

  const requestAction = async (key: string, message: string) => {
    if (!onSendMessage) return;
    setActionError(null);
    setBusyAction(key);
    try {
      await onSendMessage(message);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '请求发送失败');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-surface-1">
      {runtimeState?.goal && <GoalConsole goal={runtimeState.goal} busyAction={busyAction} onControl={runControl} />}

      {actionError && (
        <div className="mx-3 mt-3 flex items-start gap-2 rounded-md bg-red-500/[0.07] px-2.5 py-2 text-[10px] text-status-error">
          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <QuietSection
        title="Progress"
        meta={`${runtime.plan.filter(item => item.status === 'completed').length}/${runtime.plan.length}`}
        defaultOpen
      >
        {runtime.plan.length > 0 ? (
          <ol className="space-y-2">
            {runtime.plan.map((item, index) => (
              <li
                key={`${item.content}-${index}`}
                className="grid grid-cols-[18px_minmax(0,1fr)] gap-2 text-[11px] leading-5"
              >
                <span
                  className={cn(
                    'flex h-[18px] w-[18px] items-center justify-center rounded-full border font-mono text-[9px]',
                    item.status === 'completed' && 'border-status-active/40 bg-status-active/[0.08] text-status-active',
                    item.status === 'in_progress' && 'border-brand/40 bg-brand/[0.08] text-brand',
                    item.status === 'pending' && 'border-border text-text-muted',
                  )}
                >
                  {item.status === 'completed' ? <Check className="h-2.5 w-2.5" /> : index + 1}
                </span>
                <span
                  className={cn('text-text-secondary', item.status === 'completed' && 'text-text-muted line-through')}
                >
                  {item.content}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyLine>当前回合尚未发布执行计划。</EmptyLine>
        )}
      </QuietSection>

      {(workflowRuns.length > 0 || (runtimeState?.namedWorkflows.length ?? 0) > 0) && (
        <QuietSection
          title="Workflows"
          meta={`${workflowRuns.filter(run => run.status === 'running').length} running`}
          defaultOpen={workflowRuns.some(run => run.status === 'running')}
        >
          <div className="space-y-3">
            {workflowRuns.map(run => (
              <WorkflowRunView
                key={run.runId}
                run={run}
                runsDirectory={runtimeState?.workflowRunsDirectory ?? null}
                busyAction={busyAction}
                onControl={runControl}
                onRequest={requestAction}
              />
            ))}
            {(runtimeState?.namedWorkflows.length ?? 0) > 0 && (
              <div className="border-t border-border/70 pt-2">
                <p className="mb-1.5 text-[9px] uppercase tracking-[0.1em] text-text-muted">Available</p>
                {runtimeState?.namedWorkflows.map(name => (
                  <div key={name} className="flex items-center gap-2 py-1">
                    <FileCode2 className="h-3 w-3 text-text-muted" />
                    <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-text-secondary">{name}</span>
                    <TextAction
                      disabled={!onSendMessage || busyAction === `launch:${name}`}
                      onClick={() =>
                        requestAction(
                          `launch:${name}`,
                          `请使用 Workflow 工具启动命名工作流“${name}”，启动后报告 runId。`,
                        )
                      }
                    >
                      启动
                    </TextAction>
                  </div>
                ))}
              </div>
            )}
          </div>
        </QuietSection>
      )}

      <QuietSection
        title="Agents & processes"
        meta={`${runtime.agents.filter(agent => agent.status === 'running').length + liveTerminals.length} active`}
        defaultOpen={runtime.agents.some(agent => agent.status === 'running')}
      >
        {runtime.agents.length === 0 && liveTerminals.length === 0 ? (
          <EmptyLine>没有活动的子 Agent 或终端进程。</EmptyLine>
        ) : (
          <div className="space-y-1">
            {runtime.agents.map(agent => (
              <button
                key={agent.id}
                type="button"
                onClick={() => {
                  setAgentSnapshot(agent);
                  setSelectedAgentId(agent.id);
                }}
                title="点击查看子代理详情"
                className={cn(
                  'flex w-full items-start gap-2 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-surface-2',
                  agent.parentId && 'ml-4 border-l border-border pl-3',
                )}
              >
                <TreeStatus running={agent.status === 'running'} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Bot className="h-3 w-3 text-text-muted" />
                    <span className="truncate text-[10px] font-medium text-text-primary">{agent.name}</span>
                    <ChevronRight className="ml-auto h-3 w-3 flex-shrink-0 text-text-muted/60" />
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[9px] leading-4 text-text-muted">{agent.description}</p>
                  <p className="mt-0.5 font-mono text-[8px] text-text-muted">
                    {[
                      agent.parentId
                        ? `parent ${agent.parentId}`
                        : agent.agentType?.includes('coordinator')
                          ? 'Coordinator worker'
                          : null,
                      agent.agentType,
                      agent.model,
                      agent.background ? 'background' : null,
                      agent.isolated ? 'worktree' : null,
                      agent.usage ? `${agent.usage.toolUses} tools · ${agent.usage.totalTokens} tok` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {agent.worktreePath && (
                    <p className="mt-0.5 truncate font-mono text-[8px] text-text-muted">{agent.worktreePath}</p>
                  )}
                </div>
              </button>
            ))}
            {liveTerminals.map(terminal => (
              <div key={terminal.id} className="flex items-start gap-2 py-1.5">
                <TreeStatus running />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[10px] text-text-primary">
                    {terminal.fg_command || terminal.name}
                  </p>
                  <p className="truncate font-mono text-[8px] text-text-muted">{terminal.cwd}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </QuietSection>

      {browserActivity.length > 0 && (
        <QuietSection title="Browser & Computer Use" meta={`${browserActivity.length} events`} defaultOpen>
          <div className="space-y-2">
            {browserActivity.slice(0, 8).map(item => (
              <div key={item.id} className="overflow-hidden rounded-md border border-border/70">
                {item.imageUrl && (
                  <img src={item.imageUrl} alt="Computer Use 截图" className="block aspect-video w-full object-cover" />
                )}
                <div className="flex items-start gap-2 px-2 py-1.5">
                  <TreeStatus running={item.status === 'running'} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[9px] text-text-primary">{item.title}</p>
                    {item.detail && <p className="truncate text-[8px] text-text-muted">{item.detail}</p>}
                  </div>
                </div>
              </div>
            ))}
            {onInterrupt && browserActivity.some(item => item.status === 'running') && (
              <button
                type="button"
                onClick={() => void onInterrupt()}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-status-error/30 px-2 py-1.5 text-[10px] text-status-error hover:bg-red-500/[0.05]"
              >
                <Square className="h-3 w-3 fill-current" />
                停止并接管
              </button>
            )}
          </div>
        </QuietSection>
      )}

      <QuietSection title="Prompts" meta={runtime.phase === 'offline' ? '离线' : '原文'} defaultOpen>
        <PromptInspector onControl={onControl} offline={runtime.phase === 'offline'} />
      </QuietSection>

      <QuietSection title="Context" meta={runtime.phaseLabel}>
        <div className="space-y-2 text-[10px]">
          <ContextRow
            label="Connection"
            value={runtime.phaseDetail}
            tone={runtime.phase === 'offline' ? 'muted' : 'live'}
          />
          {sessionInfo?.cwd && <ContextRow label="Working folder" value={sessionInfo.cwd} mono />}
          {sessionInfo?.model && <ContextRow label="Model" value={sessionInfo.model} mono />}
          {sessionInfo?.permissionMode && <ContextRow label="Permissions" value={sessionInfo.permissionMode} />}
          {sessionInfo?.version && <ContextRow label="Claude Code" value={sessionInfo.version} mono />}
          <CapabilityList sessionInfo={sessionInfo} terminalSupported={terminalSupported} />
          {(sessionInfo?.mcpServers?.length ?? 0) > 0 && <McpServerList servers={sessionInfo!.mcpServers!} />}
          {(sessionInfo?.skills?.length ?? 0) > 0 && (
            <ChipList label={`Skills (${sessionInfo!.skills!.length})`} items={sessionInfo!.skills!} />
          )}
          {(sessionInfo?.plugins?.length ?? 0) > 0 && (
            <ChipList
              label={`Plugins (${sessionInfo!.plugins!.length})`}
              items={sessionInfo!.plugins!.map(plugin => plugin.name)}
            />
          )}
        </div>
      </QuietSection>

      <AgentDetailDialog
        agent={selectedAgent}
        onClose={() => {
          setSelectedAgentId(null);
          setAgentSnapshot(null);
        }}
      />
    </div>
  );
}

function McpServerList({ servers }: { servers: NonNullable<SessionInitInfo['mcpServers']> }) {
  return (
    <div>
      <p className="mb-1.5 text-[9px] uppercase tracking-[0.1em] text-text-muted">MCP servers ({servers.length})</p>
      <div className="space-y-1">
        {servers.map(server => (
          <div key={server.name} className="flex items-center gap-1.5">
            <span
              className={cn(
                'h-1.5 w-1.5 flex-shrink-0 rounded-full',
                server.status === 'connected'
                  ? 'bg-status-active'
                  : server.status === 'failed'
                    ? 'bg-status-error'
                    : 'bg-text-muted',
              )}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-text-secondary">{server.name}</span>
            <span className="flex-shrink-0 text-[8px] text-text-muted">{server.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChipList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1.5 text-[9px] uppercase tracking-[0.1em] text-text-muted">{label}</p>
      <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
        {items.map(item => (
          <span key={item} className="rounded border border-border px-1.5 py-0.5 text-[8px] text-text-secondary">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function GoalConsole({
  goal,
  busyAction,
  onControl,
}: {
  goal: NonNullable<SessionRuntimeState['goal']>;
  busyAction: string | null;
  onControl: (key: string, subtype: string, params?: Record<string, unknown>) => Promise<void>;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (goal.status !== 'active') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [goal.status]);
  const elapsed = goal.activeElapsedMs + (goal.status === 'active' ? Math.max(0, now - goal.updatedAt) : 0);
  const canPause = goal.status === 'active';
  const canResume = goal.status === 'paused';
  const canContinue = goal.status === 'max_turns';
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-surface-1 px-3 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-center gap-2">
        <span
          className={cn('h-2 w-2 rounded-full', goal.status === 'active' ? 'animate-pulse bg-brand' : 'bg-text-muted')}
        />
        <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted">Goal</span>
        <span className="ml-auto text-[9px] text-text-muted">{goalStatusLabel(goal.status)}</span>
      </div>
      <p className="mt-2 line-clamp-3 text-[12px] font-medium leading-5 text-text-primary">{goal.objective}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[9px] text-text-muted">
        <span>{formatDuration(elapsed)}</span>
        <span>
          {goal.tokensUsed.toLocaleString()}
          {goal.tokenBudget ? ` / ${goal.tokenBudget.toLocaleString()}` : ''} tok
        </span>
        <span className="text-right">{goal.turnsExecuted} turns</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        {canPause && (
          <IconAction label="暂停目标" disabled={busyAction === 'goal'} onClick={() => onControl('goal', 'goal_pause')}>
            <Pause />
          </IconAction>
        )}
        {canResume && (
          <IconAction
            label="恢复目标"
            disabled={busyAction === 'goal'}
            onClick={() => onControl('goal', 'goal_resume')}
          >
            <Play />
          </IconAction>
        )}
        {canContinue && (
          <IconAction
            label="继续目标"
            disabled={busyAction === 'goal'}
            onClick={() => onControl('goal', 'goal_continue')}
          >
            <RotateCcw />
          </IconAction>
        )}
        <IconAction label="清除目标" disabled={busyAction === 'goal'} onClick={() => onControl('goal', 'goal_clear')}>
          <Trash2 />
        </IconAction>
      </div>
    </div>
  );
}

function WorkflowRunView({
  run,
  runsDirectory,
  busyAction,
  onControl,
  onRequest,
}: {
  run: RuntimeWorkflowRun;
  runsDirectory: string | null;
  busyAction: string | null;
  onControl: (key: string, subtype: string, params?: Record<string, unknown>) => Promise<void>;
  onRequest: (key: string, message: string) => Promise<void>;
}) {
  const phases =
    run.declaredPhases.length > 0
      ? run.declaredPhases.map(
          title => run.phases.find(phase => phase.title === title) ?? { title, status: 'pending' as const },
        )
      : run.phases;
  const journalPath = runsDirectory ? `${runsDirectory}/${run.runId}/journal.jsonl` : null;
  const runningAgents = run.agents.filter(agent => agent.status === 'running').length;
  const totalTokens = run.agents.reduce((total, agent) => total + (agent.tokenCount ?? 0), 0);
  const totalTools = run.agents.reduce((total, agent) => total + (agent.toolCount ?? 0), 0);
  return (
    <div className="border-l border-border pl-3">
      <div className="flex items-center gap-2">
        <TreeStatus running={run.status === 'running'} error={run.status === 'failed'} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-medium text-text-primary">{run.workflowName}</p>
          <p className="truncate font-mono text-[8px] text-text-muted">
            {run.runId} · {run.status} · {runningAgents}/{run.agentCount} concurrent · {totalTokens} tok · {totalTools}{' '}
            tools
          </p>
        </div>
      </div>
      <div className="ml-1 mt-2 space-y-1 border-l border-border/70 pl-3">
        {phases.map(phase => (
          <div key={phase.title}>
            <div className="flex items-center gap-2 py-0.5 text-[9px] text-text-secondary">
              {phase.status === 'done' ? (
                <Check className="h-3 w-3 text-status-active" />
              ) : phase.status === 'running' ? (
                <Loader2 className="h-3 w-3 animate-spin text-brand" />
              ) : (
                <CircleDashed className="h-3 w-3 text-text-muted" />
              )}
              <span>{phase.title}</span>
            </div>
            {run.agents
              .filter(agent => agent.phase === phase.title)
              .map(agent => (
                <div key={agent.id} className="ml-5 flex items-center gap-2 py-0.5 text-[8px] text-text-muted">
                  <Circle
                    className={cn(
                      'h-1.5 w-1.5 fill-current',
                      agent.status === 'running' ? 'animate-pulse text-brand' : 'text-status-active',
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{agent.label || `Agent ${agent.id}`}</span>
                  {(agent.tokenCount !== undefined || agent.toolCount !== undefined) && (
                    <span className="font-mono">
                      {agent.tokenCount ?? 0} tok · {agent.toolCount ?? 0} tools
                    </span>
                  )}
                  {agent.status === 'running' && (
                    <TextAction
                      disabled={busyAction === `agent:${run.runId}:${agent.id}`}
                      onClick={() =>
                        onControl(`agent:${run.runId}:${agent.id}`, 'workflow_kill_agent', {
                          run_id: run.runId,
                          agent_id: agent.id,
                        })
                      }
                    >
                      停止
                    </TextAction>
                  )}
                </div>
              ))}
          </div>
        ))}
      </div>
      {run.error && <p className="mt-2 text-[9px] leading-4 text-status-error">{run.error}</p>}
      {run.returnValue !== undefined && (
        <p className="mt-2 line-clamp-3 rounded bg-surface-2 px-2 py-1.5 font-mono text-[8px] leading-4 text-text-muted">
          {formatRunOutput(run.returnValue)}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {run.status === 'running' && (
          <TextAction
            disabled={busyAction === `kill:${run.runId}`}
            onClick={() => onControl(`kill:${run.runId}`, 'workflow_kill', { run_id: run.runId })}
          >
            终止
          </TextAction>
        )}
        {run.status === 'failed' && (
          <TextAction
            disabled={busyAction === `resume:${run.runId}`}
            onClick={() =>
              onRequest(
                `resume:${run.runId}`,
                `请使用 Workflow 工具从失败的 runId “${run.runId}” 恢复执行，并报告新的状态。`,
              )
            }
          >
            从失败点恢复
          </TextAction>
        )}
        {run.status !== 'running' && (
          <TextAction
            disabled={busyAction === `replay:${run.runId}`}
            onClick={() =>
              onRequest(
                `replay:${run.runId}`,
                `请使用 Workflow 工具重放 runId “${run.runId}” 对应的工作流，并报告新 runId。`,
              )
            }
          >
            重放
          </TextAction>
        )}
        {journalPath && (
          <TextAction
            disabled={busyAction === `journal:${run.runId}`}
            onClick={() => onRequest(`journal:${run.runId}`, `请读取并总结 Workflow journal：${journalPath}`)}
          >
            查看 journal
          </TextAction>
        )}
      </div>
    </div>
  );
}

function QuietSection({
  title,
  meta,
  defaultOpen = false,
  children,
}: {
  title: string;
  meta?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-border/80">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-center gap-2 px-3 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-text-muted" />
        )}
        <span className="text-[11px] font-medium text-text-primary">{title}</span>
        {meta && <span className="ml-auto text-[9px] text-text-muted">{meta}</span>}
      </button>
      {open && <div className="px-4 pb-4 pl-8">{children}</div>}
    </section>
  );
}

function CapabilityList({
  sessionInfo,
  terminalSupported,
}: {
  sessionInfo?: SessionInitInfo | null;
  terminalSupported: boolean;
}) {
  const toolNames = sessionInfo?.tools ?? [];
  const reported = sessionInfo?.capabilities ?? {};
  const capabilities = [
    ['ACP', reported.acp === true],
    ['Terminal', terminalSupported || reported.terminal === true],
    ['Browser', reported.browser === true || toolNames.some(name => /browser|chrome/i.test(name))],
    ['Computer Use', reported.computer_use === true || toolNames.some(name => /computer/i.test(name))],
    ['Channels', reported.channels === true || toolNames.some(name => /channel|message/i.test(name))],
    ['Workflow', reported.workflows === true],
    ['Goal', reported.goal === true],
  ] as const;
  return (
    <div>
      <p className="mb-1.5 text-[9px] uppercase tracking-[0.1em] text-text-muted">Capabilities</p>
      <div className="flex flex-wrap gap-1.5">
        {capabilities.map(([name, enabled]) => (
          <span
            key={name}
            className={cn(
              'rounded border border-border px-1.5 py-0.5 text-[8px]',
              enabled ? 'text-text-secondary' : 'text-text-muted/60 line-through',
            )}
            title={enabled ? '可用' : '当前会话未报告'}
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

function ContextRow({
  label,
  value,
  mono = false,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'live' | 'muted';
}) {
  return (
    <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-2">
      <span className="text-text-muted">{label}</span>
      <span
        className={cn(
          'min-w-0 break-words text-text-secondary',
          mono && 'font-mono text-[9px]',
          tone === 'live' && 'text-status-active',
          tone === 'muted' && 'text-text-muted',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function IconAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text-muted hover:bg-surface-2 hover:text-text-primary disabled:opacity-40 [&>svg]:h-3.5 [&>svg]:w-3.5"
    >
      {children}
    </button>
  );
}

function TextAction({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="text-[9px] font-medium text-brand hover:underline disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function TreeStatus({ running, error = false }: { running: boolean; error?: boolean }) {
  return (
    <span
      className={cn(
        'mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full',
        error ? 'bg-status-error' : running ? 'animate-pulse bg-brand' : 'bg-status-active',
      )}
    />
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] leading-5 text-text-muted">{children}</p>;
}

function goalStatusLabel(status: NonNullable<SessionRuntimeState['goal']>['status']): string {
  return {
    active: '运行中',
    paused: '已暂停',
    blocked: '受阻',
    budget_limited: '预算已用尽',
    usage_limited: '额度受限',
    max_turns: '达到轮数上限',
    complete: '已完成',
  }[status];
}

function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.floor(durationMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatRunOutput(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

interface BrowserActivity {
  id: string;
  title: string;
  detail?: string;
  status: ToolCallData['status'];
  imageUrl?: string;
}

function deriveBrowserActivity(entries: ThreadEntry[]): BrowserActivity[] {
  return entries
    .flatMap(entry => {
      if (entry.type !== 'tool_call') return [];
      const tool = entry.toolCall;
      if (!/browser|chrome|computer/i.test(tool.title)) return [];
      const input = tool.rawInput ?? {};
      const detail = [input.url, input.app, input.application, input.action, input.command].find(
        (value): value is string => typeof value === 'string' && value.length > 0,
      );
      return [{ id: tool.id, title: tool.title, detail, status: tool.status, imageUrl: findImageUrl(tool.rawOutput) }];
    })
    .slice(-12)
    .reverse();
}

function findImageUrl(value: unknown, depth = 0): string | undefined {
  if (depth > 6 || value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    if (value.startsWith('data:image/')) return value;
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageUrl(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const data =
    typeof record.data === 'string' ? record.data : typeof record.base64 === 'string' ? record.base64 : undefined;
  const mime =
    typeof record.media_type === 'string'
      ? record.media_type
      : typeof record.mimeType === 'string'
        ? record.mimeType
        : 'image/jpeg';
  if (data && data.length > 100) return `data:${mime};base64,${data}`;
  for (const item of Object.values(record)) {
    const found = findImageUrl(item, depth + 1);
    if (found) return found;
  }
  return undefined;
}
