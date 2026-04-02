import { describe, expect, test } from "bun:test";
import {
  parseArguments,
  parseArgumentNames,
  generateProgressiveArgumentHint,
  substituteArguments,
} from "../argumentSubstitution";

// ─── parseArguments ─────────────────────────────────────────────────────

describe("parseArguments", () => {
  test("splits simple arguments", () => {
    expect(parseArguments("foo bar baz")).toEqual(["foo", "bar", "baz"]);
  });

  test("handles quoted strings", () => {
    expect(parseArguments('foo "hello world" baz')).toEqual([
      "foo",
      "hello world",
      "baz",
    ]);
  });

  test("handles single-quoted strings", () => {
    expect(parseArguments("foo 'hello world' baz")).toEqual([
      "foo",
      "hello world",
      "baz",
    ]);
  });

  test("handles escaped quotes inside quoted strings", () => {
    expect(parseArguments('foo "hello \\"world\\"" baz')).toEqual([
      "foo",
      'hello "world"',
      "baz",
    ]);
  });

  test("returns empty for empty string", () => {
    expect(parseArguments("")).toEqual([]);
  });

  test("returns empty for whitespace only", () => {
    expect(parseArguments("   ")).toEqual([]);
  });
});

// ─── parseArgumentNames ─────────────────────────────────────────────────

describe("parseArgumentNames", () => {
  test("parses space-separated string", () => {
    expect(parseArgumentNames("foo bar baz")).toEqual(["foo", "bar", "baz"]);
  });

  test("accepts array input", () => {
    expect(parseArgumentNames(["foo", "bar"])).toEqual(["foo", "bar"]);
  });

  test("filters out numeric-only names", () => {
    expect(parseArgumentNames("foo 123 bar")).toEqual(["foo", "bar"]);
  });

  test("filters out empty strings", () => {
    expect(parseArgumentNames(["foo", "", "bar"])).toEqual(["foo", "bar"]);
  });

  test("returns empty for undefined", () => {
    expect(parseArgumentNames(undefined)).toEqual([]);
  });
});

// ─── generateProgressiveArgumentHint ────────────────────────────────────

describe("generateProgressiveArgumentHint", () => {
  test("shows remaining arguments", () => {
    expect(generateProgressiveArgumentHint(["a", "b", "c"], ["x"])).toBe(
      "[b] [c]"
    );
  });

  test("returns undefined when all filled", () => {
    expect(
      generateProgressiveArgumentHint(["a"], ["x"])
    ).toBeUndefined();
  });

  test("shows all when none typed", () => {
    expect(generateProgressiveArgumentHint(["a", "b"], [])).toBe("[a] [b]");
  });
});

// ─── substituteArguments ────────────────────────────────────────────────

describe("substituteArguments", () => {
  test("replaces $ARGUMENTS with full args", () => {
    expect(substituteArguments("run $ARGUMENTS", "foo bar")).toBe(
      "run foo bar"
    );
  });

  test("replaces indexed $ARGUMENTS[0]", () => {
    expect(substituteArguments("run $ARGUMENTS[0]", "foo bar")).toBe("run foo");
  });

  test("replaces shorthand $0, $1", () => {
    expect(substituteArguments("$0 and $1", "hello world")).toBe(
      "hello and world"
    );
  });

  test("replaces out-of-range index with empty string", () => {
    expect(substituteArguments("$5", "hello world")).toBe("");
  });

  test("reuses same placeholder multiple times", () => {
    expect(substituteArguments("cmd $0 $1 $0", "alpha beta")).toBe(
      "cmd alpha beta alpha"
    );
  });

  test("replaces named arguments", () => {
    expect(
      substituteArguments("file: $name", "test.txt", true, ["name"])
    ).toBe("file: test.txt");
  });

  test("returns content unchanged for undefined args", () => {
    expect(substituteArguments("hello", undefined)).toBe("hello");
  });

  test("appends ARGUMENTS when no placeholder found", () => {
    expect(substituteArguments("run this", "extra")).toBe(
      "run this\n\nARGUMENTS: extra"
    );
  });

  test("does not append when appendIfNoPlaceholder is false", () => {
    expect(substituteArguments("run this", "extra", false)).toBe("run this");
  });

  test("does not append for empty args string", () => {
    expect(substituteArguments("run this", "")).toBe("run this");
  });
});
