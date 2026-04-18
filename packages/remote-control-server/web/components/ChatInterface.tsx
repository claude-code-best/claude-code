import { useState, useEffect, useCallback, useRef } from "react";
import imageCompression from "browser-image-compression";
import type { ACPClient } from "../src/acp/client";
import type { SessionUpdate, ToolCallContent, PermissionRequestPayload, PermissionOption, ContentBlock, ImageContent } from "../src/acp/types";

// Image compression options
// Claude API has a 5MB limit, so we target 2MB to be safe
const IMAGE_COMPRESSION_OPTIONS = {
  maxSizeMB: 2,           // Max output size in MB
  maxWidthOrHeight: 2048, // Max dimension (scales proportionally, no cropping)
  useWebWorker: true,     // Non-blocking compression
  fileType: "image/jpeg" as const, // Convert to JPEG for better compression
};

// Convert data URL to Blob without using fetch()
// This is critical for Chrome extensions where fetch(dataUrl) violates CSP
function dataUrlToBlob(dataUrl: string): Blob {
  // Parse the data URL: data:[<mediatype>][;base64],<data>
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) {
    throw new Error("Invalid data URL: missing comma separator");
  }

  const header = dataUrl.slice(0, commaIndex);
  const base64Data = dataUrl.slice(commaIndex + 1);

  // Extract MIME type from header (e.g., "data:image/png;base64")
  const mimeMatch = header.match(/^data:([^;,]+)/);
  const mimeType = mimeMatch ? mimeMatch[1] : "application/octet-stream";

  // Decode base64 to binary
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
}

// AI Elements components
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButtons,
  LAST_USER_MESSAGE_ATTR,
} from "./ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageAttachment,
  MessageAttachments,
} from "./ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputHeader,
  PromptInputAttachments,
  PromptInputAttachment,
  PromptInputButton,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "./ai-elements/prompt-input";
import { ImageIcon, Plus } from "lucide-react";
import { ModelSelectorPopover } from "./model-selector";
import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";

// Reference: Zed's add_images_from_picker() - Button to open file dialog for images
// Must be inside PromptInput to access attachments context
function AddImageButton() {
  const attachments = usePromptInputAttachments();
  return (
    <PromptInputButton
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => attachments.openFileDialog()}
    >
      <ImageIcon className="size-4" />
      <span className="sr-only">Attach image</span>
    </PromptInputButton>
  );
}
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "./ai-elements/tool";
import { Shimmer } from "./ai-elements/shimmer";
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "./ai-elements/reasoning";
import { ToolPermissionButtons } from "./ai-elements/permission-request";

// =============================================================================
// Type Definitions - Flat Entry Structure (matching Zed's architecture)
// =============================================================================

// Tool call status (matches Zed's ToolCallStatus enum)
type ToolCallStatus = "running" | "complete" | "error" | "waiting_for_confirmation" | "rejected" | "canceled";

// Tool call data
interface ToolCallData {
  id: string;
  title: string;
  status: ToolCallStatus;
  content?: ToolCallContent[];
  rawInput?: Record<string, unknown>;
  rawOutput?: Record<string, unknown>;
  // Permission request data (only when status is "waiting_for_confirmation")
  permissionRequest?: {
    requestId: string;
    options: PermissionOption[];
  };
  // True if this is a standalone permission request (not attached to a real tool call)
  isStandalonePermission?: boolean;
}

// Assistant message chunk - can be regular message or thought
type AssistantChunk =
  | { type: "message"; text: string }
  | { type: "thought"; text: string };

// Image data for display in user messages
// Reference: Zed's ContentBlock::Image stores decoded image for rendering
interface UserMessageImage {
  mimeType: string;
  data: string;  // base64 encoded
}

// User message entry
// Reference: Zed's UserMessage { content: ContentBlock, chunks: Vec<acp::ContentBlock> }
interface UserMessageEntry {
  type: "user_message";
  id: string;
  content: string;
  images?: UserMessageImage[];  // Images attached to this message
}

