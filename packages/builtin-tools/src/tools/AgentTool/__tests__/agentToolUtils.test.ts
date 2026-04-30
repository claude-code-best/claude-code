import { mock, describe, expect, test } from "bun:test";
import { debugMock } from "../../../../../../tests/mocks/debug";

// ─── Mocks for agentToolUtils.ts dependencies ───
// Only mock modules that are truly unavailable or cause side effects.
// Do NOT mock common/shared modules (zod/v4, bootstrap/state, etc.) to avoid
// corrupting the module cache for other test files in the same Bun process.

const noop = () => {};

mock.module("bun:bundle", () => ({ feature: () => false }));

mock.module("src/constants/tools.js", () => ({
  ALL_AGENT_DISALLOWED_TOOLS: new Set(),
  ASYNC_AGENT_ALLOWED_TOOLS: new Set(),
  CUSTOM_AGENT_DISALLOWED_TOOLS: new Set(),
  IN_PROCESS_TEAMMATE_ALLOWED_TOOLS: new Set(),
}));

mock.module("src/services/AgentSummary/agentSummary.js", () => ({
  startAgentSummarization: noop,
}));

mock.module("src/services/analytics/index.js", () => ({
  logEvent: noop,
  logEventAsync: async () => {},
  stripProtoFields: (v: any) => v,
  attachAnalyticsSink: noop,
  _resetForTesting: noop,
  AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS: undefined,
}));

mock.module("src/services/api/dumpPrompts.js", () => ({
  clearDumpState: noop,
}));

mock.module("src/Tool.js", () => ({
  toolMatchesName: () => false,
  findToolByName: noop,
}));

// messages.ts is complex - provide stubs for all named exports
mock.module("src/utils/messages.ts", () => ({
  extractTextContent: (content: any[]) =>
    content?.filter?.((b: any) => b.type === "text")?.map?.((b: any) => b.text)?.join("") ?? "",
  getLastAssistantMessage: () => null,
  SYNTHETIC_MESSAGES: new Set(),
  INTERRUPT_MESSAGE: "",
  INTERRUPT_MESSAGE_FOR_TOOL_USE: "",
  CANCEL_MESSAGE: "",
  REJECT_MESSAGE: "",
  REJECT_MESSAGE_WITH_REASON_PREFIX: "",
  SUBAGENT_REJECT_MESSAGE: "",
  SUBAGENT_REJECT_MESSAGE_WITH_REASON_PREFIX: "",
  PLAN_REJECTION_PREFIX: "",
  DENIAL_WORKAROUND_GUIDANCE: "",
  NO_RESPONSE_REQUESTED: "",
  SYNTHETIC_TOOL_RESULT_PLACEHOLDER: "",
  SYNTHETIC_MODEL: "",
  AUTO_REJECT_MESSAGE: noop,
  DONT_ASK_REJECT_MESSAGE: noop,
  withMemoryCorrectionHint: (s: string) => s,
  deriveShortMessageId: () => "",
  isClassifierDenial: () => false,
  buildYoloRejectionMessage: () => "",
  buildClassifierUnavailableMessage: () => "",
  isEmptyMessageText: () => true,
  createAssistantMessage: noop,
  createAssistantAPIErrorMessage: noop,
  createUserMessage: noop,
  prepareUserContent: noop,
  createUserInterruptionMessage: noop,
  createSyntheticUserCaveatMessage: noop,
  formatCommandInputTags: noop,
}));

mock.module("src/tasks/LocalAgentTask/LocalAgentTask.js", () => ({
  completeAgentTask: noop,
  createActivityDescriptionResolver: () => ({}),
  createProgressTracker: () => ({}),
  enqueueAgentNotification: noop,
  failAgentTask: noop,
  getProgressUpdate: () => ({ tokenCount: 0, toolUseCount: 0 }),
  getTokenCountFromTracker: () => 0,
  isLocalAgentTask: () => false,
  killAsyncAgent: noop,
  updateAgentProgress: noop,
  updateProgressFromMessage: noop,
}));

mock.module("src/utils/debug.ts", debugMock);

