import { describe, expect, test } from "bun:test";
import {
  getPastedTextRefNumLines,
  formatPastedTextRef,
  formatImageRef,
  parseReferences,
  expandPastedTextRefs,
} from "../history";

describe("getPastedTextRefNumLines", () => {
  test("returns 0 for single line (no newline)", () => {
    expect(getPastedTextRefNumLines("hello")).toBe(0);
  });

  test("counts LF newlines", () => {
    expect(getPastedTextRefNumLines("a\nb\nc")).toBe(2);
  });

  test("counts CRLF newlines", () => {
    expect(getPastedTextRefNumLines("a\r\nb")).toBe(1);
  });

  test("counts CR newlines", () => {
    expect(getPastedTextRefNumLines("a\rb")).toBe(1);
  });

  test("returns 0 for empty string", () => {
    expect(getPastedTextRefNumLines("")).toBe(0);
  });

  test("trailing newline counts as one", () => {
    expect(getPastedTextRefNumLines("a\n")).toBe(1);
  });
});

describe("formatPastedTextRef", () => {
  test("formats with lines count", () => {
    expect(formatPastedTextRef(1, 10)).toBe("[Pasted text #1 +10 lines]");
  });

  test("formats without lines when 0", () => {
    expect(formatPastedTextRef(3, 0)).toBe("[Pasted text #3]");
  });

  test("formats with large id", () => {
    expect(formatPastedTextRef(99, 5)).toBe("[Pasted text #99 +5 lines]");
  });
});

describe("formatImageRef", () => {
  test("formats image reference", () => {
    expect(formatImageRef(1)).toBe("[Image #1]");
  });

  test("formats with large id", () => {
    expect(formatImageRef(42)).toBe("[Image #42]");
  });
});

describe("parseReferences", () => {
  test("parses Pasted text ref", () => {
    const refs = parseReferences("[Pasted text #1 +5 lines]");
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      id: 1,
      match: "[Pasted text #1 +5 lines]",
      index: 0,
    });
  });

  test("parses Image ref", () => {
    const refs = parseReferences("[Image #2]");
    expect(refs).toHaveLength(1);
    expect(refs[0]!.id).toBe(2);
  });

  test("parses Truncated text ref", () => {
    const refs = parseReferences("[...Truncated text #3]");
    expect(refs).toHaveLength(1);
    expect(refs[0]!.id).toBe(3);
  });

  test("parses Pasted text without line count", () => {
    const refs = parseReferences("[Pasted text #4]");
    expect(refs).toHaveLength(1);
    expect(refs[0]!.id).toBe(4);
  });

  test("parses multiple refs", () => {
    const refs = parseReferences("hello [Pasted text #1] world [Image #2]");
    expect(refs).toHaveLength(2);
    expect(refs[0]!.id).toBe(1);
    expect(refs[1]!.id).toBe(2);
  });

  test("returns empty for no refs", () => {
    expect(parseReferences("plain text")).toEqual([]);
  });

  test("filters out id 0", () => {
    const refs = parseReferences("[Pasted text #0]");
    expect(refs).toHaveLength(0);
  });

  test("captures correct index for embedded refs", () => {
    const input = "prefix [Pasted text #1] suffix";
    const refs = parseReferences(input);
    expect(refs[0]!.index).toBe(7);
  });

  test("handles duplicate refs", () => {
    const refs = parseReferences("[Pasted text #1] and [Pasted text #1]");
    expect(refs).toHaveLength(2);
  });
});

describe("expandPastedTextRefs", () => {
  test("replaces single text ref", () => {
    const input = "look at [Pasted text #1 +2 lines]";
    const pastedContents = {
      1: { id: 1, type: "text" as const, content: "line1\nline2\nline3" },
    };
    const result = expandPastedTextRefs(input, pastedContents);
    expect(result).toBe("look at line1\nline2\nline3");
  });

  test("replaces multiple text refs in reverse order", () => {
    const input = "[Pasted text #1] and [Pasted text #2]";
    const pastedContents = {
      1: { id: 1, type: "text" as const, content: "AAA" },
      2: { id: 2, type: "text" as const, content: "BBB" },
    };
    const result = expandPastedTextRefs(input, pastedContents);
    expect(result).toBe("AAA and BBB");
  });

  test("does not replace image refs", () => {
    const input = "[Image #1]";
    const pastedContents = {
      1: { id: 1, type: "image" as const, content: "data" },
    };
    const result = expandPastedTextRefs(input, pastedContents);
    expect(result).toBe("[Image #1]");
  });

  test("returns original when no refs", () => {
    const input = "no refs here";
    const result = expandPastedTextRefs(input, {});
    expect(result).toBe("no refs here");
  });

  test("skips refs with no matching pasted content", () => {
    const input = "[Pasted text #99 +1 lines]";
    const result = expandPastedTextRefs(input, {});
    expect(result).toBe("[Pasted text #99 +1 lines]");
  });

  test("handles mixed content", () => {
    const input = "see [Pasted text #1] and [Image #2]";
    const pastedContents = {
      1: { id: 1, type: "text" as const, content: "code here" },
      2: { id: 2, type: "image" as const, content: "img data" },
    };
    const result = expandPastedTextRefs(input, pastedContents);
    expect(result).toBe("see code here and [Image #2]");
  });
});
