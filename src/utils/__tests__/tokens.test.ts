import { mock, describe, expect, test } from "bun:test";

// Mock heavy dependency chain: tokenEstimation.ts → log.ts → bootstrap/state.ts
mock.module("src/utils/log.ts", () => ({
  logError: () => {},
  logToFile: () => {},
  getLogDisplayTitle: () => "",
  logEvent: () => {},
  logMCPError: () => {},
  logMCPDebug: () => {},
  dateToFilename: (d: Date) => d.toISOString().replace(/[:.]/g, "-"),
  getLogFilePath: () => "/tmp/mock-log",
  attachErrorLogSink: () => {},
  getInMemoryErrors: () => [],
  loadErrorLogs: async () => [],
  getErrorLogByIndex: async () => null,
  captureAPIRequest: () => {},
  _resetErrorLogForTesting: () => {},
}));

// Mock tokenEstimation to avoid pulling in API provider deps
mock.module("src/services/tokenEstimation.ts", () => ({
  roughTokenCountEstimation: (text: string) => Math.ceil(text.length / 4),
  roughTokenCountEstimationForMessages: (msgs: any[]) => msgs.length * 100,
  roughTokenCountEstimationForMessage: () => 100,
  roughTokenCountEstimationForFileType: () => 100,
  bytesPerTokenForFileType: () => 4,
  countTokensWithAPI: async () => 0,
  countMessagesTokensWithAPI: async () => 0,
  countTokensViaHaikuFallback: async () => 0,
}));

// Mock slowOperations to avoid bun:bundle import
mock.module('src/utils/slowOperations.ts', () => ({
  jsonStringify: JSON.stringify,
  jsonParse: JSON.parse,
  slowLogging: { enabled: false },
  clone: (v: any) => structuredClone(v),
  cloneDeep: (v: any) => structuredClone(v),
  callerFrame: () => '',
  SLOW_OPERATION_THRESHOLD_MS: 100,
  writeFileSync_DEPRECATED: () => {},
}))

const {
  getTokenCountFromUsage,
  getTokenUsage,
  tokenCountFromLastAPIResponse,
  messageTokenCountFromLastAPIResponse,
  getCurrentUsage,
  doesMostRecentAssistantMessageExceed200k,
  getAssistantMessageContentLength,
} = await import("../tokens");

// ─── Helpers ────────────────────────────────────────────────────────────

function makeAssistantMessage(
  content: any[],
  usage?: any,
  model?: string,
  id?: string
) {
  return {
    type: "assistant" as const,
    uuid: `test-${Math.random()}`,
    message: {
      id: id ?? `msg_${Math.random()}`,
      role: "assistant" as const,
      content,
      model: model ?? "claude-sonnet-4-20250514",
      usage: usage ?? {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 5,
      },
    },
    isApiErrorMessage: false,
  };
}

function makeUserMessage(text: string) {
  return {
    type: "user" as const,
    uuid: `test-${Math.random()}`,
    message: { role: "user" as const, content: text },
  };
}

// ─── getTokenCountFromUsage ─────────────────────────────────────────────

describe("getTokenCountFromUsage", () => {
  test("sums all token fields", () => {
    const usage = {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 20,
      cache_read_input_tokens: 10,
    };
    expect(getTokenCountFromUsage(usage as any)).toBe(180);
  });

  test("handles missing cache fields", () => {
    const usage = {
      input_tokens: 100,
      output_tokens: 50,
    };
    expect(getTokenCountFromUsage(usage as any)).toBe(150);
  });

  test("handles zero values", () => {
    const usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };
    expect(getTokenCountFromUsage(usage as any)).toBe(0);
  });
});

// ─── getTokenUsage ──────────────────────────────────────────────────────

describe("getTokenUsage", () => {
  test("returns usage for valid assistant message", () => {
    const msg = makeAssistantMessage([{ type: "text", text: "hello" }]);
    const usage = getTokenUsage(msg as any);
    expect(usage).toBeDefined();
    expect(usage!.input_tokens).toBe(100);
  });

  test("returns undefined for user message", () => {
    const msg = makeUserMessage("hello");
    expect(getTokenUsage(msg as any)).toBeUndefined();
  });

  test("returns undefined for synthetic model", () => {
    const msg = makeAssistantMessage(
      [{ type: "text", text: "hello" }],
      { input_tokens: 10, output_tokens: 5 },
      "<synthetic>"
    );
    expect(getTokenUsage(msg as any)).toBeUndefined();
  });
});

// ─── tokenCountFromLastAPIResponse ──────────────────────────────────────

