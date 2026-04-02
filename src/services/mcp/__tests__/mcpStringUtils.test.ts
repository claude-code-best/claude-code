import { describe, expect, test } from "bun:test";
import {
  mcpInfoFromString,
  buildMcpToolName,
  getMcpPrefix,
  getMcpDisplayName,
  getToolNameForPermissionCheck,
  extractMcpToolDisplayName,
} from "../mcpStringUtils";

// ─── mcpInfoFromString ─────────────────────────────────────────────────

describe("mcpInfoFromString", () => {
  test("parses standard mcp tool name", () => {
    const result = mcpInfoFromString("mcp__github__list_issues");
    expect(result).toEqual({ serverName: "github", toolName: "list_issues" });
  });

  test("returns null for non-mcp string", () => {
    expect(mcpInfoFromString("Bash")).toBeNull();
    expect(mcpInfoFromString("grep__pattern")).toBeNull();
  });

  test("returns null when no server name", () => {
    expect(mcpInfoFromString("mcp__")).toBeNull();
  });

  test("handles server name only (no tool)", () => {
    const result = mcpInfoFromString("mcp__server");
    expect(result).toEqual({ serverName: "server", toolName: undefined });
  });

  test("preserves double underscores in tool name", () => {
    const result = mcpInfoFromString("mcp__server__tool__with__underscores");
    expect(result).toEqual({
      serverName: "server",
      toolName: "tool__with__underscores",
    });
  });

  test("returns null for empty string", () => {
    expect(mcpInfoFromString("")).toBeNull();
  });
});

// ─── getMcpPrefix ──────────────────────────────────────────────────────

describe("getMcpPrefix", () => {
  test("creates prefix from server name", () => {
    expect(getMcpPrefix("github")).toBe("mcp__github__");
  });

  test("normalizes server name with special chars", () => {
    expect(getMcpPrefix("my-server")).toBe("mcp__my-server__");
  });

  test("normalizes dots to underscores", () => {
    expect(getMcpPrefix("my.server")).toBe("mcp__my_server__");
  });
});

// ─── buildMcpToolName ──────────────────────────────────────────────────

describe("buildMcpToolName", () => {
  test("builds fully qualified name", () => {
    expect(buildMcpToolName("github", "list_issues")).toBe(
      "mcp__github__list_issues"
    );
  });

  test("normalizes both server and tool names", () => {
    expect(buildMcpToolName("my.server", "my.tool")).toBe(
      "mcp__my_server__my_tool"
    );
  });
});

// ─── getMcpDisplayName ─────────────────────────────────────────────────

describe("getMcpDisplayName", () => {
  test("strips mcp prefix from full name", () => {
    expect(getMcpDisplayName("mcp__github__list_issues", "github")).toBe(
      "list_issues"
    );
  });

  test("returns full name if prefix doesn't match", () => {
    expect(getMcpDisplayName("mcp__other__tool", "github")).toBe(
      "mcp__other__tool"
    );
  });
});

// ─── getToolNameForPermissionCheck ─────────────────────────────────────

describe("getToolNameForPermissionCheck", () => {
  test("returns built MCP name for MCP tools", () => {
    const tool = {
      name: "list_issues",
      mcpInfo: { serverName: "github", toolName: "list_issues" },
    };
    expect(getToolNameForPermissionCheck(tool)).toBe(
      "mcp__github__list_issues"
    );
  });

  test("returns tool name for non-MCP tools", () => {
    const tool = { name: "Bash" };
    expect(getToolNameForPermissionCheck(tool)).toBe("Bash");
  });

  test("returns tool name when mcpInfo is undefined", () => {
    const tool = { name: "Write", mcpInfo: undefined };
    expect(getToolNameForPermissionCheck(tool)).toBe("Write");
  });
});

// ─── extractMcpToolDisplayName ─────────────────────────────────────────

describe("extractMcpToolDisplayName", () => {
  test("extracts display name from full user-facing name", () => {
    expect(
      extractMcpToolDisplayName("github - Add comment to issue (MCP)")
    ).toBe("Add comment to issue");
  });

  test("removes (MCP) suffix only", () => {
    expect(extractMcpToolDisplayName("simple-tool (MCP)")).toBe("simple-tool");
  });

  test("handles name without (MCP) suffix", () => {
    expect(extractMcpToolDisplayName("github - List issues")).toBe(
      "List issues"
    );
  });

  test("handles name without dash separator", () => {
    expect(extractMcpToolDisplayName("just-a-name")).toBe("just-a-name");
  });
});
