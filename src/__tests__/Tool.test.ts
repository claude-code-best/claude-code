import { describe, expect, test } from "bun:test";
import {
  buildTool,
  toolMatchesName,
  findToolByName,
  getEmptyToolPermissionContext,
  filterToolProgressMessages,
} from "../Tool";

// Minimal tool definition for testing buildTool
function makeMinimalToolDef(overrides: Record<string, unknown> = {}) {
  return {
    name: "TestTool",
    inputSchema: { type: "object" as const } as any,
    maxResultSizeChars: 10000,
    call: async () => ({ data: "ok" }),
    description: async () => "A test tool",
    prompt: async () => "test prompt",
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: "tool_result" as const,
      tool_use_id: toolUseID,
      content: String(content),
    }),
    renderToolUseMessage: () => null,
    ...overrides,
  };
}

describe("buildTool", () => {
  test("fills in default isEnabled as true", () => {
    const tool = buildTool(makeMinimalToolDef());
    expect(tool.isEnabled()).toBe(true);
  });

  test("fills in default isConcurrencySafe as false", () => {
    const tool = buildTool(makeMinimalToolDef());
    expect(tool.isConcurrencySafe({})).toBe(false);
  });

  test("fills in default isReadOnly as false", () => {
    const tool = buildTool(makeMinimalToolDef());
    expect(tool.isReadOnly({})).toBe(false);
  });

  test("fills in default isDestructive as false", () => {
    const tool = buildTool(makeMinimalToolDef());
    expect(tool.isDestructive!({})).toBe(false);
  });

  test("fills in default checkPermissions as allow", async () => {
    const tool = buildTool(makeMinimalToolDef());
    const input = { foo: "bar" };
    const result = await tool.checkPermissions(input, {} as any);
    expect(result).toEqual({ behavior: "allow", updatedInput: input });
  });

  test("fills in default userFacingName from tool name", () => {
    const tool = buildTool(makeMinimalToolDef());
    expect(tool.userFacingName(undefined)).toBe("TestTool");
  });

  test("fills in default toAutoClassifierInput as empty string", () => {
    const tool = buildTool(makeMinimalToolDef());
    expect(tool.toAutoClassifierInput({})).toBe("");
  });

  test("preserves explicitly provided methods", () => {
    const tool = buildTool(
      makeMinimalToolDef({
        isEnabled: () => false,
        isConcurrencySafe: () => true,
        isReadOnly: () => true,
      })
    );
    expect(tool.isEnabled()).toBe(false);
    expect(tool.isConcurrencySafe({})).toBe(true);
    expect(tool.isReadOnly({})).toBe(true);
  });

  test("preserves all non-defaultable properties", () => {
    const tool = buildTool(makeMinimalToolDef());
    expect(tool.name).toBe("TestTool");
    expect(tool.maxResultSizeChars).toBe(10000);
    expect(typeof tool.call).toBe("function");
    expect(typeof tool.description).toBe("function");
    expect(typeof tool.prompt).toBe("function");
  });
});

describe("toolMatchesName", () => {
  test("returns true for exact name match", () => {
    expect(toolMatchesName({ name: "Bash" }, "Bash")).toBe(true);
  });

  test("returns false for non-matching name", () => {
    expect(toolMatchesName({ name: "Bash" }, "Read")).toBe(false);
  });

  test("returns true when name matches an alias", () => {
    expect(
      toolMatchesName({ name: "Bash", aliases: ["BashTool", "Shell"] }, "BashTool")
    ).toBe(true);
  });

  test("returns false when aliases is undefined", () => {
    expect(toolMatchesName({ name: "Bash" }, "BashTool")).toBe(false);
  });

  test("returns false when aliases is empty", () => {
    expect(
      toolMatchesName({ name: "Bash", aliases: [] }, "BashTool")
    ).toBe(false);
  });
});

describe("findToolByName", () => {
  const mockTools = [
    buildTool(makeMinimalToolDef({ name: "Bash" })),
    buildTool(makeMinimalToolDef({ name: "Read", aliases: ["FileRead"] })),
    buildTool(makeMinimalToolDef({ name: "Edit" })),
  ];

  test("finds tool by primary name", () => {
    const tool = findToolByName(mockTools, "Bash");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("Bash");
  });

  test("finds tool by alias", () => {
    const tool = findToolByName(mockTools, "FileRead");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("Read");
  });

  test("returns undefined when no match", () => {
    expect(findToolByName(mockTools, "NonExistent")).toBeUndefined();
  });

  test("returns first match when duplicates exist", () => {
    const dupeTools = [
      buildTool(makeMinimalToolDef({ name: "Bash", maxResultSizeChars: 100 })),
      buildTool(makeMinimalToolDef({ name: "Bash", maxResultSizeChars: 200 })),
    ];
    const tool = findToolByName(dupeTools, "Bash");
    expect(tool!.maxResultSizeChars).toBe(100);
  });
});

describe("getEmptyToolPermissionContext", () => {
  test("returns default permission mode", () => {
    const ctx = getEmptyToolPermissionContext();
    expect(ctx.mode).toBe("default");
  });

  test("returns empty maps and arrays", () => {
    const ctx = getEmptyToolPermissionContext();
    expect(ctx.additionalWorkingDirectories.size).toBe(0);
    expect(ctx.alwaysAllowRules).toEqual({});
    expect(ctx.alwaysDenyRules).toEqual({});
    expect(ctx.alwaysAskRules).toEqual({});
  });

  test("returns isBypassPermissionsModeAvailable as false", () => {
    const ctx = getEmptyToolPermissionContext();
    expect(ctx.isBypassPermissionsModeAvailable).toBe(false);
  });
});

describe("filterToolProgressMessages", () => {
  test("filters out hook_progress messages", () => {
    const messages = [
      { data: { type: "hook_progress", hookName: "pre" } },
      { data: { type: "tool_progress", toolName: "Bash" } },
    ] as any[];
    const result = filterToolProgressMessages(messages);
    expect(result).toHaveLength(1);
    expect((result[0]!.data as any).type).toBe("tool_progress");
  });

  test("keeps tool progress messages", () => {
    const messages = [
      { data: { type: "tool_progress", toolName: "Bash" } },
      { data: { type: "tool_progress", toolName: "Read" } },
    ] as any[];
    const result = filterToolProgressMessages(messages);
    expect(result).toHaveLength(2);
  });

  test("returns empty array for empty input", () => {
    expect(filterToolProgressMessages([])).toEqual([]);
  });

  test("handles messages without type field", () => {
    const messages = [
      { data: { toolName: "Bash" } },
      { data: { type: "hook_progress" } },
    ] as any[];
    const result = filterToolProgressMessages(messages);
    expect(result).toHaveLength(1);
  });
});
