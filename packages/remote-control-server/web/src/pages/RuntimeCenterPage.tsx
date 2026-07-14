import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Bell, Bot, Clock3, RefreshCw, Server, ShieldAlert } from 'lucide-react';
import { apiSendEvent } from '../api/client';
import { generateMessageUuid } from '../lib/utils';
import { cn } from '../lib/utils';
import type { Environment, Session } from '../types';

export function RuntimeCenterPage({
  sessions,
  environments,
  onOpenSession,
}: {
  sessions: Session[];
  environments: Environment[];
  onOpenSession: (sessionId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () =>
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      localStorage.getItem('rcs-runtime-notifications') === '1',
  );
  const previousStates = useRef(new Map<string, string>());
  const active = useMemo(() => sessions.filter(session => isActive(session)), [sessions]);
  const waiting = useMemo(
    () =>
      sessions.filter(session => session.status === 'requires_action' || session.worker_status === 'requires_action'),
    [sessions],
  );
  const background = useMemo(() => sessions.filter(session => session.automation_state !== undefined), [sessions]);
  const failed = useMemo(
    () => sessions.filter(session => /error|failed|offline/.test(`${session.status} ${session.worker_status ?? ''}`)),
    [sessions],
  );
  const daemons = environments.filter(env =>
    Boolean(env.capabilities?.daemon || env.capabilities?.background_sessions),
  );

  useEffect(() => {
    const next = new Map<string, string>();
    for (const session of sessions) {
      const state = session.worker_status || session.status;
      next.set(session.id, state);
      const previous = previousStates.current.get(session.id);
      if (notificationsEnabled && previous && /running|busy/.test(previous) && !/running|busy/.test(state)) {
        new Notification(session.title || 'Claude Code 运行完成', {
          body: /error|failed|offline/.test(state) ? `运行结束：${state}` : '后台运行已经结束。',
        });
      }
    }
    previousStates.current = next;
  }, [notificationsEnabled, sessions]);

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    const enabled = permission === 'granted';
    setNotificationsEnabled(enabled);
    localStorage.setItem('rcs-runtime-notifications', enabled ? '1' : '0');
  };

  const requestRetry = async (session: Session) => {
    setBusy(session.id);
    try {
      const uuid = generateMessageUuid();
      await apiSendEvent(session.id, {
        type: 'user',
        uuid,
        content: '请检查上一次后台运行失败的原因，从安全的失败点重试，并先报告你将恢复的步骤。',
        message: { content: '请检查上一次后台运行失败的原因，从安全的失败点重试，并先报告你将恢复的步骤。' },
      });
      onOpenSession(session.id);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-5 py-8">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-medium text-text-primary">运行中心</h1>
            <p className="mt-1 text-sm text-text-muted">跨项目查看前台、后台、定时和 Daemon 运行状态。</p>
          </div>
          {typeof Notification !== 'undefined' && !notificationsEnabled && (
            <button
              type="button"
              onClick={() => void enableNotifications()}
              className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[10px] text-text-secondary hover:bg-surface-2"
            >
              <Bell className="h-3 w-3" />
              启用完成通知
            </button>
          )}
        </div>

        <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
          <Metric label="活动会话" value={active.length} icon={<Activity />} />
          <Metric label="等待处理" value={waiting.length} icon={<ShieldAlert />} />
          <Metric label="后台 / 定时" value={background.length} icon={<Clock3 />} />
          <Metric label="Daemon 环境" value={daemons.length} icon={<Server />} />
        </div>

        <RuntimeGroup title="需要处理" count={waiting.length} defaultOpen>
          {waiting.length > 0 ? (
            waiting.map(session => (
              <SessionRunRow key={session.id} session={session} onOpen={() => onOpenSession(session.id)} />
            ))
          ) : (
            <EmptyText>当前没有权限等待或人工确认。</EmptyText>
          )}
        </RuntimeGroup>

        <RuntimeGroup title="正在运行" count={active.length} defaultOpen>
          {active.length > 0 ? (
            active.map(session => (
              <SessionRunRow key={session.id} session={session} onOpen={() => onOpenSession(session.id)} />
            ))
          ) : (
            <EmptyText>当前没有活动会话。</EmptyText>
          )}
        </RuntimeGroup>

        <RuntimeGroup title="后台、Monitor 与定时任务" count={background.length}>
          {background.length > 0 ? (
            background.map(session => (
              <SessionRunRow key={session.id} session={session} automation onOpen={() => onOpenSession(session.id)} />
            ))
          ) : (
            <EmptyText>服务端尚未报告后台或定时运行。</EmptyText>
          )}
        </RuntimeGroup>

        <RuntimeGroup title="Daemon" count={daemons.length}>
          {daemons.length > 0 ? (
            daemons.map(env => (
              <div key={env.id} className="flex items-center gap-3 border-b border-border/70 py-3 last:border-0">
                <Server className="h-4 w-4 text-text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-text-primary">
                    {env.machine_name || env.device_name || env.id}
                  </p>
                  <p className="truncate font-mono text-[9px] text-text-muted">{env.directory}</p>
                </div>
                <span className={cn('text-[9px]', env.status === 'active' ? 'text-status-active' : 'text-text-muted')}>
                  {env.status}
                </span>
              </div>
            ))
          ) : (
            <EmptyText>没有环境报告 Daemon 或后台会话能力。</EmptyText>
          )}
        </RuntimeGroup>

        <RuntimeGroup title="失败与重试" count={failed.length}>
          {failed.length > 0 ? (
            failed.map(session => (
              <div key={session.id} className="flex items-center gap-3 border-b border-border/70 py-3 last:border-0">
                <Bell className="h-4 w-4 text-status-error" />
                <button type="button" onClick={() => onOpenSession(session.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[12px] text-text-primary">{session.title || session.id}</p>
                  <p className="font-mono text-[9px] text-text-muted">{session.worker_status || session.status}</p>
                </button>
                {session.status !== 'archived' && (
                  <button
                    type="button"
                    disabled={busy === session.id}
                    onClick={() => void requestRetry(session)}
                    className="inline-flex items-center gap-1 text-[10px] font-medium text-brand hover:underline disabled:opacity-40"
                  >
                    <RefreshCw className={cn('h-3 w-3', busy === session.id && 'animate-spin')} />
                    请求重试
                  </button>
                )}
              </div>
            ))
          ) : (
            <EmptyText>没有失败记录。</EmptyText>
          )}
        </RuntimeGroup>
      </div>
    </div>
  );
}

function isActive(session: Session): boolean {
  return session.status === 'running' || session.worker_status === 'running' || session.worker_status === 'busy';
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-surface-1 px-4 py-3">
      <div className="flex items-center gap-2 text-text-muted">
        <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
        <span className="text-[10px]">{label}</span>
      </div>
      <p className="mt-2 font-mono text-xl text-text-primary">{value}</p>
    </div>
  );
}

function RuntimeGroup({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-[12px] font-medium text-text-primary">{title}</h2>
        <span className="font-mono text-[9px] text-text-muted">{count}</span>
        {defaultOpen && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-status-active" />}
      </div>
      <div className="border-t border-border">{children}</div>
    </section>
  );
}

function SessionRunRow({
  session,
  automation = false,
  onOpen,
}: {
  session: Session;
  automation?: boolean;
  onOpen: () => void;
}) {
  const state = session.worker_status || session.status;
  const automationLabel = automation ? describeAutomation(session.automation_state) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 border-b border-border/70 py-3 text-left last:border-0"
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          state === 'requires_action' ? 'bg-amber-500' : isActive(session) ? 'animate-pulse bg-brand' : 'bg-text-muted',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-text-primary">{session.title || session.id}</p>
        <p className="mt-0.5 truncate font-mono text-[9px] text-text-muted">
          {automationLabel || state}
          {session.last_heartbeat_at ? ` · heartbeat ${new Date(session.last_heartbeat_at).toLocaleTimeString()}` : ''}
        </p>
      </div>
      <Bot className="h-3.5 w-3.5 text-text-muted" />
    </button>
  );
}

function describeAutomation(value: unknown): string {
  if (!value || typeof value !== 'object') return 'background session';
  const record = value as Record<string, unknown>;
  const kind = [record.kind, record.type, record.name].find(item => typeof item === 'string');
  const status = [record.status, record.state].find(item => typeof item === 'string');
  return [kind, status].filter(Boolean).join(' · ') || 'background session';
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-[11px] text-text-muted">{children}</p>;
}