mock.module("src/utils/errors.js", () => ({
  ClaudeError: class extends Error {},
  MalformedCommandError: class extends Error {},
  AbortError: class extends Error {},
  ConfigParseError: class extends Error {},
  ShellError: class extends Error {},
  TeleportOperationError: class extends Error {},
  TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS: class extends Error {},
  isAbortError: () => false,
  hasExactErrorMessage: () => false,
  toError: (e: any) => e instanceof Error ? e : new Error(String(e)),
  errorMessage: (e: any) => String(e),
  getErrnoCode: () => undefined,
  isENOENT: () => false,
  getErrnoPath: () => undefined,
  shortErrorStack: () => "",
  isFsInaccessible: () => false,
  classifyAxiosError: () => ({ category: "unknown" }),
}));

mock.module("src/utils/forkedAgent.js", () => ({}));

mock.module("src/utils/permissions/yoloClassifier.js", () => ({
  buildTranscriptForClassifier: () => "",
  classifyYoloAction: () => null,
}));

mock.module("src/utils/task/sdkProgress.js", () => ({
  emitTaskProgress: noop,
}));

mock.module("src/utils/tokens.js", () => ({
  getTokenCountFromUsage: () => 0,
}));

mock.module("src/tools/ExitPlanModeTool/constants.js", () => ({
  EXIT_PLAN_MODE_V2_TOOL_NAME: "exit_plan_mode",
}));

mock.module("src/tools/AgentTool/constants.js", () => ({
  AGENT_TOOL_NAME: "agent",
  LEGACY_AGENT_TOOL_NAME: "task",
}));

mock.module("src/tools/AgentTool/loadAgentsDir.js", () => ({}));

mock.module("src/state/AppState.js", () => ({}));

mock.module("src/types/ids.js", () => ({
  asAgentId: (id: string) => id,
}));

// Break circular dep
mock.module("src/tools/AgentTool/AgentTool.tsx", () => ({
  AgentTool: {},
  inputSchema: {},
  outputSchema: {},
  default: {},
}));

const {
  countToolUses,
  getLastToolUseName,
} = await import("../agentToolUtils");

function makeAssistantMessage(content: any[]): any {
  return { type: "assistant", message: { content } };
}

function makeUserMessage(text: string): any {
  return { type: "user", message: { content: text } };
}

describe("countToolUses", () => {
  test("counts tool_use blocks in messages", () => {
    const messages = [
      makeAssistantMessage([
        { type: "tool_use", name: "Read" },
        { type: "text", text: "hello" },
      ]),
    ];
    expect(countToolUses(messages)).toBe(1);
  });

  test("returns 0 for messages without tool_use", () => {
    const messages = [
      makeAssistantMessage([{ type: "text", text: "hello" }]),
    ];
    expect(countToolUses(messages)).toBe(0);
  });

  test("returns 0 for empty array", () => {
    expect(countToolUses([])).toBe(0);
  });

  test("counts multiple tool_use blocks across messages", () => {
    const messages = [
      makeAssistantMessage([{ type: "tool_use", name: "Read" }]),
      makeUserMessage("ok"),
      makeAssistantMessage([{ type: "tool_use", name: "Write" }]),
    ];
    expect(countToolUses(messages)).toBe(2);
  });

  test("counts tool_use in single message with multiple blocks", () => {
    const messages = [
      makeAssistantMessage([
        { type: "tool_use", name: "Read" },
        { type: "tool_use", name: "Grep" },
        { type: "tool_use", name: "Write" },
      ]),
    ];
    expect(countToolUses(messages)).toBe(3);
  });
});

describe("getLastToolUseName", () => {
  test("returns last tool name from assistant message", () => {
    const msg = makeAssistantMessage([
      { type: "tool_use", name: "Read" },
      { type: "tool_use", name: "Write" },
    ]);
    expect(getLastToolUseName(msg)).toBe("Write");
  });

  test("returns undefined for message without tool_use", () => {
    const msg = makeAssistantMessage([{ type: "text", text: "hello" }]);
    expect(getLastToolUseName(msg)).toBeUndefined();
  });

  test("returns the last tool when multiple tool_uses present", () => {
    const msg = makeAssistantMessage([
      { type: "tool_use", name: "Read" },
      { type: "tool_use", name: "Grep" },
      { type: "tool_use", name: "Edit" },
    ]);
    expect(getLastToolUseName(msg)).toBe("Edit");
  });

  test("returns undefined for non-assistant message", () => {
    const msg = makeUserMessage("hello");
    expect(getLastToolUseName(msg)).toBeUndefined();
  });

  test("handles message with null content", () => {
    const msg = { type: "assistant", message: { content: null } } as any;
    expect(getLastToolUseName(msg)).toBeUndefined();
  });
});
