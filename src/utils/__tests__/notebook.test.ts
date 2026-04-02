import { describe, expect, test } from "bun:test";
import { parseCellId, mapNotebookCellsToToolResult } from "../notebook";

// ─── parseCellId ───────────────────────────────────────────────────────

describe("parseCellId", () => {
  test("parses cell-0 to 0", () => {
    expect(parseCellId("cell-0")).toBe(0);
  });

  test("parses cell-5 to 5", () => {
    expect(parseCellId("cell-5")).toBe(5);
  });

  test("parses cell-100 to 100", () => {
    expect(parseCellId("cell-100")).toBe(100);
  });

  test("returns undefined for cell- (no number)", () => {
    expect(parseCellId("cell-")).toBeUndefined();
  });

  test("returns undefined for cell-abc (non-numeric)", () => {
    expect(parseCellId("cell-abc")).toBeUndefined();
  });

  test("returns undefined for other-format", () => {
    expect(parseCellId("other-format")).toBeUndefined();
  });

  test("returns undefined for empty string", () => {
    expect(parseCellId("")).toBeUndefined();
  });

  test("returns undefined for prefix-only match like cell-0-extra", () => {
    // regex is /^cell-(\d+)$/ so trailing text should fail
    expect(parseCellId("cell-0-extra")).toBeUndefined();
  });

  test("returns undefined for negative numbers", () => {
    expect(parseCellId("cell--1")).toBeUndefined();
  });

  test("parses leading zeros correctly", () => {
    expect(parseCellId("cell-007")).toBe(7);
  });
});

// ─── mapNotebookCellsToToolResult ──────────────────────────────────────

describe("mapNotebookCellsToToolResult", () => {
  test("returns tool result with correct tool_use_id", () => {
    const data = [
      {
        cellType: "code",
        source: 'print("hello")',
        cell_id: "cell-0",
        language: "python",
      },
    ];

    const result = mapNotebookCellsToToolResult(data, "tool-123");
    expect(result.tool_use_id).toBe("tool-123");
    expect(result.type).toBe("tool_result");
  });

  test("content array contains text blocks for cell content", () => {
    const data = [
      {
        cellType: "code",
        source: 'x = 1',
        cell_id: "cell-0",
        language: "python",
      },
    ];

    const result = mapNotebookCellsToToolResult(data, "tool-1");
    expect(result.content).toBeInstanceOf(Array);
    expect(result.content!.length).toBeGreaterThanOrEqual(1);

    const firstBlock = result.content![0] as { type: string; text: string };
    expect(firstBlock.type).toBe("text");
    expect(firstBlock.text).toContain('cell id="cell-0"');
    expect(firstBlock.text).toContain("x = 1");
  });

  test("merges adjacent text blocks from multiple cells", () => {
    const data = [
      {
        cellType: "code",
        source: "a = 1",
        cell_id: "cell-0",
        language: "python",
      },
      {
        cellType: "code",
        source: "b = 2",
        cell_id: "cell-1",
        language: "python",
      },
    ];

    const result = mapNotebookCellsToToolResult(data, "tool-2");
    // Two adjacent text blocks should be merged into one
    const textBlocks = result.content!.filter(
      (b: any) => b.type === "text"
    );
    expect(textBlocks).toHaveLength(1);
  });

  test("preserves image blocks without merging", () => {
    const data = [
      {
        cellType: "code",
        source: "plot()",
        cell_id: "cell-0",
        language: "python",
        outputs: [
          {
            output_type: "display_data",
            text: "",
            image: {
              image_data: "iVBORw0KGgo=",
              media_type: "image/png" as const,
            },
          },
        ],
      },
      {
        cellType: "code",
        source: "print(1)",
        cell_id: "cell-1",
        language: "python",
      },
    ];

    const result = mapNotebookCellsToToolResult(data, "tool-3");
    const types = result.content!.map((b: any) => b.type);
    expect(types).toContain("image");
  });

  test("markdown cell includes cell_type metadata", () => {
    const data = [
      {
        cellType: "markdown",
        source: "# Title",
        cell_id: "cell-0",
      },
    ];

    const result = mapNotebookCellsToToolResult(data, "tool-4");
    const textBlock = result.content![0] as { type: string; text: string };
    expect(textBlock.text).toContain("<cell_type>markdown</cell_type>");
  });

  test("non-python code cell includes language metadata", () => {
    const data = [
      {
        cellType: "code",
        source: "val x = 1",
        cell_id: "cell-0",
        language: "scala",
      },
    ];

    const result = mapNotebookCellsToToolResult(data, "tool-5");
    const textBlock = result.content![0] as { type: string; text: string };
    expect(textBlock.text).toContain("<language>scala</language>");
  });
});
