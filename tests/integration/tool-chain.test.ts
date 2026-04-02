import { describe, expect, test } from "bun:test";
import { getAllBaseTools, parseToolPreset, getTools } from "../../src/tools.ts";
import {
  findToolByName,
  getEmptyToolPermissionContext,
  buildTool,
} from "../../src/Tool.ts";

// ─── Tool Registration & Discovery ──────────────────────────────────────

describe("Tool chain: registration and discovery", () => {
  test("getAllBaseTools returns a non-empty array of tools", () => {
    const tools = getAllBaseTools();
    expect(tools.length).toBeGreaterThan(0);
  });

  test("all base tools have required fields", () => {
    const tools = getAllBaseTools();
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.call).toBe("function");
    }
  });

  test("findToolByName finds core tools from the full list", () => {
    const tools = getAllBaseTools();
    const bash = findToolByName(tools, "Bash");
    expect(bash).toBeDefined();
    expect(bash!.name).toBe("Bash");

    const read = findToolByName(tools, "Read");
    expect(read).toBeDefined();
    expect(read!.name).toBe("Read");

    const edit = findToolByName(tools, "Edit");
    expect(edit).toBeDefined();
    expect(edit!.name).toBe("Edit");
  });

  test("findToolByName returns undefined for non-existent tool", () => {
    const tools = getAllBaseTools();
    expect(findToolByName(tools, "NonExistentTool")).toBeUndefined();
  });

  test("findToolByName is case-sensitive (exact match only)", () => {
    const tools = getAllBaseTools();
    expect(findToolByName(tools, "Bash")).toBeDefined();
    expect(findToolByName(tools, "bash")).toBeUndefined();
  });

  test("findToolByName resolves via toolMatchesName", () => {
    const tools = getAllBaseTools();
    const agent = findToolByName(tools, "Agent");
    expect(agent).toBeDefined();
    // Verify it can also find by checking name directly
    expect(tools.some(t => t.name === "Agent")).toBe(true);
  });

  test("tool names are unique across the base tool list", () => {
    const tools = getAllBaseTools();
    const names = tools.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

// ─── Tool Presets ──────────────────────────────────────────────────────

describe("Tool chain: presets", () => {
  test('parseToolPreset("default") returns "default" string', () => {
    // parseToolPreset returns a preset name string, not a tool array
    expect(parseToolPreset("default")).toBe("default");
  });

  test("parseToolPreset returns null for unknown preset", () => {
    expect(parseToolPreset("nonexistent")).toBeNull();
  });

  test("parseToolPreset is case-insensitive", () => {
    expect(parseToolPreset("DEFAULT")).toBe("default");
  });
});

// ─── getTools (with permission context) ────────────────────────────────

describe("Tool chain: getTools with context", () => {
  test("getTools returns tools (subset of base tools)", () => {
    const allTools = getAllBaseTools();
    const ctx = getEmptyToolPermissionContext();
    const tools = getTools(ctx);
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.length).toBeLessThanOrEqual(allTools.length);
  });

  test("getTools results all have name and call function", () => {
    const ctx = getEmptyToolPermissionContext();
    const tools = getTools(ctx);
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(typeof tool.call).toBe("function");
    }
  });
});

// ─── buildTool + findToolByName end-to-end ─────────────────────────────

describe("Tool chain: buildTool + findToolByName", () => {
  test("a built tool can be found in a custom list", () => {
    const customTool = buildTool({
      name: "TestTool",
      description: "A test tool",
      inputSchema: {
        type: "object" as const,
        properties: { input: { type: "string" } },
        required: ["input"],
      },
      call: async () => ({ output: "test" }),
    });

    const found = findToolByName([customTool], "TestTool");
    expect(found).toBe(customTool);
  });

  test("built tool defaults are correctly applied", () => {
    const tool = buildTool({
      name: "MinimalTool",
      description: "Minimal",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
      call: async () => ({}),
    });

    expect(tool.isEnabled()).toBe(true);
    expect(tool.isConcurrencySafe()).toBe(false);
    expect(tool.isReadOnly()).toBe(false);
    expect(tool.isDestructive()).toBe(false);
  });
});
