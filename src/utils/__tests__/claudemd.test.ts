import { describe, expect, test } from "bun:test";
import {
  stripHtmlComments,
  isMemoryFilePath,
  getLargeMemoryFiles,
  MAX_MEMORY_CHARACTER_COUNT,
  type MemoryFileInfo,
} from "../claudemd";

function mockMemoryFile(overrides: Partial<MemoryFileInfo> = {}): MemoryFileInfo {
  return {
    path: "/project/CLAUDE.md",
    type: "Project",
    content: "test content",
    ...overrides,
  };
}

describe("stripHtmlComments", () => {
  test("strips block-level HTML comments (own line)", () => {
    // CommonMark type-2 HTML blocks: comment must start at beginning of line
    const result = stripHtmlComments("text\n<!-- block comment -->\nmore");
    expect(result.content).not.toContain("block comment");
    expect(result.stripped).toBe(true);
  });

  test("returns stripped: false when no comments", () => {
    const result = stripHtmlComments("no comments here");
    expect(result.stripped).toBe(false);
    expect(result.content).toBe("no comments here");
  });

  test("returns stripped: true when block comments exist", () => {
    const result = stripHtmlComments("hello\n<!-- world -->\nend");
    expect(result.stripped).toBe(true);
  });

  test("handles empty string", () => {
    const result = stripHtmlComments("");
    expect(result.content).toBe("");
    expect(result.stripped).toBe(false);
  });

  test("handles multiple block comments", () => {
    const result = stripHtmlComments(
      "a\n<!-- c1 -->\nb\n<!-- c2 -->\nc"
    );
    expect(result.content).not.toContain("c1");
    expect(result.content).not.toContain("c2");
    expect(result.stripped).toBe(true);
  });

  test("preserves code block content", () => {
    const input = "text\n```html\n<!-- not stripped -->\n```\nmore";
    const result = stripHtmlComments(input);
    expect(result.content).toContain("<!-- not stripped -->");
  });

  test("preserves inline comments within paragraphs", () => {
    // Inline comments are NOT stripped (CommonMark paragraph semantics)
    const result = stripHtmlComments("text <!-- inline --> more");
    expect(result.content).toContain("<!-- inline -->");
    expect(result.stripped).toBe(false);
  });

  test("leaves unclosed HTML comment unchanged", () => {
    const result = stripHtmlComments("<!-- no close some text");
    expect(result.content).toBe("<!-- no close some text");
    expect(result.stripped).toBe(false);
  });

  test("strips comment and keeps same-line residual content", () => {
    const result = stripHtmlComments("<!-- note -->some text");
    expect(result.content).toContain("some text");
    expect(result.content).not.toContain("<!--");
    expect(result.stripped).toBe(true);
  });
});

describe("isMemoryFilePath", () => {
  test("returns true for CLAUDE.md path", () => {
    expect(isMemoryFilePath("/project/CLAUDE.md")).toBe(true);
  });

  test("returns true for CLAUDE.local.md path", () => {
    expect(isMemoryFilePath("/project/CLAUDE.local.md")).toBe(true);
  });

  test("returns true for .claude/rules/ path", () => {
    expect(isMemoryFilePath("/project/.claude/rules/foo.md")).toBe(true);
  });

  test("returns false for regular file", () => {
    expect(isMemoryFilePath("/project/src/main.ts")).toBe(false);
  });

  test("returns false for unrelated .md file", () => {
    expect(isMemoryFilePath("/project/README.md")).toBe(false);
  });

  test("returns false for .claude directory non-rules file", () => {
    expect(isMemoryFilePath("/project/.claude/settings.json")).toBe(false);
  });

  test("returns false for lowercase claude.md (case-sensitive match)", () => {
    expect(isMemoryFilePath("/project/claude.md")).toBe(false);
  });

  test("returns false for non-.md file in .claude/rules/", () => {
    expect(isMemoryFilePath(".claude/rules/foo.txt")).toBe(false);
  });
});

describe("getLargeMemoryFiles", () => {
  test("returns files exceeding threshold", () => {
    const largeContent = "x".repeat(MAX_MEMORY_CHARACTER_COUNT + 1);
    const files = [
      mockMemoryFile({ content: "small" }),
      mockMemoryFile({ content: largeContent, path: "/big.md" }),
    ];
    const result = getLargeMemoryFiles(files);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("/big.md");
  });

  test("returns empty array when all files are small", () => {
    const files = [
      mockMemoryFile({ content: "small" }),
      mockMemoryFile({ content: "also small" }),
    ];
    expect(getLargeMemoryFiles(files)).toEqual([]);
  });

  test("correctly identifies threshold boundary", () => {
    const atThreshold = "x".repeat(MAX_MEMORY_CHARACTER_COUNT);
    const overThreshold = "x".repeat(MAX_MEMORY_CHARACTER_COUNT + 1);
    const files = [
      mockMemoryFile({ content: atThreshold }),
      mockMemoryFile({ content: overThreshold }),
    ];
    const result = getLargeMemoryFiles(files);
    expect(result).toHaveLength(1);
  });

  test("returns empty array for empty input", () => {
    expect(getLargeMemoryFiles([])).toEqual([]);
  });
});
