import { describe, expect, test } from "bun:test";

import {
  truncatePathMiddle,
  truncateToWidth,
  truncateStartToWidth,
  truncateToWidthNoEllipsis,
  truncate,
  wrapText,
} from "../truncate";

// ─── truncateToWidth ────────────────────────────────────────────────────

describe("truncateToWidth", () => {
  test("returns original when within limit", () => {
    expect(truncateToWidth("hello", 10)).toBe("hello");
  });

  test("truncates long string with ellipsis", () => {
    const result = truncateToWidth("hello world", 8);
    expect(result).toBe("hello w…");
  });

  test("returns ellipsis for maxWidth 1", () => {
    expect(truncateToWidth("hello", 1)).toBe("…");
  });

  test("handles empty string", () => {
    expect(truncateToWidth("", 10)).toBe("");
  });

  // ── CJK / wide-character tests ──

  test("truncates CJK string at width boundary (2 per char)", () => {
    expect(truncateToWidth("你好世界", 4)).toBe("你…");
  });

  test("truncates CJK string preserving full characters", () => {
    expect(truncateToWidth("你好世界", 6)).toBe("你好…");
  });

  test("passes through CJK string when within limit", () => {
    expect(truncateToWidth("你好", 4)).toBe("你好");
  });

  test("handles mixed ASCII + CJK", () => {
    expect(truncateToWidth("hello你好", 8)).toBe("hello你…");
  });

  test("passes through mixed ASCII + CJK at exact limit", () => {
    expect(truncateToWidth("hello你好", 9)).toBe("hello你好");
  });

  test("truncates string containing emoji", () => {
    const result = truncateToWidth("hello 👋 world", 10);
    expect(result).toBe("hello 👋 …");
  });

  test("passes through single emoji at sufficient width", () => {
    expect(truncateToWidth("👋", 2)).toBe("👋");
  });
});

// ─── truncateStartToWidth ───────────────────────────────────────────────

describe("truncateStartToWidth", () => {
  test("returns original when within limit", () => {
    expect(truncateStartToWidth("hello", 10)).toBe("hello");
  });

  test("truncates from start with ellipsis prefix", () => {
    expect(truncateStartToWidth("hello world", 8)).toBe("…o world");
  });

  test("returns ellipsis for maxWidth 1", () => {
    expect(truncateStartToWidth("hello", 1)).toBe("…");
  });

  test("truncates CJK from start", () => {
    expect(truncateStartToWidth("你好世界", 4)).toBe("…界");
  });

  test("truncates CJK from start preserving characters", () => {
    expect(truncateStartToWidth("你好世界", 6)).toBe("…世界");
  });
});

// ─── truncateToWidthNoEllipsis ──────────────────────────────────────────

describe("truncateToWidthNoEllipsis", () => {
  test("returns original when within limit", () => {
    expect(truncateToWidthNoEllipsis("hello", 10)).toBe("hello");
  });

  test("truncates without ellipsis", () => {
    const result = truncateToWidthNoEllipsis("hello world", 5);
    expect(result).toBe("hello");
    expect(result.includes("…")).toBe(false);
  });

  test("returns empty for maxWidth 0", () => {
    expect(truncateToWidthNoEllipsis("hello", 0)).toBe("");
  });

  test("truncates CJK without ellipsis", () => {
    expect(truncateToWidthNoEllipsis("你好世界", 4)).toBe("你好");
  });
});

// ─── truncatePathMiddle ─────────────────────────────────────────────────

describe("truncatePathMiddle", () => {
  test("returns original when path fits", () => {
    expect(truncatePathMiddle("src/index.ts", 50)).toBe("src/index.ts");
  });

  test("truncates middle of long path", () => {
    const path = "src/components/deeply/nested/folder/MyComponent.tsx";
    const result = truncatePathMiddle(path, 30);
    expect(result).toContain("…");
    expect(result.endsWith("MyComponent.tsx")).toBe(true);
  });

  test("returns ellipsis for maxLength 0", () => {
    expect(truncatePathMiddle("src/index.ts", 0)).toBe("…");
  });

  test("handles path without slashes", () => {
    const result = truncatePathMiddle("verylongfilename.ts", 10);
    expect(result).toContain("…");
  });

  test("handles short maxLength < 5", () => {
    expect(truncatePathMiddle("src/components/foo.ts", 4)).toBe("src…");
  });

  test("handles very short maxLength 1", () => {
    expect(truncatePathMiddle("/a/b", 1)).toBe("…");
  });
});

// ─── truncate ───────────────────────────────────────────────────────────

describe("truncate", () => {
  test("returns original when within limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  test("truncates long string", () => {
    const result = truncate("hello world foo bar", 10);
    expect(result).toContain("…");
  });

  test("truncates at newline in singleLine mode", () => {
    const result = truncate("first line\nsecond line", 50, true);
    expect(result).toBe("first line…");
  });

  test("does not truncate at newline when singleLine is false", () => {
    const result = truncate("first\nsecond", 50, false);
    expect(result).toBe("first\nsecond");
  });

  test("truncates singleLine when first line exceeds maxWidth", () => {
    const result = truncate("a very long first line\nsecond", 10, true);
    expect(result).toContain("…");
    expect(result).not.toContain("\n");
  });
});

// ─── wrapText ───────────────────────────────────────────────────────────

describe("wrapText", () => {
  test("wraps text at specified width", () => {
    const result = wrapText("hello world", 6);
    expect(result.length).toBeGreaterThan(1);
  });

  test("returns single line when text fits", () => {
    expect(wrapText("hello", 10)).toEqual(["hello"]);
  });

  test("handles empty string", () => {
    expect(wrapText("", 10)).toEqual([]);
  });

  test("wraps each character on width 1", () => {
    const result = wrapText("abc", 1);
    expect(result).toEqual(["a", "b", "c"]);
  });
});
