import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  Circle,
  CircleDashed,
  FileCode2,
  FileText,
  GitCompareArrows,
  ListChecks,
  Loader2,
  ShieldAlert,
  SquareTerminal,
  TerminalSquare,
  PackageOpen,
} from 'lucide-react';
import type { PlanEntry } from '../acp/types';
import type { RuntimeTask, SessionRuntimeState, ThreadEntry, ToolCallData, ToolCallStatus } from '../lib/types';
import {
  deriveMarkdownDocs,
  derivePublishedArtifacts,
  deriveReviewFiles,
  deriveRuntimeSnapshot,
  type PublishedArtifact,
  type ReviewFile,
  type ReviewHunk,
} from '../lib/work-center-model';
import { DocsPanel } from './DocsPanel';
import type { ControlRequestResult } from '../lib/rcs-chat-adapter';
import { cn } from '../lib/utils';
import type { SessionInitInfo } from '../types';
import { TerminalPanel } from '../terminal/TerminalPanel';
import { useSessionTerminals, type TerminalMeta } from '../terminal/useSessionTerminals';
import { RuntimeCenterPanel } from './RuntimeCenterPanel';
import { ArtifactsPanel } from './ArtifactsPanel';

type WorkCenterTab = 'runtime' | 'artifacts' | 'docs' | 'review' | 'terminal';

interface WorkCenterProps {
  sessionId: string;
  entries: ThreadEntry[];
  sessionStatus: string | null;
  sessionInfo?: SessionInitInfo | null;
  runtime?: SessionRuntimeState | null;
  onControlRequest?: (subtype: string, params?: Record<string, unknown>) => Promise<ControlRequestResult>;
  onSendMessage?: (text: string) => Promise<void>;
  onInterrupt?: () => Promise<void>;
}

/**
 * Unified session work center. Every section is derived from durable session
 * events or the live terminal channel; there are no placeholder actions.
 */