// Assistant message entry - contains chunks (text + thoughts)
interface AssistantMessageEntry {
  type: "assistant_message";
  id: string;
  chunks: AssistantChunk[];
}

// Tool call entry - standalone, not nested in messages
interface ToolCallEntry {
  type: "tool_call";
  toolCall: ToolCallData;
}

// Thread entry - flat list of all entries
type ThreadEntry = UserMessageEntry | AssistantMessageEntry | ToolCallEntry;

interface ChatInterfaceProps {
  client: ACPClient;
}

// Helper to format tool call content for display
function formatToolOutput(
  content?: ToolCallContent[],
  rawOutput?: Record<string, unknown>,
): unknown {
  // First try to extract from structured content
  if (content && content.length > 0) {
    const results: string[] = [];

    for (const item of content) {
      if (item.type === "content") {
        if (item.content.type === "text" && item.content.text) {
          results.push(item.content.text);
        }
      } else if (item.type === "diff") {
        results.push(`📝 ${item.path}\n--- Old\n+++ New\n${item.newText}`);
      } else if (item.type === "terminal") {
        results.push(`🖥️ Terminal: ${item.terminalId}`);
      }
    }

    if (results.length > 0) {
      return results.length === 1 ? results[0] : results.join("\n\n");
    }
  }

  // Fall back to rawOutput if content didn't produce results
  if (rawOutput && Object.keys(rawOutput).length > 0) {
    return rawOutput;
  }

  return null;
}

// =============================================================================
// Helper Functions
// =============================================================================

// Map ACP status string to our status type
function mapToolStatus(status: string): ToolCallStatus {
  if (status === "completed") return "complete";
  if (status === "failed") return "error";
  return "running";
}

// Find tool call index in entries (search from end, like Zed)
function findToolCallIndex(entries: ThreadEntry[], toolCallId: string): number {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry && entry.type === "tool_call" && entry.toolCall.id === toolCallId) {
      return i;
    }
  }
  return -1;
}

// =============================================================================
// ChatInterface Component
// =============================================================================

