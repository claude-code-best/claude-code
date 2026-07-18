import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetchSession, apiSendControl } from '../api/client';
import { takePendingMessage, takePendingModel } from '../shell/createSession';
import type { Environment, Product, Session, SessionInitInfo, SessionModelSelection, TokenUsageTotals } from '../types';
import { isClosedSessionStatus } from '../lib/utils';
import { WorkCenter } from '../components/TaskPanel';
import { RCSChatAdapter } from '../lib/rcs-chat-adapter';
import type { ThreadEntry, PendingPermission, SessionRuntimeState } from '../lib/types';
import { cn } from '../lib/utils';
import { StatusBadge } from '../components/Navbar';
import { SessionActions } from '../components/SessionActions';
import { SessionControlBar } from '../components/SessionControlBar';
import { buildCommandCatalog } from '../lib/slash-commands';
import { PermissionPromptView, AskUserPanelView, PlanPanelView } from '../components/PermissionViews';
import { useProviderCatalog } from '../hooks/useProviderCatalog';
import { parseProviderModelCatalog } from '../lib/provider-catalog-model';
import { buildSessionModelOptions, type SessionModelOption } from '../lib/session-model-options';

// Unified chat components
import { ChatView } from '../../components/chat/ChatView';
import { ChatInput } from '../../components/chat/ChatInput';
import { TooltipProvider } from '../../components/ui/tooltip';

// ACP chat components
import { ACPClient, DisconnectRequestedError } from '../acp/client';
import { createRelayClient } from '../acp/relay-client';
import { ACPMain } from '../../components/ACPMain';

interface SessionDetailProps {
  sessionId: string;
  expectedProduct?: Product;
  environments?: Environment[];
  /** 返回上一级（新外壳传入）；缺省跳转 /code/ */
  onBack?: () => void;
  onChanged?: () => void | Promise<void>;
  onDeleted?: () => void | Promise<void>;
}

