import { describe, expect, test } from "bun:test";
import { objectGroupBy } from "../objectGroupBy";

describe("objectGroupBy", () => {
  test("groups items by key", () => {
    const result = objectGroupBy([1, 2, 3, 4], (n) =>
      n % 2 === 0 ? "even" : "odd"
    );
    expect(result.even).toEqual([2, 4]);
    expect(result.odd).toEqual([1, 3]);
  });

  test("returns empty object for empty input", () => {
    const result = objectGroupBy([], () => "key");
    expect(Object.keys(result)).toHaveLength(0);
  });

  test("handles single group", () => {
    const result = objectGroupBy(["a", "b", "c"], () => "all");
    expect(result.all).toEqual(["a", "b", "c"]);
  });

  test("passes index to keySelector", () => {
    const result = objectGroupBy(["a", "b", "c", "d"], (_, i) =>
      i < 2 ? "first" : "second"
    );
    expect(result.first).toEqual(["a", "b"]);
    expect(result.second).toEqual(["c", "d"]);
  });

  test("works with objects", () => {
    const items = [
      { name: "Alice", role: "admin" },
      { name: "Bob", role: "user" },
      { name: "Charlie", role: "admin" },
    ];
    const result = objectGroupBy(items, (item) => item.role);
    expect(result.admin).toHaveLength(2);
    expect(result.user).toHaveLength(1);
  });

  test("handles key function returning undefined", () => {
    const result = objectGroupBy([1, 2, 3], () => undefined as any);
    expect(result["undefined"]).toEqual([1, 2, 3]);
  });

  test("handles keys with special characters", () => {
    const result = objectGroupBy(
      [{ key: "a/b" }, { key: "a.b" }, { key: "a/b" }],
      (item) => item.key
    );
    expect(result["a/b"]).toHaveLength(2);
    expect(result["a.b"]).toHaveLength(1);
  });
});
