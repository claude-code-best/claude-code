import { mock, describe, expect, test } from "bun:test";

mock.module("figures", () => ({
  default: {
    lineUpDownRight: "├",
    lineUpRight: "└",
    lineVertical: "│",
  },
}));

mock.module("src/components/design-system/color.js", () => ({
  color: (colorKey: string, themeName: string) => (text: string) => text,
}));

const { treeify } = await import("../treeify");

describe("treeify", () => {
  test("renders flat tree with two keys", () => {
    const result = treeify({ a: "value-a", b: "value-b" });
    const lines = result.split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("a");
    expect(lines[0]).toContain("value-a");
    expect(lines[1]).toContain("b");
    expect(lines[1]).toContain("value-b");
  });

  test("uses branch character for non-last items", () => {
    const result = treeify({ a: "1", b: "2" });
    // First item uses ├ (branch), last uses └ (lastBranch)
    expect(result).toContain("├");
    expect(result).toContain("└");
  });

  test("uses lastBranch for single item", () => {
    const result = treeify({ only: "val" });
    expect(result).toContain("└");
    expect(result).not.toContain("├");
  });

  test("renders nested objects", () => {
    const result = treeify({ parent: { child: "val" } });
    expect(result).toContain("parent");
    expect(result).toContain("child");
    expect(result).toContain("val");
  });

  test("renders arrays with length", () => {
    const result = treeify({ items: [1, 2, 3] });
    expect(result).toContain("items");
    expect(result).toContain("[Array(3)]");
  });

  test("detects circular references", () => {
    const obj: Record<string, unknown> = { name: "root" };
    obj.self = obj;
    const result = treeify(obj);
    expect(result).toContain("[Circular]");
  });

  test("returns (empty) for empty object", () => {
    const result = treeify({});
    expect(result).toBe("(empty)");
  });

  test("hideFunctions filters out function values", () => {
    const obj = { name: "test", fn: () => {} };
    const result = treeify(obj, { hideFunctions: true });
    expect(result).toContain("name");
    expect(result).not.toContain("fn");
  });

  test("showValues false hides leaf values", () => {
    const obj = { name: "test" };
    const result = treeify(obj, { showValues: false });
    expect(result).toContain("name");
    expect(result).not.toContain("test");
  });

  test("showValues true shows function as [Function]", () => {
    const obj = { fn: () => {} };
    const result = treeify(obj, { showValues: true });
    expect(result).toContain("[Function]");
  });

  test("deep nesting produces correct indentation", () => {
    const obj = { a: { b: { c: "deep" } } };
    const result = treeify(obj);
    const lines = result.split("\n");
    expect(lines.length).toBe(3);
    // Each level adds indentation
    expect(lines[2].length).toBeGreaterThan(lines[1].length);
  });

  test("handles empty string key with string value", () => {
    const obj = { " ": "whitespace-key" };
    const result = treeify(obj);
    expect(result).toContain("whitespace-key");
  });

  test("handles mixed object and primitive values", () => {
    const obj = { name: "test", nested: { inner: "val" }, count: 5 };
    const result = treeify(obj);
    expect(result).toContain("name");
    expect(result).toContain("nested");
    expect(result).toContain("inner");
    expect(result).toContain("count");
  });
});