export function SessionDetail({
  sessionId,
  expectedProduct,
  environments = [],
  onBack,
  onChanged,
  onDeleted,
}: SessionDetailProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [workCenterWidth, setWorkCenterWidth] = useState(360);
  const [entries, setEntries] = useState<ThreadEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermission[]>([]);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<SessionInitInfo | null>(null);
  const [usage, setUsage] = useState<TokenUsageTotals | null>(null);
  const [runtime, setRuntime] = useState<SessionRuntimeState | null>(null);
  const [readySessionId, setReadySessionId] = useState<string | null>(null);
  const adapterRef = useRef<RCSChatAdapter | null>(null);
  const runtimeEnvironmentId = session?.runtime_environment_id ?? session?.environment_id ?? null;
  const remoteProviderCatalog = useProviderCatalog(runtimeEnvironmentId);
  const embeddedProviderCatalog = useMemo(() => {
    const environment = environments.find(candidate => candidate.id === runtimeEnvironmentId);
    const value = environment?.capabilities?.provider_model_catalog_v1;
    if (value === undefined) return null;
    try {
      return parseProviderModelCatalog(value);
    } catch {
      return null;
    }
  }, [environments, runtimeEnvironmentId]);
  const providerCatalog = remoteProviderCatalog.catalog ?? embeddedProviderCatalog;
  const providerCatalogStale =
    remoteProviderCatalog.stale || (embeddedProviderCatalog !== null && remoteProviderCatalog.catalog === null);

  // Create RCSChatAdapter
  const adapter = useMemo(
    () =>
      new RCSChatAdapter(sessionId, setEntries, {
        onStatusChange: status => {
          setSessionStatus(status);
          if (isClosedSessionStatus(status)) adapterRef.current?.disconnect();
        },
        onError: err => {
          console.error('[RCSChatAdapter] error:', err);
        },
        onPermissionsChange: permissions => {
          setPermissionError(null);
          setPendingPermissions(permissions);
        },
        onSessionInfo: info => setSessionInfo(info),
        onUsage: totals => setUsage(totals),
        onRuntimeChange: nextRuntime => {
          setRuntime(nextRuntime);
          if (nextRuntime.workerStatus === 'offline') {
            setIsLoading(false);
          } else if (nextRuntime.turnState !== 'unknown') {
            setIsLoading(nextRuntime.turnState === 'running');
          }
        },
      }),
    [sessionId],
  );

  // 斜杠命令目录 — CLI system/init 下发的动态列表优先，否则静态兜底
  const commands = useMemo(() => buildCommandCatalog(sessionInfo?.slashCommands), [sessionInfo?.slashCommands]);

  useEffect(() => {
    adapterRef.current = adapter;
    return () => {
      adapter.disconnect();
    };
  }, [adapter]);

  // Load session data and initialize adapter
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setError('');
      setSessionInfo(null);
      setUsage(null);
      setRuntime(null);
      setPendingPermissions([]);
      setPermissionError(null);
      setReadySessionId(null);

      let sess: Session;
      try {
        sess = await apiFetchSession(sessionId, controller.signal);
        if (cancelled) return;
        if (expectedProduct && sess.product && sess.product !== expectedProduct) {
          setError(`该会话属于 ${sess.product === 'chat' ? 'Chat' : 'Code'}，无法从当前产品打开`);
          return;
        }
        setSession(sess);
        setSessionStatus(sess.status);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load session');
        return;
      }

      try {
        const initialized = await adapter.init(controller.signal, {
          live: !isClosedSessionStatus(sess.status),
        });
        if (!initialized || cancelled) return;
        setReadySessionId(sessionId);
      } catch (err) {
        if (controller.signal.aborted || cancelled) return;
        console.warn('Failed to init adapter:', err);
        return;
      }

      // 新外壳创建会话时暂存的首条消息 — adapter 就绪后自动发送
      const pending = isClosedSessionStatus(sess.status) ? null : takePendingMessage(sessionId);
      if (pending) {
        setIsLoading(true);
        try {
          await adapter.sendMessage(pending);
        } catch (err) {
          console.error('Failed to send pending message:', err);
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sessionId, adapter, expectedProduct]);

  const closed = isClosedSessionStatus(sessionStatus);
  const adapterReady = readySessionId === sessionId;
  const sessionCanRunControls =
    adapterReady &&
    !closed &&
    sessionStatus !== 'inactive' &&
    sessionStatus !== 'closed' &&
    sessionStatus !== 'error' &&
    runtime?.workerStatus !== 'offline';
  // Send message via ChatInput
  const handleSubmit = useCallback(
    async (message: import('../../src/lib/types').ChatInputMessage) => {
      const text = message.text.trim();
      if (!text || closed) return;
      setIsLoading(true);
      try {
        await adapter.sendMessage(text, message.images);
      } catch (err) {
        console.error('Send failed:', err);
        setIsLoading(false);
      }
    },
    [adapter, closed],
  );

  // Interrupt
  const handleInterrupt = useCallback(async () => {
    try {
      await adapter.interrupt();
    } catch (err) {
      console.error('Interrupt failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [adapter]);

  // 会话控制条 — SDK control_request 直达 CLI
  const handleSetPermissionMode = useCallback((mode: string) => adapter.setPermissionMode(mode), [adapter]);
  const handleSetModel = useCallback((model: string | null) => adapter.setModel(model), [adapter]);
  const handleSetProviderModel = useCallback(
    async (model: SessionModelOption, revision: number) => {
      const result = await adapter.setProviderModel({
        providerId: model.providerId,
        modelProfileId: model.modelProfileId,
        providerConfigRevision: revision,
      });
      if (!result.ok) {
        if (result.error === 'provider_revision_conflict') void remoteProviderCatalog.refresh();
        return result;
      }
      const confirmed = confirmedModelSelection(result.data, model, revision);
      if (!confirmed) return { ok: false as const, error: 'Worker 返回了无效的模型确认' };
      setSession(current => (current ? { ...current, model_selection: confirmed } : current));
      try {
        const authoritative = await apiFetchSession(sessionId);
        setSession(authoritative);
      } catch {
        // 已收到 Worker 的成功确认；详情刷新失败不回滚已激活模型。
      }
      return result;
    },
    [adapter, remoteProviderCatalog, sessionId],
  );
  const handleSetThinking = useCallback(
    (maxTokens: number | null) => adapter.setMaxThinkingTokens(maxTokens),
    [adapter],
  );
  const handleRuntimeControl = useCallback(
    (subtype: string, params: Record<string, unknown> = {}) => adapter.sendControlRequest(subtype, params),
    [adapter],
  );
  const handleWorkCenterMessage = useCallback(
    async (text: string) => {
      if (closed || !adapterReady) throw new Error('当前会话不可执行');
      setIsLoading(true);
      try {
        await adapter.sendMessage(text);
      } catch (err) {
        setIsLoading(false);
        throw err;
      }
    },
    [adapter, adapterReady, closed],
  );

  // CodeHome 选择的模型通过 sessionStorage 暂存，adapter 与模型目录就绪后应用到本会话
  const pendingModelAppliedRef = useRef(false);
  useEffect(() => {
    pendingModelAppliedRef.current = false;
  }, [sessionId]);
  useEffect(() => {
    if (pendingModelAppliedRef.current) return;
    if (!adapterReady || !providerCatalog) return;
    const pending = takePendingModel(sessionId);
    pendingModelAppliedRef.current = true;
    if (!pending || providerCatalog.features.runtimeSwitch !== true) return;
    const match = buildSessionModelOptions(providerCatalog).find(
      option => option.providerId === pending.providerId && option.modelProfileId === pending.modelProfileId,
    );
    if (match) void handleSetProviderModel(match, providerCatalog.revision);
  }, [adapterReady, providerCatalog, sessionId, handleSetProviderModel]);

  // Permission actions
  const handleApprovePermission = useCallback(
    async (requestId: string) => {
      setPermissionError(null);
      try {
        await adapter.respondPermission(requestId, true);
        setPendingPermissions(prev => prev.filter(p => p.requestId !== requestId));
      } catch (err) {
        console.error('Failed to approve:', err);
        setPermissionError(err instanceof Error ? err.message : '批准失败，请重试');
      }
    },
    [adapter],
  );

  const handleRejectPermission = useCallback(
    async (requestId: string) => {
      setPermissionError(null);
      try {
        await adapter.respondPermission(requestId, false);
        setPendingPermissions(prev => prev.filter(p => p.requestId !== requestId));
      } catch (err) {
        console.error('Failed to reject:', err);
        setPermissionError(err instanceof Error ? err.message : '拒绝失败，请重试');
      }
    },
    [adapter],
  );

  const handleSubmitAnswers = useCallback(
    async (requestId: string, answers: Record<string, unknown>, questions: import('../types').Question[]) => {
      setPermissionError(null);
      try {
        await apiSendControl(sessionId, {
          type: 'permission_response',
          approved: true,
          request_id: requestId,
          updated_input: { questions, answers },
        });
        setPendingPermissions(prev => prev.filter(p => p.requestId !== requestId));
      } catch (err) {
        console.error('Failed to submit answers:', err);
        setPermissionError(err instanceof Error ? err.message : '提交答案失败，请重试');
      }
    },
    [sessionId],
  );

  const handleSubmitPlanResponse = useCallback(
    async (requestId: string, value: string, feedback?: string) => {
      setPermissionError(null);
      try {
        if (value === 'no') {
          await apiSendControl(sessionId, {
            type: 'permission_response',
            approved: false,
            request_id: requestId,
            ...(feedback ? { message: feedback } : {}),
          });
        } else {
          const modeMap: Record<string, string> = {
            'yes-accept-edits': 'acceptEdits',
            'yes-default': 'default',
          };
          await apiSendControl(sessionId, {
            type: 'permission_response',
            approved: true,
            request_id: requestId,
            updated_permissions: [{ type: 'setMode', mode: modeMap[value] || 'default', destination: 'session' }],
          });
        }
        setPendingPermissions(prev => prev.filter(p => p.requestId !== requestId));
      } catch (err) {
        console.error('Failed to submit plan response:', err);
        setPermissionError(err instanceof Error ? err.message : '提交计划决定失败，请重试');
      }
    },
    [sessionId],
  );

  const handleLifecycleChanged = useCallback(async () => {
    const updated = await apiFetchSession(sessionId);
    setSession(updated);
    setSessionStatus(updated.status);
    await onChanged?.();
  }, [sessionId, onChanged]);

  const handleLifecycleDeleted = useCallback(async () => {
    adapter.disconnect();
    if (onDeleted) await onDeleted();
    else onBack?.();
  }, [adapter, onDeleted, onBack]);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-status-error">{error}</p>
          {onBack ? (
            <button type="button" onClick={onBack} className="mt-4 inline-block text-brand hover:underline">
              &larr; 返回
            </button>
          ) : (
            <a href="/code/" className="mt-4 inline-block text-brand hover:underline">
              &larr; 返回
            </a>
          )}
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-text-muted">Loading session...</div>
      </div>
    );
  }

  // ACP session — render ACP relay chat
  if (session.source === 'acp' && session.environment_id) {
    return (
      <TooltipProvider>
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex h-11 items-center justify-between gap-3 border-b bg-surface-1 px-3">
            <div className="flex min-w-0 items-center gap-2">
              {onBack && (
                <button type="button" onClick={onBack} className="text-sm text-text-muted hover:text-text-primary">
                  ←
                </button>
              )}
              <h1 className="truncate font-display text-base font-semibold text-text-primary">
                {session.title || session.id}
              </h1>
              {sessionStatus && <StatusBadge status={sessionStatus} />}
            </div>
            <SessionActions
              session={{ ...session, status: sessionStatus || session.status }}
              onChanged={handleLifecycleChanged}
              onDeleted={handleLifecycleDeleted}
            />
          </div>
          <ACPSessionDetail sessionId={sessionId} agentId={session.environment_id} live={!closed} />
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <h1 className="sr-only">{session.title || session.id}</h1>
          {/* Session Header */}
          <div className="flex h-11 items-center gap-2 border-b border-border bg-surface-1/85 px-3 backdrop-blur-sm">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="flex h-7 w-7 items-center justify-center rounded-md font-display text-sm text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
                aria-label="返回"
              >
                ←
              </button>
            ) : (
              <a
                href="/code/"
                className="flex h-7 w-7 items-center justify-center rounded-md font-display text-sm text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary no-underline"
                aria-label="返回"
              >
                ←
              </a>
            )}
            <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', runtimeStatusDotClass(runtime, sessionStatus))} />
            <h2 className="min-w-0 flex-1 truncate font-display text-base font-semibold tracking-tight text-text-primary">
              {session.title || session.id}
            </h2>
            {sessionStatus && <StatusBadge status={sessionStatus} />}
            <SessionActions
              session={{ ...session, status: sessionStatus || session.status }}
              environments={environments}
              onChanged={handleLifecycleChanged}
              onDeleted={handleLifecycleDeleted}
            />
          </div>

          {/* Chat messages — unified ChatView */}
          <ChatView entries={entries} isLoading={isLoading} emptyTitle="开始对话" emptyDescription="输入消息开始聊天" />

          {/* Unified Permission Panel — above input */}
          {adapterReady && pendingPermissions.length > 0 && (
            <div className="border-t bg-surface-1 px-4 py-3">
              <div className="mx-auto max-w-3xl space-y-3">
                {permissionError && (
                  <p
                    role="alert"
                    className="rounded-lg border border-status-error/30 bg-status-error/5 px-3 py-2 text-xs text-status-error"
                  >
                    {permissionError}
                  </p>
                )}
                {pendingPermissions.map(req => (
                  <PermissionEventView
                    key={req.requestId}
                    request={req}
                    onApprove={() => handleApprovePermission(req.requestId)}
                    onReject={() => handleRejectPermission(req.requestId)}
                    onSubmitAnswers={handleSubmitAnswers}
                    onSubmitPlan={handleSubmitPlanResponse}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 模型 / 权限模式控件 — 紧贴输入框上方（原先在右侧工作中心） */}
          {sessionCanRunControls && (
            <div className="pt-2">
              <SessionControlBar
                sessionInfo={sessionInfo}
                usage={usage}
                initialPermissionMode={session.permission_mode}
                providerCatalog={providerCatalog}
                modelSelection={session.model_selection}
                catalogStale={providerCatalogStale}
                disabled={!sessionCanRunControls}
                onSetPermissionMode={handleSetPermissionMode}
                onSetModel={handleSetModel}
                onSetProviderModel={handleSetProviderModel}
                onSetThinking={handleSetThinking}
              />
            </div>
          )}

          {/* Unified ChatInput — claude.ai style */}
          <ChatInput
            onSubmit={handleSubmit}
            isLoading={isLoading}
            onInterrupt={handleInterrupt}
            disabled={closed || !adapterReady}
            commands={commands}
            placeholder={
              !adapterReady
                ? '正在同步会话…'
                : sessionStatus === 'archived'
                  ? '已归档，只读历史'
                  : sessionStatus === 'inactive'
                    ? '等待工作进程重新连接'
                    : isLoading
                      ? 'Claude 正在工作，新消息会注入当前回合…'
                      : '输入消息，/ 呼出命令...'
            }
          />
        </div>
        {/* Unified work center — runtime, review and terminal share one surface. */}
        <div className="hidden flex-shrink-0 md:flex" style={{ width: workCenterWidth, maxWidth: '60vw' }}>
          <WorkCenterResizeHandle width={workCenterWidth} onResize={setWorkCenterWidth} />
          <div className="min-w-0 flex-1">
            <WorkCenter
              sessionId={sessionId}
              entries={entries}
              sessionStatus={sessionStatus}
              sessionInfo={adapterReady ? sessionInfo : null}
              runtime={runtime}
              onControlRequest={sessionCanRunControls ? handleRuntimeControl : undefined}
              onSendMessage={sessionCanRunControls ? handleWorkCenterMessage : undefined}
              onInterrupt={sessionCanRunControls ? handleInterrupt : undefined}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function runtimeStatusDotClass(runtime: SessionRuntimeState | null, sessionStatus: string | null) {
  if (
    runtime?.workerStatus === 'offline' ||
    sessionStatus === 'inactive' ||
    sessionStatus === 'archived' ||
    sessionStatus === 'closed' ||
    sessionStatus === 'error'
  ) {
    return 'bg-text-muted';
  }
  if (runtime?.turnState === 'running') return 'animate-pulse bg-brand';
  if (runtime?.turnState === 'requires_action') return 'bg-amber-500';
  if (!runtime || runtime.turnState === 'unknown') {
    if (sessionStatus === 'running') return 'animate-pulse bg-brand';
    if (sessionStatus === 'requires_action') return 'bg-amber-500';
    return sessionStatus === 'idle' ? 'bg-status-active' : 'bg-text-muted';
  }
  return 'bg-status-active';
}

function confirmedModelSelection(
  value: unknown,
  requested: SessionModelOption,
  revision: number,
): SessionModelSelection | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  if (
    response.provider_id !== requested.providerId ||
    response.model_profile_id !== requested.modelProfileId ||
    response.resolved_model_id !== requested.remoteModelId ||
    response.provider_config_revision !== revision
  ) {
    return null;
  }
  return {
    provider_id: requested.providerId,
    model_profile_id: requested.modelProfileId,
    resolved_model_id: requested.remoteModelId,
    provider_config_revision: revision,
    updated_at: Date.now(),
  };
}

// ============================================================
// 工作中心拖拽把手 — 默认保持窄栏，需要查看 diff/终端时可拉宽。
// ============================================================

function WorkCenterResizeHandle({ width, onResize }: { width: number; onResize: (w: number) => void }) {
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      onResize(Math.max(300, Math.min(720, startWidth + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
  };
  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1 flex-shrink-0 cursor-col-resize bg-transparent hover:bg-brand/40 transition-colors"
      title="拖动调整工作中心宽度"
    />
  );
}

// ============================================================
// Permission Event View — routes to correct UI
// ============================================================

function PermissionEventView({
  request,
  onApprove,
  onReject,
  onSubmitAnswers,
  onSubmitPlan,
}: {
  request: PendingPermission;
  onApprove: () => void;
  onReject: () => void;
  onSubmitAnswers: (
    requestId: string,
    answers: Record<string, unknown>,
    questions: import('../types').Question[],
  ) => void;
  onSubmitPlan: (requestId: string, value: string, feedback?: string) => void;
}) {
  const toolName = request.toolName;
  const toolInput = request.toolInput;
  const description = request.description || '';

  if (toolName === 'AskUserQuestion') {
    const questions = (toolInput.questions as import('../types').Question[]) || [];
    return (
      <AskUserPanelView
        requestId={request.requestId}
        questions={questions}
        description={description}
        onSubmit={answers => onSubmitAnswers(request.requestId, answers, questions)}
        onSkip={onReject}
      />
    );
  }

  if (toolName === 'ExitPlanMode') {
    const planContent = (toolInput.plan as string) || '';
    return (
      <PlanPanelView
        requestId={request.requestId}
        planContent={planContent}
        description={description}
        onSubmit={(value, feedback) => onSubmitPlan(request.requestId, value, feedback)}
      />
    );
  }

  return (
    <PermissionPromptView
      requestId={request.requestId}
      toolName={toolName}
      toolInput={toolInput}
      description={description}
      onApprove={onApprove}
      onReject={onReject}
    />
  );
}

// ============================================================
// ACP Session Detail — renders ACP relay chat in session page
// ============================================================

function ACPSessionDetail({ sessionId, agentId, live = true }: { sessionId: string; agentId: string; live?: boolean }) {
  const [client, setClient] = useState<ACPClient | null>(null);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>(
    'disconnected',
  );
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<ACPClient | null>(null);

  useEffect(() => {
    if (!live) return;
    const relayClient = createRelayClient(agentId);

    relayClient.setConnectionStateHandler((state, err) => {
      setConnectionState(state);
      setError(err || null);
    });

    clientRef.current = relayClient;
    setClient(relayClient);

    relayClient.connect().catch(e => {
      if (e instanceof DisconnectRequestedError) return;
      setError((e as Error).message);
      setConnectionState('error');
    });

    return () => {
      relayClient.disconnect();
      clientRef.current = null;
      setClient(null);
      setConnectionState('disconnected');
    };
  }, [agentId, live]);

  return (
    <TooltipProvider>
      <div className="flex flex-1 flex-col overflow-hidden">
        {!live && (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-muted">
            此对话当前为只读状态。
          </div>
        )}
        {error && connectionState === 'error' && (
          <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm border-b">{error}</div>
        )}

        {connectionState === 'connecting' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-2 border-brand border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-text-muted text-sm">Connecting to agent...</p>
            </div>
          </div>
        )}

        {connectionState === 'error' && !client && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="font-medium mb-1">Connection Failed</p>
              <p className="text-text-muted text-sm">{error}</p>
            </div>
          </div>
        )}

        {client && connectionState === 'connected' && (
          <div className="flex-1 min-h-0">
            <ACPMain client={client} agentId={agentId} />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