export function ChatInterface({ client }: ChatInterfaceProps) {
  // Flat list of entries (like Zed's entries: Vec<AgentThreadEntry>)
  const [entries, setEntries] = useState<ThreadEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  // Reference: Zed's supports_images() checks prompt_capabilities.image
  const [supportsImages, setSupportsImages] = useState(false);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const resetThreadState = useCallback(() => {
    setEntries([]);
    setIsLoading(false);
    setSessionReady(false);
  }, []);

  const activateSession = useCallback((sessionId: string, options?: { resetEntries?: boolean }) => {
    const shouldResetEntries = options?.resetEntries ?? true;
    if (shouldResetEntries) {
      setEntries([]);
      setIsLoading(false);
    }
    setActiveSessionId(sessionId);
    setSessionReady(true);
    setSupportsImages(client.supportsImages);
    console.log("[ChatInterface] Active session:", sessionId, "supportsImages:", client.supportsImages);
  }, [client]);

  // =============================================================================
  // Permission Request Handler
  // =============================================================================
  const handlePermissionRequest = useCallback((request: PermissionRequestPayload) => {
    if (activeSessionIdRef.current && request.sessionId !== activeSessionIdRef.current) {
      return;
    }
    console.log("[ChatInterface] Permission request:", request);

    setEntries((prev) => {
      // Find matching tool call (search from end)
      const toolCallIndex = findToolCallIndex(prev, request.toolCall.toolCallId);

      if (toolCallIndex >= 0) {
        // Update existing tool call's status
        return prev.map((entry, index) => {
          if (index !== toolCallIndex) return entry;
          if (entry.type !== "tool_call") return entry;
          if (entry.toolCall.status !== "running") return entry;

          return {
            type: "tool_call",
            toolCall: {
              ...entry.toolCall,
              status: "waiting_for_confirmation" as const,
              permissionRequest: {
                requestId: request.requestId,
                options: request.options,
              },
            },
          };
        });
      } else {
        // No matching tool call - create standalone permission request as new entry
        console.log("[ChatInterface] No matching tool call, creating standalone permission request");

        const permissionToolCall: ToolCallEntry = {
          type: "tool_call",
          toolCall: {
            id: request.toolCall.toolCallId,
            title: request.toolCall.title || "Permission Request",
            status: "waiting_for_confirmation",
            permissionRequest: {
              requestId: request.requestId,
              options: request.options,
            },
            isStandalonePermission: true,
          },
        };

        return [...prev, permissionToolCall];
      }
    });
  }, []);

  // =============================================================================
  // Session Update Handler (Zed-style: check last entry type)
  // =============================================================================
  const handleSessionUpdate = useCallback((sessionId: string, update: SessionUpdate) => {
    if (activeSessionIdRef.current && sessionId !== activeSessionIdRef.current) {
      return;
    }

    // Handle agent message chunk
    if (update.sessionUpdate === "agent_message_chunk") {
      const text = update.content.type === "text" && update.content.text ? update.content.text : "";
      if (!text) return;

      setEntries((prev) => {
        const lastEntry = prev[prev.length - 1];

        // If last entry is AssistantMessage, append to it
        if (lastEntry?.type === "assistant_message") {
          const lastChunk = lastEntry.chunks[lastEntry.chunks.length - 1];

          // If last chunk is same type (message), append text
          if (lastChunk?.type === "message") {
            return [
              ...prev.slice(0, -1),
              {
                ...lastEntry,
                chunks: [
                  ...lastEntry.chunks.slice(0, -1),
                  { type: "message", text: lastChunk.text + text },
                ],
              },
            ];
          }

          // Otherwise add new message chunk
          return [
            ...prev.slice(0, -1),
            {
              ...lastEntry,
              chunks: [...lastEntry.chunks, { type: "message", text }],
            },
          ];
        }

        // Create new AssistantMessage entry
        const newEntry: AssistantMessageEntry = {
          type: "assistant_message",
          id: `assistant-${Date.now()}`,
          chunks: [{ type: "message", text }],
        };
        return [...prev, newEntry];
      });
    }
    // Handle agent thought chunk (NEW - was missing before)
    else if (update.sessionUpdate === "agent_thought_chunk") {
      const text = update.content.type === "text" && update.content.text ? update.content.text : "";
      if (!text) return;

      setEntries((prev) => {
        const lastEntry = prev[prev.length - 1];

        // If last entry is AssistantMessage, append to it
        if (lastEntry?.type === "assistant_message") {
          const lastChunk = lastEntry.chunks[lastEntry.chunks.length - 1];

          // If last chunk is same type (thought), append text
          if (lastChunk?.type === "thought") {
            return [
              ...prev.slice(0, -1),
              {
                ...lastEntry,
                chunks: [
                  ...lastEntry.chunks.slice(0, -1),
                  { type: "thought", text: lastChunk.text + text },
                ],
              },
            ];
          }

          // Otherwise add new thought chunk
          return [
            ...prev.slice(0, -1),
            {
              ...lastEntry,
              chunks: [...lastEntry.chunks, { type: "thought", text }],
            },
          ];
        }

        // Create new AssistantMessage entry with thought
        const newEntry: AssistantMessageEntry = {
          type: "assistant_message",
          id: `assistant-${Date.now()}`,
          chunks: [{ type: "thought", text }],
        };
        return [...prev, newEntry];
      });
    }
    // Handle user message chunk (NEW - was missing before)
    else if (update.sessionUpdate === "user_message_chunk") {
      const text = update.content.type === "text" && update.content.text ? update.content.text : "";
      if (!text) return;

      setEntries((prev) => {
        const lastEntry = prev[prev.length - 1];

        // If last entry is UserMessage, append to it
        if (lastEntry?.type === "user_message") {
          return [
            ...prev.slice(0, -1),
            {
              ...lastEntry,
              content: lastEntry.content + text,
            },
          ];
        }

        // Create new UserMessage entry
        const newEntry: UserMessageEntry = {
          type: "user_message",
          id: `user-${Date.now()}`,
          content: text,
        };
        return [...prev, newEntry];
      });
    }
    // Handle tool call (UPSERT - update if exists, create if not)
    else if (update.sessionUpdate === "tool_call") {
      const toolCallData: ToolCallData = {
        id: update.toolCallId,
        title: update.title,
        status: mapToolStatus(update.status),
        content: update.content,
        rawInput: update.rawInput,
        rawOutput: update.rawOutput,
      };

      setEntries((prev) => {
        // UPSERT: Check if tool call already exists
        const existingIndex = findToolCallIndex(prev, update.toolCallId);

        if (existingIndex >= 0) {
          // UPDATE existing tool call
          return prev.map((entry, index) => {
            if (index !== existingIndex) return entry;
            if (entry.type !== "tool_call") return entry;

            return {
              type: "tool_call",
              toolCall: {
                ...entry.toolCall,
                ...toolCallData,
              },
            };
          });
        }

        // CREATE new tool call entry
        const newEntry: ToolCallEntry = {
          type: "tool_call",
          toolCall: toolCallData,
        };
        return [...prev, newEntry];
      });
    }
    // Handle tool call update (partial update)
    else if (update.sessionUpdate === "tool_call_update") {
      setEntries((prev) => {
        const existingIndex = findToolCallIndex(prev, update.toolCallId);

        if (existingIndex < 0) {
          // Tool call not found - create a failed tool call entry (like Zed)
          console.warn(`[ChatInterface] Tool call not found for update: ${update.toolCallId}`);
          const failedEntry: ToolCallEntry = {
            type: "tool_call",
            toolCall: {
              id: update.toolCallId,
              title: update.title || "Tool call not found",
              status: "error",
              content: [{ type: "content", content: { type: "text", text: "Tool call not found" } }],
            },
          };
          return [...prev, failedEntry];
        }

        return prev.map((entry, index) => {
          if (index !== existingIndex) return entry;
          if (entry.type !== "tool_call") return entry;

          const newStatus = update.status ? mapToolStatus(update.status) : entry.toolCall.status;
          const mergedContent = update.content
            ? [...(entry.toolCall.content || []), ...update.content]
            : entry.toolCall.content;

          return {
            type: "tool_call",
            toolCall: {
              ...entry.toolCall,
              status: newStatus,
              ...(update.title && { title: update.title }),
              content: mergedContent,
              ...(update.rawInput && { rawInput: update.rawInput }),
              ...(update.rawOutput && { rawOutput: update.rawOutput }),
            },
          };
        });
      });
    }
  }, []);

  // =============================================================================
  // Setup Effect
  // =============================================================================
  useEffect(() => {
    client.setSessionCreatedHandler((sessionId) => {
      console.log("[ChatInterface] Session created:", sessionId);
      activateSession(sessionId);
    });

    client.setSessionLoadedHandler((sessionId) => {
      console.log("[ChatInterface] Session loaded/resumed:", sessionId);
      activateSession(sessionId, { resetEntries: false });
    });

    client.setSessionSwitchingHandler((sessionId) => {
      console.log("[ChatInterface] Switching to session:", sessionId);
      setActiveSessionId(sessionId);
      resetThreadState();
    });

    client.setSessionUpdateHandler((sessionId: string, update: SessionUpdate) => {
      handleSessionUpdate(sessionId, update);
    });

    client.setPromptCompleteHandler((stopReason) => {
      console.log("[ChatInterface] Prompt complete:", stopReason);
      // Always set isLoading=false when prompt completes
      // This includes stopReason="cancelled" (which is the expected response after client.cancel())
      // Note: Tool calls are already marked as "canceled" in handleCancel before this fires
      setIsLoading(false);
    });

    client.setPermissionRequestHandler(handlePermissionRequest);

    // Create session
    client.createSession();
    return () => {
      client.setSessionCreatedHandler(() => {});
      client.setSessionLoadedHandler(() => {});
      client.setSessionSwitchingHandler(null);
      client.setSessionUpdateHandler(() => {});
      client.setPromptCompleteHandler(() => {});
      client.setPermissionRequestHandler(() => {});
    };
  }, [activateSession, client, handlePermissionRequest, handleSessionUpdate, resetThreadState]);

  // =============================================================================
  // User Actions
  // =============================================================================

  // Reference: Zed's ConnectionView.reset() + set_server_state() + _external_thread()
  // Creates a new session by clearing current state and calling new_session
  // This is the core of Zed's NewThread action
  const handleNewSession = useCallback(() => {
    console.log("[ChatInterface] Creating new session...");

    // Reference: Zed's set_server_state() calls close_all_sessions() before setting new state
    // Cancel any ongoing request before creating new session
    if (isLoading) {
      client.cancel();
    }

    // 1. Clear all entries (like Zed's set_server_state which creates new view)
    resetThreadState();
    setActiveSessionId(null);

    // 3. Create new session (like Zed's initial_state -> connection.new_session())
    // The session_created handler will set sessionReady=true when ready
    client.createSession();
  }, [client, isLoading, resetThreadState]);

  // Reference: Zed's MessageEditor.contents() builds Vec<acp::ContentBlock>
  // from text and attached images. We do the same here.
  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    const files = message.files || [];

    // Allow sending if there's text OR images (like Zed)
    if ((!text && files.length === 0) || isLoading || !sessionReady) return;

    // Build ContentBlock[] from text and files
    // Reference: Zed's contents() method builds text chunks and image chunks
    const contentBlocks: ContentBlock[] = [];

    // Add text content if present
    if (text) {
      contentBlocks.push({ type: "text", text });
    }

    // Convert image files to ImageContent blocks
    // Reference: Zed's MentionImage stores base64 data + format
    // Also collect images for display in the user message entry
    const userImages: UserMessageImage[] = [];

    for (const file of files) {
      if (file.mediaType?.startsWith("image/") && file.url) {
        try {
          console.log("[ChatInterface] Processing image:", {
            filename: file.filename,
            mediaType: file.mediaType,
            urlType: file.url.startsWith("data:") ? "data URL" : file.url.startsWith("blob:") ? "blob URL" : "other",
            urlLength: file.url.length,
          });

          // Step 1: Get the image as a Blob/File for compression
          let originalBlob: Blob;
          if (file.url.startsWith("data:")) {
            // Convert data URL to Blob without using fetch()
            // This is critical for Chrome extensions where fetch(dataUrl) violates CSP
            console.log("[ChatInterface] Converting data URL to Blob...");
            originalBlob = dataUrlToBlob(file.url);
          } else {
            // Object URL - fetch directly
            console.log("[ChatInterface] Fetching blob URL...");
            const response = await fetch(file.url);
            if (!response.ok) {
              throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
            }
            originalBlob = await response.blob();
          }

          const originalSizeKB = Math.round(originalBlob.size / 1024);
          console.log("[ChatInterface] Original image size:", originalSizeKB, "KB");

          // Step 2: Compress the image if it's larger than 2MB
          let finalBlob: Blob;
          let finalMimeType: string;

          if (originalBlob.size > 2 * 1024 * 1024) {
            console.log("[ChatInterface] Compressing image...");
            const imageFile = new File([originalBlob], file.filename || "image.jpg", {
              type: originalBlob.type,
            });
            finalBlob = await imageCompression(imageFile, IMAGE_COMPRESSION_OPTIONS);
            finalMimeType = "image/jpeg"; // Compressed images are JPEG
            const compressedSizeKB = Math.round(finalBlob.size / 1024);
            console.log("[ChatInterface] Compressed:", originalSizeKB, "KB ->", compressedSizeKB, "KB");
          } else {
            // Image is already small enough, use as-is
            finalBlob = originalBlob;
            finalMimeType = file.mediaType;
            console.log("[ChatInterface] Image under 2MB, no compression needed");
          }

          // Step 3: Convert to base64
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              const commaIndex = result.indexOf(",");
              resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
            };
            reader.onerror = () => reject(new Error("FileReader error: " + reader.error?.message));
            reader.readAsDataURL(finalBlob);
          });
          console.log("[ChatInterface] Base64 conversion complete, length:", base64Data.length);

          const imageContent: ImageContent = {
            type: "image",
            mimeType: finalMimeType,
            data: base64Data,
          };
          contentBlocks.push(imageContent);

          // Reference: Zed stores image data in UserMessage for display
          // Keep a copy for rendering in the chat history
          userImages.push({
            mimeType: finalMimeType,
            data: base64Data,
          });
        } catch (error) {
          console.error("[ChatInterface] Failed to process image:", {
            filename: file.filename,
            mediaType: file.mediaType,
            url: file.url?.substring(0, 100),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (contentBlocks.length === 0) return;

    // Add user message as new entry with images
    // Reference: Zed's UserMessage contains both content and chunks (images)
    const userEntry: UserMessageEntry = {
      type: "user_message",
      id: `user-${Date.now()}`,
      content: text,
      images: userImages.length > 0 ? userImages : undefined,
    };
    setEntries((prev) => [...prev, userEntry]);
    setIsLoading(true);

    try {
      // Reference: Zed's AcpThread.send() forwards Vec<acp::ContentBlock>
      await client.sendPrompt(contentBlocks);
    } catch (error) {
      console.error("[ChatInterface] Failed to send prompt:", error);
      setIsLoading(false);
    }
  };

  // Cancel handler - matches Zed's cancel() logic in acp_thread.rs
  // 1. Mark all pending/running/waiting_for_confirmation tool calls as canceled
  // 2. Send cancel notification to agent
  // 3. Do NOT set isLoading=false here - wait for prompt_complete with stopReason="cancelled"
  const handleCancel = () => {
    console.log("[ChatInterface] Cancel requested");

    // Like Zed: iterate all entries, mark Pending/WaitingForConfirmation/InProgress tool calls as Canceled
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.type !== "tool_call") return entry;

        // Check if status should be canceled (matches Zed's logic)
        const shouldCancel =
          entry.toolCall.status === "running" ||
          entry.toolCall.status === "waiting_for_confirmation";

        if (!shouldCancel) return entry;

        console.log("[ChatInterface] Marking tool call as canceled:", entry.toolCall.id);
        return {
          type: "tool_call",
          toolCall: {
            ...entry.toolCall,
            status: "canceled" as ToolCallStatus,
            permissionRequest: undefined, // Clear any pending permission request
          },
        };
      }),
    );

    // Send cancel notification to server (which forwards to agent)
    client.cancel();
    // Note: Do NOT set isLoading=false here!
    // Wait for prompt_complete with stopReason="cancelled" from the agent
  };

  const handlePermissionResponse = useCallback((requestId: string, optionId: string | null, optionKind: PermissionOption["kind"] | null) => {
    console.log("[ChatInterface] Permission response:", { requestId, optionId, optionKind });
    client.respondToPermission(requestId, optionId);

    // Determine new status based on option kind
    const isRejected = optionKind === "reject_once" || optionKind === "reject_always" || optionId === null;

    // Update the tool call status in entries
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.type !== "tool_call") return entry;
        if (entry.toolCall.permissionRequest?.requestId !== requestId) return entry;

        // For standalone permission requests, mark as complete immediately when approved
        // For regular tool calls, mark as running (agent will update to complete later)
        let newStatus: ToolCallStatus;
        if (isRejected) {
          newStatus = "rejected";
        } else if (entry.toolCall.isStandalonePermission) {
          newStatus = "complete";
        } else {
          newStatus = "running";
        }

        return {
          type: "tool_call",
          toolCall: {
            ...entry.toolCall,
            status: newStatus,
            permissionRequest: undefined,
            isStandalonePermission: undefined,
          },
        };
      }),
    );
  }, [client]);

  // =============================================================================
  // Render Helpers
  // =============================================================================

  // Map tool status to UI state
  const getToolState = (status: ToolCallStatus) => {
    switch (status) {
      case "error":
        return "output-error" as const;
      case "running":
        return "input-available" as const;
      case "waiting_for_confirmation":
        return "waiting-for-confirmation" as const;
      case "rejected":
        return "rejected" as const;
      case "canceled":
        return "output-error" as const; // Show canceled as error state
      case "complete":
      default:
        return "output-available" as const;
    }
  };

  // Render a tool call entry
  const renderToolCall = (entry: ToolCallEntry) => {
    const tool = entry.toolCall;
    const toolOutput = formatToolOutput(tool.content, tool.rawOutput);
    const hasOutput =
      tool.status !== "running" && tool.status !== "waiting_for_confirmation" && toolOutput !== null;

    return (
      <Tool
        key={tool.id}
        defaultOpen={hasOutput || tool.status === "waiting_for_confirmation"}
        className={tool.status === "rejected" ? "border-dashed border-orange-500/50" : undefined}
      >
        <ToolHeader
          title={tool.title}
          type="tool-invocation"
          state={getToolState(tool.status)}
        />
        <ToolContent>
          {tool.rawInput && <ToolInput input={tool.rawInput} />}
          {/* Show permission buttons when waiting for confirmation */}
          {tool.status === "waiting_for_confirmation" && tool.permissionRequest && (
            <ToolPermissionButtons
              requestId={tool.permissionRequest.requestId}
              options={tool.permissionRequest.options}
              onRespond={handlePermissionResponse}
            />
          )}
          {/* Show output for completed/error states */}
          {tool.status !== "waiting_for_confirmation" && tool.status !== "rejected" && (
            <ToolOutput
              output={toolOutput}
              errorText={tool.status === "error" ? "Tool execution failed" : undefined}
            />
          )}
        </ToolContent>
      </Tool>
    );
  };

  // Check if we should show thinking indicator
  const showThinkingIndicator = isLoading && entries.length > 0 &&
    entries[entries.length - 1]?.type === "user_message";

  const chatStatus = isLoading ? "streaming" : "ready";

  // Find the index of the last user message for scroll-to-last-user-message feature
  // Reference: Issue #3 - Provide a feature to locate the last human message
  const lastUserMessageIndex = entries.reduce((lastIndex, entry, index) => {
    return entry.type === "user_message" ? index : lastIndex;
  }, -1);

  // =============================================================================
  // Render
  // =============================================================================
  const hasMessages = entries.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <Conversation className="flex-1">
        <ConversationContent>
          {!sessionReady ? (
            <div className="flex items-center justify-center p-4">
              <Shimmer>Creating session...</Shimmer>
            </div>
          ) : entries.length === 0 ? (
            <ConversationEmptyState
              title="Start a conversation"
              description="Type a message below to chat with the ACP agent"
            />
          ) : (
            <>
              {entries.map((entry, index) => {
                // Render UserMessage
                // Reference: Zed's render_image_output() displays images in user messages
                if (entry.type === "user_message") {
                  // Mark the last user message with data attribute for scroll-to feature
                  // Reference: Issue #3 - Provide a feature to locate the last human message
                  const isLastUserMessage = index === lastUserMessageIndex;
                  return (
                    <Message
                      key={entry.id}
                      from="user"
                      {...(isLastUserMessage && { [LAST_USER_MESSAGE_ATTR]: "true" })}
                    >
                      <MessageContent>
                        {/* Show images using MessageAttachment component */}
                        {entry.images && entry.images.length > 0 && (
                          <MessageAttachments>
                            {entry.images.map((img, imgIndex) => (
                              <MessageAttachment
                                key={imgIndex}
                                data={{
                                  type: "file",
                                  mediaType: img.mimeType,
                                  url: `data:${img.mimeType};base64,${img.data}`,
                                }}
                              />
                            ))}
                          </MessageAttachments>
                        )}
                        {/* Show text content if present */}
                        {entry.content && (
                          <MessageResponse>{entry.content}</MessageResponse>
                        )}
                      </MessageContent>
                    </Message>
                  );
                }

                // Render AssistantMessage (with chunks)
                if (entry.type === "assistant_message") {
                  return (
                    <Message key={entry.id} from="assistant">
                      <MessageContent>
                        {entry.chunks.map((chunk, chunkIndex) => {
                          if (chunk.type === "thought") {
                            // Determine if this thought chunk is still streaming
                            const isLastChunk = chunkIndex === entry.chunks.length - 1;
                            const isThoughtStreaming = isLoading && isLastChunk;
                            return (
                              <Reasoning
                                key={chunkIndex}
                                isStreaming={isThoughtStreaming}
                              >
                                <ReasoningTrigger />
                                <ReasoningContent>
                                  <MessageResponse>{chunk.text}</MessageResponse>
                                </ReasoningContent>
                              </Reasoning>
                            );
                          }
                          // Regular message chunk
                          return <MessageResponse key={chunkIndex}>{chunk.text}</MessageResponse>;
                        })}
                      </MessageContent>
                    </Message>
                  );
                }

                // Render ToolCall (standalone entry)
                if (entry.type === "tool_call") {
                  return (
                    <Message key={entry.toolCall.id} from="assistant">
                      <MessageContent>
                        {renderToolCall(entry)}
                      </MessageContent>
                    </Message>
                  );
                }

                return null;
              })}

              {/* Thinking indicator - show when loading after user message */}
              {showThinkingIndicator && (
                <Message from="assistant">
                  <MessageContent>
                    <Shimmer>Thinking...</Shimmer>
                  </MessageContent>
                </Message>
              )}
            </>
          )}
        </ConversationContent>
        {/* Scroll navigation buttons */}
        <ConversationScrollButtons hasUserMessages={lastUserMessageIndex >= 0} />
      </Conversation>

      {/* Input area */}
      <div className="border-t p-4">
        {/* Reference: Zed's MessageEditor conditionally shows attachment UI based on supports_images() */}
        <PromptInput
          onSubmit={handleSubmit}
          accept={supportsImages ? "image/*" : undefined}
          multiple={supportsImages}
        >
          {/* Show attachments header when images are supported */}
          {supportsImages && (
            <PromptInputHeader>
              <PromptInputAttachments>
                {/* children is called per-file, not with array */}
                {(file) => <PromptInputAttachment data={file} />}
              </PromptInputAttachments>
            </PromptInputHeader>
          )}
          <PromptInputTextarea
            placeholder={sessionReady ? "Type a message..." : "Waiting for session..."}
            disabled={!sessionReady}
          />
          <PromptInputFooter>
            {/* Left side: Model selector and image button */}
            <div className="flex items-center gap-1">
              {/* Reference: Zed's AcpModelSelectorPopover in message editor footer */}
              <ModelSelectorPopover client={client} />
              {/* Reference: Zed's add_images_from_picker() shows image picker button only when supported */}
              {supportsImages && <AddImageButton />}
            </div>
            {/* Right side: New thread button (when has messages) and submit */}
            <div className="flex items-center gap-1">
              {/* New Thread button - only show when there are messages */}
              {/* Reference: Zed's new_thread_menu in agent_panel.rs */}
              {hasMessages && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleNewSession}
                    >
                      <Plus className="h-4 w-4" />
                      <span className="sr-only">New Thread</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New Thread</TooltipContent>
                </Tooltip>
              )}
              <PromptInputSubmit
                status={chatStatus}
                disabled={!sessionReady}
                onClick={isLoading ? handleCancel : undefined}
              />
            </div>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