export function WorkCenter({
  sessionId,
  entries,
  sessionStatus,
  sessionInfo,
  runtime: runtimeState,
  onControlRequest,
  onSendMessage,
  onInterrupt,
}: WorkCenterProps) {
  const [tab, setTab] = useState<WorkCenterTab>('runtime');
  const sessionCanRun =
    sessionStatus !== 'archived' &&
    sessionStatus !== 'inactive' &&
    sessionStatus !== 'closed' &&
    runtimeState?.workerStatus !== 'offline';
  const supportsTerminal = Boolean(
    sessionCanRun && sessionInfo?.tools?.some(tool => tool === 'Terminal' || tool === 'TerminalRead'),
  );
  const terminalApi = useSessionTerminals(sessionId, supportsTerminal);
  const runtime = useMemo(
    () => deriveRuntimeSnapshot(entries, sessionStatus, runtimeState),
    [entries, sessionStatus, runtimeState],
  );
  const reviewFiles = useMemo(() => deriveReviewFiles(entries), [entries]);
  const artifacts = useMemo(() => derivePublishedArtifacts(entries), [entries]);
  const markdownDocs = useMemo(() => deriveMarkdownDocs(entries), [entries]);
  const runningTaskToolIds = new Set(
    runtime.tasks.flatMap(task => (task.status === 'running' && task.toolUseId ? [task.toolUseId] : [])),
  );
  const runtimeOnline = runtime.phase !== 'offline';
  const runtimeActivityCount = runtimeOnline
    ? runtime.tasks.filter(task => task.status === 'running').length +
      runtime.activeTools.filter(tool => !runningTaskToolIds.has(tool.id)).length
    : 0;

  useEffect(() => {
    if (tab === 'terminal' && !supportsTerminal) setTab('runtime');
    if (tab === 'docs' && markdownDocs.length === 0) setTab('runtime');
  }, [supportsTerminal, tab, markdownDocs.length]);

  return (
    <aside className="work-center flex h-full min-w-0 flex-col overflow-hidden border-l border-border bg-surface-1">
      <div className="flex h-11 flex-shrink-0 items-stretch border-b border-border bg-surface-1 px-2">
        <WorkCenterTabButton
          active={tab === 'runtime'}
          icon={<Activity />}
          label="运行"
          count={runtimeActivityCount || undefined}
          onClick={() => setTab('runtime')}
        />
        <WorkCenterTabButton
          active={tab === 'artifacts'}
          icon={<PackageOpen />}
          label="产物"
          count={artifacts.length || undefined}
          onClick={() => setTab('artifacts')}
        />
        {markdownDocs.length > 0 && (
          <WorkCenterTabButton
            active={tab === 'docs'}
            icon={<FileText />}
            label="文档"
            count={markdownDocs.length}
            onClick={() => setTab('docs')}
          />
        )}
        <WorkCenterTabButton
          active={tab === 'review'}
          icon={<GitCompareArrows />}
          label="变更"
          count={reviewFiles.length || undefined}
          onClick={() => setTab('review')}
        />
        {supportsTerminal && (
          <WorkCenterTabButton
            active={tab === 'terminal'}
            icon={<SquareTerminal />}
            label="终端"
            count={terminalApi.terminals.length || undefined}
            onClick={() => setTab('terminal')}
          />
        )}
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'runtime' && (
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1">
              <RuntimeCenterPanel
                entries={entries}
                runtime={runtime}
                runtimeState={runtimeState}
                sessionInfo={sessionInfo}
                terminals={terminalApi.terminals}
                terminalSupported={supportsTerminal}
                onControl={onControlRequest}
                onSendMessage={onSendMessage}
                onInterrupt={onInterrupt}
              />
            </div>
          </div>
        )}
        {tab === 'artifacts' && (
          <ArtifactsPanel
            artifacts={artifacts}
            canRepublish={Boolean(sessionInfo?.tools?.some(tool => /artifact/i.test(tool)))}
            onRepublish={onSendMessage ? artifact => onSendMessage(buildRepublishRequest(artifact)) : undefined}
          />
        )}
        {tab === 'docs' && <DocsPanel docs={markdownDocs} />}
        {tab === 'review' && <ReviewPanel files={reviewFiles} />}
        {tab === 'terminal' && supportsTerminal && <TerminalPanel api={terminalApi} />}
      </div>
    </aside>
  );
}

