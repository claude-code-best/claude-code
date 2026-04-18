import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
  apiFetchSession,
  apiFetchSessionHistory,
  apiSendControl,
  apiInterrupt,
  apiBind,
} from "../api/client";
import type { Session, SessionEvent } from "../types";
import { isClosedSessionStatus, formatTime, extractEventText, esc, cn, truncate } from "../lib/utils";
import { RCSTransport, sseBus } from "../lib/rcs-transport";
import { StatusBadge } from "../components/Navbar";
import { TaskPanel } from "../components/TaskPanel";
import {
  PermissionPromptView,
  AskUserPanelView,
  PlanPanelView,
} from "../components/PermissionViews";

// ai-elements components
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButtons,
} from "../../components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "../../components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  type PromptInputMessage,
} from "../../components/ai-elements/prompt-input";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "../../components/ai-elements/tool";
import { Shimmer } from "../../components/ai-elements/shimmer";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { TooltipProvider } from "../../components/ui/tooltip";

interface SessionDetailProps {
  sessionId: string;
}

export function SessionDetail({ sessionId }: SessionDetailProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [pendingPermissions, setPendingPermissions] = useState<SessionEvent[]>([]);
  const transportRef = useRef<RCSTransport | null>(null);

  // Create transport for useChat
  const transport = useMemo(
    () =>
      new RCSTransport({
        sessionId,
        onPermissionRequest: (event) => {
          setPendingPermissions((prev) => [...prev, event]);
        },
        onSessionStatus: (status) => {
          setSessionStatus(status);
        },
        onError: (err) => {
          console.error("[RCSTransport] error:", err);
        },
      }),
    [sessionId],
  );

  useEffect(() => {
    transportRef.current = transport;
    return () => {
      transport.destroy();
    };
  }, [transport]);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    error: chatError,
  } = useChat({
    transport,
    id: `session-${sessionId}`,
  });

  // Load session data and history
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");

      try {
        await apiBind(sessionId);
      } catch {
        // may already be bound
      }

      try {
        const sess = await apiFetchSession(sessionId);
        if (cancelled) return;
        setSession(sess);
        setSessionStatus(sess.status);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load session");
        return;
      }

      try {
        const { events } = await apiFetchSessionHistory(sessionId);
        if (cancelled || !events || events.length === 0) return;

        const historyMessages: UIMessage[] = [];
        let currentAssistant: UIMessage | null = null;

        for (const event of events) {
          const payload = event.payload || {};

          if (event.type === "user") {
            // Skip outbound user events — they are our own messages
            // which are echoed back as inbound events by the bridge
            if (event.direction === "outbound") continue;
            if (currentAssistant) {
              historyMessages.push(currentAssistant);
              currentAssistant = null;
            }
            const text = extractEventText(payload as Record<string, unknown>);
            if (text) {
              historyMessages.push({
                id: event.id || `hist-user-${historyMessages.length}`,
                role: "user",
                parts: [{ type: "text", text }],
              });
            }
          } else if (event.type === "assistant") {
            if (currentAssistant) {
              historyMessages.push(currentAssistant);
            }

            const text = extractEventText(payload as Record<string, unknown>);
            const toolParts: UIMessage["parts"] = [];

            const msg = (payload as Record<string, unknown>).message as Record<string, unknown> | undefined;
            if (msg && typeof msg === "object" && Array.isArray(msg.content)) {
              for (const block of msg.content as Array<Record<string, unknown>>) {
                if (block.type === "tool_use") {
                  toolParts.push({
                    type: "dynamic-tool",
                    toolCallId: (block.id as string) || `hist-tool-${historyMessages.length}`,
                    toolName: (block.name as string) || "tool",
                    state: "input-available",
                    input: block.input || {},
                  });
                }
              }
            }

            if (text || toolParts.length > 0) {
              currentAssistant = {
                id: event.id || `hist-asst-${historyMessages.length}`,
                role: "assistant",
                parts: [
                  ...(text ? [{ type: "text" as const, text }] : []),
                  ...toolParts,
                ],
              };
            }
          } else if (event.type === "tool_use" && currentAssistant) {
            const p = payload as Record<string, unknown>;
            currentAssistant.parts.push({
              type: "dynamic-tool",
              toolCallId: (p.tool_call_id as string) || `hist-tool-${historyMessages.length}`,
              toolName: (p.tool_name as string) || "tool",
              state: "input-available",
              input: p.tool_input || {},
            });
          } else if (event.type === "tool_result" && currentAssistant) {
            const p = payload as Record<string, unknown>;
            const lastToolCall = [...currentAssistant.parts]
              .reverse()
              .find((part): part is Extract<typeof part, { type: "dynamic-tool" }> => part.type === "dynamic-tool");
            if (lastToolCall && lastToolCall.type === "dynamic-tool") {
              currentAssistant.parts.push({
                type: "dynamic-tool",
                toolCallId: lastToolCall.toolCallId,
                toolName: lastToolCall.toolName,
                state: "output-available",
                input: lastToolCall.state === "input-available" ? lastToolCall.input : {},
                output: p.content || p.output || "",
              });
            }
          }
        }

        if (currentAssistant) {
          historyMessages.push(currentAssistant);
        }

        setMessages(historyMessages);
      } catch (err) {
        console.warn("Failed to load session history:", err);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]); // intentionally omit setMessages to avoid re-running

  // Connect SSE bus when session is active
  useEffect(() => {
    if (!isClosedSessionStatus(sessionStatus)) {
      sseBus.connect(sessionId);
    }
    return () => {
      sseBus.disconnect();
    };
  }, [sessionId, sessionStatus]);

  // Listen to SSE for status/permissions
  useEffect(() => {
    const unsub = sseBus.onEvent((event) => {
      if (event.type === "session_status" && typeof event.payload?.status === "string") {
        setSessionStatus(event.payload.status);
      }
      if (
        (event.type === "control_request" || event.type === "permission_request") &&
        event.payload?.request?.subtype === "can_use_tool"
      ) {
        setPendingPermissions((prev) => {
          const rid = event.payload?.request_id || event.id;
          if (prev.some((p) => (p.payload?.request_id || p.id) === rid)) return prev;
          return [...prev, event];
        });
      }
    });
    return unsub;
  }, []);

  const closed = isClosedSessionStatus(sessionStatus);
  const isStreaming = status === "streaming" || status === "submitted";
  const chatStatus = isStreaming ? "streaming" : status === "error" ? "error" : "ready";

  // Send message via PromptInput
  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const text = message.text.trim();
      if (!text || closed) return;
      await sendMessage({ parts: [{ type: "text", text }] });
    },
    [sendMessage, closed],
  );

  // Interrupt
  const handleInterrupt = useCallback(async () => {
    stop();
    try {
      await apiInterrupt(sessionId);
    } catch (err) {
      console.error("Interrupt failed:", err);
    }
  }, [sessionId, stop]);

  // Permission actions
  const handleApprovePermission = useCallback(
    async (requestId: string) => {
      try {
        await apiSendControl(sessionId, {
          type: "permission_response",
          approved: true,
          request_id: requestId,
        });
      } catch (err) {
        console.error("Failed to approve:", err);
      }
      setPendingPermissions((prev) =>
        prev.filter((p) => (p.payload?.request_id || p.id) !== requestId),
      );
    },
    [sessionId],
  );

  const handleRejectPermission = useCallback(
    async (requestId: string) => {
      try {
        await apiSendControl(sessionId, {
          type: "permission_response",
          approved: false,
          request_id: requestId,
        });
      } catch (err) {
        console.error("Failed to reject:", err);
      }
      setPendingPermissions((prev) =>
        prev.filter((p) => (p.payload?.request_id || p.id) !== requestId),
      );
    },
    [sessionId],
  );

  const handleSubmitAnswers = useCallback(
    async (
      requestId: string,
      answers: Record<string, unknown>,
      questions: import("../types").Question[],
    ) => {
      try {
        await apiSendControl(sessionId, {
          type: "permission_response",
          approved: true,
          request_id: requestId,
          updated_input: { questions, answers },
        });
      } catch (err) {
        console.error("Failed to submit answers:", err);
      }
      setPendingPermissions((prev) =>
        prev.filter((p) => (p.payload?.request_id || p.id) !== requestId),
      );
    },
    [sessionId],
  );

  const handleSubmitPlanResponse = useCallback(
    async (requestId: string, value: string, feedback?: string) => {
      try {
        if (value === "no") {
          await apiSendControl(sessionId, {
            type: "permission_response",
            approved: false,
            request_id: requestId,
            ...(feedback ? { message: feedback } : {}),
          });
        } else {
          const modeMap: Record<string, string> = {
            "yes-accept-edits": "acceptEdits",
            "yes-default": "default",
          };
          await apiSendControl(sessionId, {
            type: "permission_response",
            approved: true,
            request_id: requestId,
            updated_permissions: [
              { type: "setMode", mode: modeMap[value] || "default", destination: "session" },
            ],
          });
        }
      } catch (err) {
        console.error("Failed to submit plan response:", err);
      }
      setPendingPermissions((prev) =>
        prev.filter((p) => (p.payload?.request_id || p.id) !== requestId),
      );
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

  return (
    <TooltipProvider>
      <div className="flex flex-1 flex-col overflow-hidden">
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
                <h2 className="font-display text-lg font-semibold text-text-primary">
                  {session.title || session.id}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {sessionStatus && <StatusBadge status={sessionStatus} />}
                  <span className="text-xs text-text-muted">
                    {formatTime(session.created_at)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowMeta(!showMeta)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-2 hover:text-text-secondary transition-colors"
                  title="Session info"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
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
                <div><span className="text-text-secondary font-sans font-medium">Session</span> {session.id}</div>
                {session.environment_id && (
                  <div><span className="text-text-secondary font-sans font-medium">Environment</span> {session.environment_id}</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Messages — using ai-elements Conversation */}
        <Conversation className="flex-1">
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState
                title="Start a conversation"
                description="Type a message below to chat"
              />
            ) : (
              messages.map((message) => (
                <ChatMessageRenderer key={message.id} message={message} />
              ))
            )}
            {isStreaming && (
              <Message from="assistant">
                <MessageContent>
                  <LoadingIndicator verb="Thinking" />
                </MessageContent>
              </Message>
            )}
            {chatError && (
              <Message from="assistant">
                <MessageContent>
                  <div className="text-destructive text-sm">
                    Error: {chatError.message}
                  </div>
                </MessageContent>
              </Message>
            )}
          </ConversationContent>
          <ConversationScrollButtons hasUserMessages={messages.some((m) => m.role === "user")} />
        </Conversation>

        {/* Permission Requests */}
        {pendingPermissions.length > 0 && (
          <div className="border-t bg-surface-1 px-4 py-3">
            <div className="mx-auto max-w-5xl space-y-3">
              {pendingPermissions.map((event) => (
                <PermissionEventView
                  key={event.payload?.request_id || event.id}
                  event={event}
                  onApprove={handleApprovePermission}
                  onReject={handleRejectPermission}
                  onSubmitAnswers={handleSubmitAnswers}
                  onSubmitPlan={handleSubmitPlanResponse}
                />
              ))}
            </div>
          </div>
        )}

        {/* Input — using ai-elements PromptInput */}
        <div className="border-t p-4">
          <div className="mx-auto max-w-5xl">
            <PromptInput
              onSubmit={handleSubmit}
              className="max-w-5xl mx-auto"
            >
              <PromptInputTextarea
                placeholder={closed ? "Session is closed" : "Type a message..."}
                disabled={closed}
              />
              <PromptInputFooter>
                <div />
                <PromptInputSubmit
                  status={chatStatus}
                  disabled={closed}
                  onClick={isStreaming ? handleInterrupt : undefined}
                />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </div>

        {/* Task Panel */}
        {taskPanelOpen && <TaskPanel onClose={() => setTaskPanelOpen(false)} />}
      </div>
    </TooltipProvider>
  );
}

// ============================================================
// Message Renderer — maps UIMessage to ai-elements components
// ============================================================

function ChatMessageRenderer({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    return <UserMessageRenderer message={message} />;
  }
  if (message.role === "assistant") {
    return <AssistantMessageRenderer message={message} />;
  }
  // System messages
  const text = message.parts
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
  if (!text) return null;
  return (
    <div className="flex justify-center">
      <div className="rounded-full bg-secondary px-4 py-1.5 text-xs text-muted-foreground">
        {text}
      </div>
    </div>
  );
}

function UserMessageRenderer({ message }: { message: UIMessage }) {
  const text = message.parts
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");

  return (
    <Message from="user">
      <MessageContent>
        <MessageResponse>{text}</MessageResponse>
      </MessageContent>
    </Message>
  );
}

function AssistantMessageRenderer({ message }: { message: UIMessage }) {
  const textParts = message.parts.filter(
    (p): p is Extract<typeof p, { type: "text" }> => p.type === "text",
  );
  const dynamicToolParts = message.parts.filter(
    (p): p is Extract<typeof p, { type: "dynamic-tool" }> => p.type === "dynamic-tool",
  );

  // Group by toolCallId, keeping output-available entries over input-available
  const toolCallMap = new Map<string, typeof dynamicToolParts[0]>();
  for (const part of dynamicToolParts) {
    const existing = toolCallMap.get(part.toolCallId);
    if (!existing || part.state === "output-available") {
      toolCallMap.set(part.toolCallId, part);
    }
  }

  return (
    <Message from="assistant">
      <MessageContent>
        {textParts.map((part, i) => (
          <MessageResponse key={`text-${i}`}>{part.text}</MessageResponse>
        ))}
        {[...toolCallMap.entries()].map(([id, call], i) => {
          const hasOutput = call.state === "output-available" && "output" in call;
          return (
            <Tool key={id || `tool-${i}`} defaultOpen={false}>
              <ToolHeader
                title={call.toolName}
                type="tool-invocation"
                state={hasOutput ? "output-available" : "input-available"}
              />
              <ToolContent>
                <ToolInput input={"input" in call ? call.input : {}} />
                {hasOutput && <ToolOutput output={(call as { output: unknown }).output} />}
              </ToolContent>
            </Tool>
          );
        })}
      </MessageContent>
    </Message>
  );
}

// ============================================================
// Permission Event View — routes to correct UI
// ============================================================

function PermissionEventView({
  event,
  onApprove,
  onReject,
  onSubmitAnswers,
  onSubmitPlan,
}: {
  event: SessionEvent;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
  onSubmitAnswers: (requestId: string, answers: Record<string, unknown>, questions: import("../types").Question[]) => void;
  onSubmitPlan: (requestId: string, value: string, feedback?: string) => void;
}) {
  const payload = event.payload || {};
  const requestId = payload.request_id || event.id || "";
  const req = payload.request as Record<string, unknown> | undefined;
  const toolName = (req?.tool_name as string) || "unknown";
  const toolInput = (req?.input || req?.tool_input || {}) as Record<string, unknown>;
  const description = (req?.description as string) || "";

  if (toolName === "AskUserQuestion") {
    const questions = (toolInput.questions as import("../types").Question[]) || [];
    return (
      <AskUserPanelView
        requestId={requestId}
        questions={questions}
        description={description}
        onSubmit={(answers) => onSubmitAnswers(requestId, answers, questions)}
        onSkip={() => onReject(requestId)}
      />
    );
  }

  if (toolName === "ExitPlanMode") {
    const planContent = (toolInput.plan as string) || "";
    return (
      <PlanPanelView
        requestId={requestId}
        planContent={planContent}
        description={description}
        onSubmit={(value, feedback) => onSubmitPlan(requestId, value, feedback)}
      />
    );
  }

  return (
    <PermissionPromptView
      requestId={requestId}
      toolName={toolName}
      toolInput={toolInput}
      description={description}
      onApprove={() => onApprove(requestId)}
      onReject={() => onReject(requestId)}
    />
  );
}
