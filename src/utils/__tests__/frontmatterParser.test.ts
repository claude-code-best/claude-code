import { describe, expect, test } from "bun:test";
import {
  parseFrontmatter,
  splitPathInFrontmatter,
  parsePositiveIntFromFrontmatter,
  parseBooleanFrontmatter,
  parseShellFrontmatter,
} from "../frontmatterParser";

describe("parseFrontmatter", () => {
  test("parses valid frontmatter", () => {
    const md = `---
description: A test
type: user
---
Content here`;
    const result = parseFrontmatter(md);
    expect(result.frontmatter.description).toBe("A test");
    expect(result.frontmatter.type).toBe("user");
    expect(result.content).toBe("Content here");
  });

  test("returns empty frontmatter when none exists", () => {
    const md = "Just content, no frontmatter";
    const result = parseFrontmatter(md);
    expect(result.frontmatter).toEqual({});
    expect(result.content).toBe(md);
  });

  test("handles empty frontmatter block", () => {
    const md = `---
---
Content`;
    const result = parseFrontmatter(md);
    expect(result.frontmatter).toEqual({});
    expect(result.content).toBe("Content");
  });

  test("handles frontmatter with list values", () => {
    const md = `---
allowed-tools:
  - Bash
  - Read
---
Content`;
    const result = parseFrontmatter(md);
    expect(result.frontmatter["allowed-tools"]).toEqual(["Bash", "Read"]);
  });
});

describe("splitPathInFrontmatter", () => {
  test("splits comma-separated paths", () => {
    expect(splitPathInFrontmatter("a, b, c")).toEqual(["a", "b", "c"]);
  });

  test("expands brace patterns", () => {
    expect(splitPathInFrontmatter("src/*.{ts,tsx}")).toEqual([
      "src/*.ts",
      "src/*.tsx",
    ]);
  });

  test("handles nested brace expansion", () => {
    expect(splitPathInFrontmatter("{a,b}/{c,d}")).toEqual([
      "a/c", "a/d", "b/c", "b/d",
    ]);
  });

  test("handles array input", () => {
    expect(splitPathInFrontmatter(["a", "b"])).toEqual(["a", "b"]);
  });

  test("returns empty array for non-string", () => {
    expect(splitPathInFrontmatter(123 as any)).toEqual([]);
  });

  test("preserves braces in comma-separated list", () => {
    expect(splitPathInFrontmatter("a, src/*.{ts,tsx}")).toEqual([
      "a",
      "src/*.ts",
      "src/*.tsx",
    ]);
  });
});

describe("parsePositiveIntFromFrontmatter", () => {
  test("returns number for positive integer", () => {
    expect(parsePositiveIntFromFrontmatter(5)).toBe(5);
  });

  test("parses string number", () => {
    expect(parsePositiveIntFromFrontmatter("10")).toBe(10);
  });

  test("returns undefined for zero", () => {
    expect(parsePositiveIntFromFrontmatter(0)).toBeUndefined();
  });

  test("returns undefined for negative number", () => {
    expect(parsePositiveIntFromFrontmatter(-1)).toBeUndefined();
  });

  test("returns undefined for float", () => {
    expect(parsePositiveIntFromFrontmatter(1.5)).toBeUndefined();
  });

  test("returns undefined for null/undefined", () => {
    expect(parsePositiveIntFromFrontmatter(null)).toBeUndefined();
    expect(parsePositiveIntFromFrontmatter(undefined)).toBeUndefined();
  });

  test("returns undefined for non-numeric string", () => {
    expect(parsePositiveIntFromFrontmatter("abc")).toBeUndefined();
  });
});

describe("parseBooleanFrontmatter", () => {
  test("returns true for boolean true", () => {
    expect(parseBooleanFrontmatter(true)).toBe(true);
  });

  test("returns true for string 'true'", () => {
    expect(parseBooleanFrontmatter("true")).toBe(true);
  });

  test("returns false for boolean false", () => {
    expect(parseBooleanFrontmatter(false)).toBe(false);
  });

  test("returns false for string 'false'", () => {
    expect(parseBooleanFrontmatter("false")).toBe(false);
  });

  test("returns false for null/undefined", () => {
    expect(parseBooleanFrontmatter(null)).toBe(false);
    expect(parseBooleanFrontmatter(undefined)).toBe(false);
  });
});

describe("parseShellFrontmatter", () => {
  test("returns bash for 'bash'", () => {
    expect(parseShellFrontmatter("bash", "test")).toBe("bash");
  });

  test("returns powershell for 'powershell'", () => {
    expect(parseShellFrontmatter("powershell", "test")).toBe("powershell");
  });

  test("returns undefined for null", () => {
    expect(parseShellFrontmatter(null, "test")).toBeUndefined();
  });

  test("returns undefined for unrecognized value", () => {
    expect(parseShellFrontmatter("zsh", "test")).toBeUndefined();
  });

  test("is case insensitive", () => {
    expect(parseShellFrontmatter("BASH", "test")).toBe("bash");
  });

  test("returns undefined for empty string", () => {
    expect(parseShellFrontmatter("", "test")).toBeUndefined();
  });
});