function buildRepublishRequest(artifact: PublishedArtifact): string {
  const details = [
    `file_path=${artifact.filePath}`,
    artifact.hash ? `hash=${artifact.hash}` : null,
    artifact.ttlDays ? `ttl=${artifact.ttlDays}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  return `请使用 Artifact 工具重新发布这个产物（${details}），完成后返回新的链接和过期时间。`;
}

function WorkCenterTabButton({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex min-w-0 flex-1 items-center justify-center gap-1.5 border-b-2 px-2 font-display text-xs transition-colors',
        active
          ? 'border-brand font-medium text-text-primary'
          : 'border-transparent text-text-muted hover:text-text-primary',
      )}
    >
      <span className="h-3.5 w-3.5 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      <span>{label}</span>
      {count !== undefined && (
        <span
          className={cn(
            'min-w-4 rounded-full px-1 font-mono text-[9px] leading-4',
            active ? 'bg-brand/12 text-brand' : 'bg-surface-3 text-text-muted',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

type RuntimeData = ReturnType<typeof deriveRuntimeSnapshot>;

function RuntimePanel({
  runtime,
  terminals,
  terminalSupported,
}: {
  runtime: RuntimeData;
  terminals: TerminalMeta[];
  terminalSupported: boolean;
}) {
  const liveTerminals = terminalSupported ? terminals.filter(terminal => terminal.alive) : [];
  const mainTurnActive =
    runtime.phase === 'running_tool' || runtime.phase === 'thinking' || runtime.phase === 'waiting';
  const runningCommands = mainTurnActive
    ? runtime.commands.filter(command => command.status === 'running' || command.status === 'waiting_for_confirmation')
    : [];
  const backgroundShellTasks = runtime.tasks.filter(
    task =>
      runtime.phase !== 'offline' &&
      task.status === 'running' &&
      Boolean(task.taskType?.includes('bash') || task.taskType?.includes('shell')),
  );
  const activeProcessCount = liveTerminals.length + runningCommands.length + backgroundShellTasks.length;

  return (
    <div className="h-full overflow-y-auto px-3 py-3">
      <RuntimeStatusCard runtime={runtime} />

      {runtime.plan.length > 0 && (
        <RuntimeSection
          title="执行计划"
          icon={<ListChecks />}
          meta={`${runtime.plan.filter(item => item.status === 'completed').length}/${runtime.plan.length}`}
        >
          <PlanList items={runtime.plan} />
        </RuntimeSection>
      )}

      <RuntimeSection
        title="运行任务"
        icon={<Activity />}
        meta={
          runtime.tasks.length > 0
            ? `${
                runtime.phase === 'offline' ? 0 : runtime.tasks.filter(task => task.status === 'running').length
              } 运行中 / ${runtime.tasks.length} 已报告`
            : '暂无上报'
        }
      >
        {runtime.tasks.length === 0 ? (
          <TruthfulEmptyState text="当前没有已报告的运行任务；旧版 CLI 可能不提供任务遥测。" />
        ) : (
          <div className="space-y-1.5">
            {runtime.tasks.slice(0, 10).map(task => (
              <RuntimeTaskRow key={task.id} task={task} stale={runtime.phase === 'offline'} />
            ))}
          </div>
        )}
      </RuntimeSection>

      {runtime.agents.length > 0 && (
        <RuntimeSection title="子代理" icon={<Bot />} meta={`${runtime.agents.length} 个已报告`}>
          <div className="space-y-1.5">
            {runtime.agents.map(agent => (
              <div key={agent.id} className="rounded-lg border border-border bg-surface-2 px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <ToolStatusDot
                    status={runtime.phase === 'offline' && agent.status === 'running' ? 'canceled' : agent.status}
                  />
                  <span className="min-w-0 flex-1 truncate font-display text-[11px] font-medium text-text-primary">
                    {agent.name}
                  </span>
                  <StatusText
                    status={agent.status}
                    label={runtime.phase === 'offline' && agent.status === 'running' ? '上次上报运行中' : undefined}
                  />
                </div>
                <p className="mt-1 line-clamp-2 pl-3.5 font-display text-[10px] leading-relaxed text-text-muted">
                  {agent.description}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1 pl-3.5">
                  {agent.agentType && <RuntimeTag>{agent.agentType}</RuntimeTag>}
                  {agent.model && <RuntimeTag>{agent.model}</RuntimeTag>}
                  {agent.background && <RuntimeTag>后台</RuntimeTag>}
                  {agent.isolated && <RuntimeTag>隔离工作区</RuntimeTag>}
                </div>
              </div>
            ))}
          </div>
        </RuntimeSection>
      )}

      <RuntimeSection title="进程与终端" icon={<TerminalSquare />} meta={`${activeProcessCount} 个活动`}>
        {activeProcessCount === 0 ? (
          <TruthfulEmptyState text="当前没有活动终端、前台命令或后台 Shell 任务。" />
        ) : (
          <div className="space-y-1.5">
            {liveTerminals.map(terminal => (
              <ProcessRow key={terminal.id} title={terminal.fg_command || terminal.name} detail={terminal.cwd} live />
            ))}
            {runningCommands.map(command => (
              <ProcessRow
                key={command.id}
                title={command.command}
                detail={command.tool}
                live={command.status === 'running'}
                waiting={command.status === 'waiting_for_confirmation'}
              />
            ))}
            {backgroundShellTasks.map(task => (
              <ProcessRow key={task.id} title={task.description} detail={task.taskType || '后台 Shell 任务'} live />
            ))}
          </div>
        )}
      </RuntimeSection>

      <RuntimeSection
        title="当前回合工具事件"
        icon={<Activity />}
        meta={`${runtime.activeTools.length} 活动 / ${runtime.recentTools.length} 最近`}
      >
        {runtime.recentTools.length === 0 ? (
          <TruthfulEmptyState text="当前回合还没有工具调用。" />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface-2">
            {runtime.recentTools.map(tool => (
              <ToolActivityRow key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </RuntimeSection>
    </div>
  );
}

function RuntimeStatusCard({ runtime }: { runtime: RuntimeData }) {
  const styles: Record<RuntimeData['phase'], string> = {
    unknown: 'border-border bg-surface-2 text-text-muted',
    offline: 'border-text-muted/25 bg-surface-2 text-text-muted',
    waiting: 'border-amber-400/30 bg-amber-400/[0.08] text-amber-700 dark:text-amber-300',
    running_tool: 'border-brand/25 bg-brand/[0.07] text-brand',
    thinking: 'border-brand/25 bg-brand/[0.07] text-brand',
    idle: 'border-status-active/20 bg-status-active/[0.06] text-status-active',
  };
  const icon =
    runtime.phase === 'waiting' ? (
      <ShieldAlert />
    ) : runtime.phase === 'running_tool' || runtime.phase === 'thinking' ? (
      <Loader2 className="animate-spin" />
    ) : runtime.phase === 'offline' ? (
      <AlertTriangle />
    ) : runtime.phase === 'unknown' ? (
      <CircleDashed />
    ) : (
      <Check />
    );

  return (
    <div className={cn('rounded-xl border p-3', styles[runtime.phase])}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 h-4 w-4 flex-shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <div className="min-w-0">
          <p className="font-display text-xs font-semibold">{runtime.phaseLabel}</p>
          <p className="mt-1 line-clamp-2 font-mono text-[10px] leading-relaxed opacity-80">{runtime.phaseDetail}</p>
        </div>
      </div>
    </div>
  );
}

function RuntimeTaskRow({ task, stale }: { task: RuntimeTask; stale: boolean }) {
  const toolStatus = taskStatusToToolStatus(task.status);
  const staleRunning = stale && task.status === 'running';
  const taskLabel = task.workflowName || task.taskType || 'task';
  const detail = task.summary || task.lastToolName || task.prompt;
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <ToolStatusDot status={staleRunning ? 'canceled' : toolStatus} />
        <p className="min-w-0 flex-1 truncate font-display text-[11px] font-medium text-text-primary">
          {task.description}
        </p>
        <StatusText status={toolStatus} label={staleRunning ? '上次上报运行中' : undefined} />
      </div>
      <div className="mt-1.5 flex min-w-0 items-center gap-1.5 pl-3.5">
        <RuntimeTag>{taskLabel}</RuntimeTag>
        {task.lastToolName && <RuntimeTag>{task.lastToolName}</RuntimeTag>}
        {task.usage && (
          <span className="ml-auto flex-shrink-0 font-mono text-[8px] text-text-muted">
            {formatDuration(task.usage.durationMs)} · {task.usage.toolUses} tools · {task.usage.totalTokens} tok
          </span>
        )}
      </div>
      {detail && detail !== task.lastToolName && (
        <p className="mt-1.5 line-clamp-2 pl-3.5 font-display text-[9px] leading-relaxed text-text-muted">{detail}</p>
      )}
    </div>
  );
}

function RuntimeSection({
  title,
  icon,
  meta,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center gap-1.5 px-0.5">
        <span className="h-3.5 w-3.5 text-text-muted [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
        <h3 className="font-display text-[11px] font-medium text-text-primary">{title}</h3>
        <span className="ml-auto font-display text-[9px] text-text-muted">{meta}</span>
      </div>
      {children}
    </section>
  );
}

function PlanList({ items }: { items: PlanEntry[] }) {
  return (
    <div className="space-y-1">
      {items.map((item, index) => (
        <div key={`${item.content}-${index}`} className="flex items-start gap-2 py-1">
          <span className="mt-0.5 h-3.5 w-3.5 flex-shrink-0">
            {item.status === 'completed' ? (
              <Check className="h-3.5 w-3.5 text-status-active" />
            ) : item.status === 'in_progress' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
            ) : (
              <CircleDashed className="h-3.5 w-3.5 text-text-muted" />
            )}
          </span>
          <span
            className={cn(
              'font-display text-[11px] leading-relaxed text-text-secondary',
              item.status === 'completed' && 'text-text-muted line-through',
            )}
          >
            {item.content}
          </span>
        </div>
      ))}
    </div>
  );
}

function RuntimeTag({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[8px] text-text-muted">{children}</span>;
}

function ProcessRow({
  title,
  detail,
  live,
  waiting,
}: {
  title: string;
  detail: string;
  live: boolean;
  waiting?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-2">
      <Circle
        className={cn(
          'mt-1 h-2 w-2 flex-shrink-0 fill-current',
          waiting ? 'text-amber-500' : live ? 'animate-pulse text-status-active' : 'text-text-muted',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[10px] text-text-primary" title={title}>
          {title}
        </p>
        <p className="mt-0.5 truncate font-mono text-[9px] text-text-muted" title={detail}>
          {detail}
        </p>
      </div>
    </div>
  );
}

function ToolActivityRow({ tool }: { tool: ToolCallData }) {
  const input = tool.rawInput ?? {};
  const detail =
    stringField(input.description) ||
    stringField(input.command) ||
    stringField(input.file_path) ||
    stringField(input.path) ||
    stringField(input.prompt);
  return (
    <div className="flex items-start gap-2 px-2.5 py-2">
      <ToolStatusDot status={tool.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-[10px] font-medium text-text-primary">{tool.title}</span>
          <StatusText status={tool.status} />
        </div>
        {detail && <p className="mt-0.5 line-clamp-1 font-mono text-[9px] text-text-muted">{detail}</p>}
      </div>
    </div>
  );
}

function ToolStatusDot({ status }: { status: ToolCallStatus }) {
  return (
    <Circle
      className={cn(
        'mt-1 h-2 w-2 flex-shrink-0 fill-current',
        status === 'running' && 'animate-pulse text-brand',
        status === 'complete' && 'text-status-active',
        status === 'waiting_for_confirmation' && 'text-amber-500',
        (status === 'error' || status === 'rejected') && 'text-status-error',
        status === 'canceled' && 'text-text-muted',
      )}
    />
  );
}

function taskStatusToToolStatus(status: RuntimeTask['status']): ToolCallStatus {
  if (status === 'completed') return 'complete';
  if (status === 'failed') return 'error';
  if (status === 'stopped') return 'canceled';
  return 'running';
}

function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

const STATUS_LABELS: Record<ToolCallStatus, string> = {
  running: '运行中',
  complete: '完成',
  error: '失败',
  waiting_for_confirmation: '待确认',
  rejected: '已拒绝',
  canceled: '已取消',
};

function StatusText({ status, label }: { status: ToolCallStatus; label?: string }) {
  return (
    <span className="ml-auto flex-shrink-0 font-display text-[9px] text-text-muted">
      {label ?? STATUS_LABELS[status]}
    </span>
  );
}

function TruthfulEmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-3 py-2.5 font-display text-[10px] leading-relaxed text-text-muted">
      {text}
    </div>
  );
}

function ReviewPanel({ files }: { files: ReviewFile[] }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(files[0]?.path ?? null);

  useEffect(() => {
    if (files.length === 0) {
      setSelectedPath(null);
      return;
    }
    if (!selectedPath || !files.some(file => file.path === selectedPath)) {
      setSelectedPath(files[0]?.path ?? null);
    }
  }, [files, selectedPath]);

  const selected = files.find(file => file.path === selectedPath) ?? files[0];
  const additions = files.reduce((total, file) => total + file.additions, 0);
  const deletions = files.reduce((total, file) => total + file.deletions, 0);

  if (!selected) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <FileCode2 className="h-7 w-7 text-text-muted/50" />
        <p className="mt-3 font-display text-xs font-medium text-text-primary">当前回合没有已完成的文件操作</p>
        <p className="mt-1 font-display text-[10px] leading-relaxed text-text-muted">
          成功完成的 Edit、Write 或 NotebookEdit 会自动出现在这里。
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 flex-shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="font-display text-[10px] font-medium text-text-secondary">已完成文件操作</span>
        <span className="font-mono text-[10px] text-emerald-600">+{additions}</span>
        <span className="font-mono text-[10px] text-red-500">-{deletions}</span>
        <span className="ml-auto font-display text-[9px] text-text-muted">{files.length} 个文件</span>
      </div>
      <p className="flex-shrink-0 border-b border-border bg-surface-0/50 px-3 py-1.5 font-display text-[8px] text-text-muted">
        行数来自工具输入，不代表最终 Git 工作区净差异。
      </p>

      <div className="flex min-h-0 flex-1">
        <div className="w-[158px] flex-shrink-0 overflow-y-auto border-r border-border bg-surface-0/40 py-1.5">
          {files.map(file => (
            <button
              key={file.path}
              type="button"
              onClick={() => setSelectedPath(file.path)}
              className={cn(
                'flex w-full items-start gap-1.5 border-l-2 px-2 py-2 text-left transition-colors',
                file.path === selected.path ? 'border-brand bg-brand/[0.07]' : 'border-transparent hover:bg-surface-2',
              )}
              title={file.path}
            >
              <FileCode2 className="mt-0.5 h-3 w-3 flex-shrink-0 text-text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[9px] text-text-primary">{basename(file.path)}</p>
                <p className="mt-0.5 flex gap-1.5 font-mono text-[8px]">
                  <span className="text-emerald-600">+{file.additions}</span>
                  <span className="text-red-500">-{file.deletions}</span>
                </p>
              </div>
            </button>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto bg-surface-2">
          <div className="sticky top-0 z-10 border-b border-border bg-surface-1/95 px-3 py-2 backdrop-blur">
            <p className="truncate font-mono text-[10px] text-text-primary" title={selected.path}>
              {selected.path}
            </p>
          </div>
          <div className="pb-6">
            {selected.hunks.map((hunk, index) => (
              <DiffHunk key={`${hunk.id}-${index}`} hunk={hunk} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DiffHunk({ hunk }: { hunk: ReviewHunk }) {
  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-2 bg-surface-1 px-3 py-1.5">
        <span className="font-mono text-[9px] font-medium text-text-secondary">{hunk.tool}</span>
        <ToolStatusDot status={hunk.status} />
        <span className="ml-auto font-mono text-[8px] text-text-muted">
          +{hunk.additions} -{hunk.deletions}
        </span>
      </div>
      {hunk.oldText && <DiffLines text={hunk.oldText} kind="remove" />}
      {hunk.newText && <DiffLines text={hunk.newText} kind="add" />}
      {!hunk.oldText && !hunk.newText && (
        <p className="px-3 py-3 font-display text-[10px] text-text-muted">工具事件未携带可展示的文本内容。</p>
      )}
    </div>
  );
}

function DiffLines({ text, kind }: { text: string; kind: 'add' | 'remove' }) {
  const lines = text.split(/\r?\n/);
  const visible = lines.slice(0, 160);
  return (
    <div
      className={cn('font-mono text-[9px] leading-5', kind === 'add' ? 'bg-emerald-500/[0.09]' : 'bg-red-500/[0.09]')}
    >
      {visible.map((line, index) => (
        <div
          key={`${kind}-${index}`}
          className={cn(
            'grid grid-cols-[34px_14px_minmax(0,1fr)] border-l-2',
            kind === 'add' ? 'border-emerald-500' : 'border-red-400',
          )}
        >
          <span className="select-none pr-2 text-right text-text-muted/60">{index + 1}</span>
          <span className={cn('select-none', kind === 'add' ? 'text-emerald-600' : 'text-red-500')}>
            {kind === 'add' ? '+' : '-'}
          </span>
          <span className="overflow-x-auto whitespace-pre pr-3 text-text-secondary">{line || ' '}</span>
        </div>
      ))}
      {lines.length > visible.length && (
        <p className="border-l-2 border-text-muted/20 px-3 py-1.5 text-text-muted">
          还有 {lines.length - visible.length} 行未展开
        </p>
      )}
    </div>
  );
}

function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? path;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