describe("tokenCountFromLastAPIResponse", () => {
  test("returns token count from last assistant message", () => {
    const msgs = [
      makeAssistantMessage([{ type: "text", text: "hi" }], {
        input_tokens: 200,
        output_tokens: 100,
        cache_creation_input_tokens: 50,
        cache_read_input_tokens: 25,
      }),
    ];
    expect(tokenCountFromLastAPIResponse(msgs as any)).toBe(375);
  });

  test("returns 0 for empty messages", () => {
    expect(tokenCountFromLastAPIResponse([])).toBe(0);
  });

  test("skips user messages to find last assistant", () => {
    const msgs = [
      makeAssistantMessage([{ type: "text", text: "hi" }], {
        input_tokens: 100,
        output_tokens: 50,
      }),
      makeUserMessage("reply"),
    ];
    expect(tokenCountFromLastAPIResponse(msgs as any)).toBe(150);
  });
});

// ─── messageTokenCountFromLastAPIResponse ───────────────────────────────

describe("messageTokenCountFromLastAPIResponse", () => {
  test("returns output_tokens from last assistant", () => {
    const msgs = [
      makeAssistantMessage([{ type: "text", text: "hi" }], {
        input_tokens: 200,
        output_tokens: 75,
      }),
    ];
    expect(messageTokenCountFromLastAPIResponse(msgs as any)).toBe(75);
  });

  test("returns 0 for empty messages", () => {
    expect(messageTokenCountFromLastAPIResponse([])).toBe(0);
  });
});

// ─── getCurrentUsage ────────────────────────────────────────────────────

describe("getCurrentUsage", () => {
  test("returns usage object from last assistant", () => {
    const msgs = [
      makeAssistantMessage([{ type: "text", text: "hi" }], {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 5,
      }),
    ];
    const usage = getCurrentUsage(msgs as any);
    expect(usage).toEqual({
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 10,
      cache_read_input_tokens: 5,
    });
  });

  test("returns null for empty messages", () => {
    expect(getCurrentUsage([])).toBeNull();
  });

  test("defaults cache fields to 0", () => {
    const msgs = [
      makeAssistantMessage([{ type: "text", text: "hi" }], {
        input_tokens: 100,
        output_tokens: 50,
      }),
    ];
    const usage = getCurrentUsage(msgs as any);
    expect(usage!.cache_creation_input_tokens).toBe(0);
    expect(usage!.cache_read_input_tokens).toBe(0);
  });
});

// ─── doesMostRecentAssistantMessageExceed200k ───────────────────────────

describe("doesMostRecentAssistantMessageExceed200k", () => {
  test("returns false when under 200k", () => {
    const msgs = [
      makeAssistantMessage([{ type: "text", text: "hi" }], {
        input_tokens: 1000,
        output_tokens: 500,
      }),
    ];
    expect(doesMostRecentAssistantMessageExceed200k(msgs as any)).toBe(false);
  });

  test("returns true when over 200k", () => {
    const msgs = [
      makeAssistantMessage([{ type: "text", text: "hi" }], {
        input_tokens: 190000,
        output_tokens: 15000,
      }),
    ];
    expect(doesMostRecentAssistantMessageExceed200k(msgs as any)).toBe(true);
  });

  test("returns false for empty messages", () => {
    expect(doesMostRecentAssistantMessageExceed200k([])).toBe(false);
  });
});

// ─── getAssistantMessageContentLength ───────────────────────────────────

describe("getAssistantMessageContentLength", () => {
  test("counts text content length", () => {
    const msg = makeAssistantMessage([{ type: "text", text: "hello" }]);
    expect(getAssistantMessageContentLength(msg as any)).toBe(5);
  });

  test("counts multiple blocks", () => {
    const msg = makeAssistantMessage([
      { type: "text", text: "hello" },
      { type: "text", text: "world" },
    ]);
    expect(getAssistantMessageContentLength(msg as any)).toBe(10);
  });

  test("counts thinking content", () => {
    const msg = makeAssistantMessage([
      { type: "thinking", thinking: "let me think" },
    ]);
    expect(getAssistantMessageContentLength(msg as any)).toBe(12);
  });

  test("returns 0 for empty content", () => {
    const msg = makeAssistantMessage([]);
    expect(getAssistantMessageContentLength(msg as any)).toBe(0);
  });

  test("counts tool_use input", () => {
    const msg = makeAssistantMessage([
      { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } },
    ]);
    expect(getAssistantMessageContentLength(msg as any)).toBeGreaterThan(0);
  });
});
