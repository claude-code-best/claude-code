import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetchSession, apiSendControl, apiInterrupt } from '../api/client';
import type { Session, SessionEvent } from '../types';
import { isClosedSessionStatus, formatTime, cn } from '../lib/utils';
import { Info } from 'lucide-react';
import { RCSChatAdapter } from '../lib/rcs-chat-adapter';
import type { ThreadEntry, PendingPermission } from '../lib/types';
import { StatusBadge } from '../components/Navbar';
import { TaskPanel } from '../components/TaskPanel';
import { PermissionPromptView, AskUserPanelView, PlanPanelView } from '../components/PermissionViews';

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
}

export function SessionDetail({ sessionId }: SessionDetailProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [entries, setEntries] = useState<ThreadEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermission[]>([]);
  const adapterRef = useRef<RCSChatAdapter | null>(null);

  // Create RCSChatAdapter
  const adapter = useMemo(
    () =>
      new RCSChatAdapter(sessionId, setEntries, {
        onStatusChange: status => {
          setSessionStatus(status);
        },
        onError: err => {
          console.error('[RCSChatAdapter] error:', err);
        },
        onPermissionRequest: permission => {
          setPendingPermissions(prev => {
            if (prev.some(p => p.requestId === permission.requestId)) return prev;
            return [...prev, permission];
          });
        },
      }),
    [sessionId],
  );

  useEffect(() => {
    adapterRef.current = adapter;
    return () => {
      adapter.disconnect();
    };
  }, [adapter]);

  // Load session data and initialize adapter
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError('');

      try {
        const sess = await apiFetchSession(sessionId);
        if (cancelled) return;
        setSession(sess);
        setSessionStatus(sess.status);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load session');
        return;
      }

      try {
        await adapter.init();
      } catch (err) {
        console.warn('Failed to init adapter:', err);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, adapter]);

  const closed = isClosedSessionStatus(sessionStatus);

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

  // Mark loading done when last assistant message stops streaming
  useEffect(() => {
    if (entries.length === 0) return;
    const last = entries[entries.length - 1];
    if (last?.type === 'assistant_message' || last?.type === 'tool_call') {
      // If the last entry is no longer a streaming tool, consider loading done
      if (last.type === 'tool_call' && last.toolCall.status === 'running') return;
      setIsLoading(false);
    }
  }, [entries]);

  // Permission actions
  const handleApprovePermission = useCallback(
    async (requestId: string) => {
      try {
        await adapter.respondPermission(requestId, true);
      } catch (err) {
        console.error('Failed to approve:', err);
      }
      setPendingPermissions(prev => prev.filter(p => p.requestId !== requestId));
    },
    [adapter],
  );

  const handleRejectPermission = useCallback(
    async (requestId: string) => {
      try {
        await adapter.respondPermission(requestId, false);
      } catch (err) {
        console.error('Failed to reject:', err);
      }
      setPendingPermissions(prev => prev.filter(p => p.requestId !== requestId));
    },
    [adapter],
  );

  const handleSubmitAnswers = useCallback(
    async (requestId: string, answers: Record<string, unknown>, questions: import('../types').Question[]) => {
      try {
        await apiSendControl(sessionId, {
          type: 'permission_response',
          approved: true,
          request_id: requestId,
          updated_input: { questions, answers },
        });
      } catch (err) {
        console.error('Failed to submit answers:', err);
      }
      setPendingPermissions(prev => prev.filter(p => p.requestId !== requestId));
    },
    [sessionId],
  );

  const handleSubmitPlanResponse = useCallback(
    async (requestId: string, value: string, feedback?: string) => {
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
      } catch (err) {
        console.error('Failed to submit plan response:', err);
      }
      setPendingPermissions(prev => prev.filter(p => p.requestId !== requestId));
    },
    [sessionId],
  );

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-status-error">{error}</p>
          <a href="/code/" className="mt-4 inline-block text-brand hover:underline">
            &larr; Back to Dashboard
          </a>
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
    return <ACPSessionDetail sessionId={sessionId} agentId={session.environment_id} />;
  }

  return (
    <TooltipProvider>
      <div className="flex flex-1 flex-col overflow-hidden">
        <h1 className="sr-only">{session.title || session.id}</h1>
        {/* Session Header */}
        <div className="border-b bg-surface-1 px-4 py-3">
          <div className="mx-auto max-w-5xl">
            <div className="mb-1">
              <a
                href="/code/"
                className="text-sm text-text-muted hover:text-text-secondary transition-colors no-underline"
              >
                &larr; Dashboard
              </a>
            </div>
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold text-text-primary">{session.title || session.id}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {sessionStatus && <StatusBadge status={sessionStatus} />}
                  <span className="text-xs text-text-muted">{formatTime(session.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowMeta(!showMeta)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-2 hover:text-text-secondary transition-colors"
                  title="Session info"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setTaskPanelOpen(!taskPanelOpen)}
                  className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-2 transition-colors"
                >
                  Tasks
                </button>
              </div>
            </div>
            {showMeta && (
              <div className="mt-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-text-muted space-y-1 font-mono">
                <div>
                  <span className="text-text-secondary font-sans font-medium">Session</span> {session.id}
                </div>
                {session.environment_id && (
                  <div>
                    <span className="text-text-secondary font-sans font-medium">Environment</span>{' '}
                    {session.environment_id}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Chat messages — unified ChatView */}
        <ChatView entries={entries} isLoading={isLoading} emptyTitle="开始对话" emptyDescription="输入消息开始聊天" />

        {/* Unified Permission Panel — above input */}
        {pendingPermissions.length > 0 && (
          <div className="border-t bg-surface-1 px-4 py-3">
            <div className="mx-auto max-w-3xl space-y-3">
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

        {/* Unified ChatInput — claude.ai style */}
        <ChatInput
          onSubmit={handleSubmit}
          isLoading={isLoading}
          onInterrupt={handleInterrupt}
          disabled={closed}
          placeholder={closed ? '会话已关闭' : '输入消息...'}
        />

        {/* Task Panel */}
        {taskPanelOpen && <TaskPanel onClose={() => setTaskPanelOpen(false)} />}
      </div>
    </TooltipProvider>
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

function ACPSessionDetail({ sessionId, agentId }: { sessionId: string; agentId: string }) {
  const [client, setClient] = useState<ACPClient | null>(null);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>(
    'disconnected',
  );
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<ACPClient | null>(null);

  useEffect(() => {
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
  }, [agentId]);

  return (
    <TooltipProvider>
      <div className="flex flex-1 flex-col overflow-hidden">
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
