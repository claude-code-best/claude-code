import { describe, expect, test } from "bun:test";
import { sequential } from "../sequential";

describe("sequential", () => {
  test("wraps async function, returns same result", async () => {
    const fn = sequential(async (x: number) => x * 2);
    expect(await fn(5)).toBe(10);
  });

  test("single call resolves normally", async () => {
    const fn = sequential(async () => "ok");
    expect(await fn()).toBe("ok");
  });

  test("concurrent calls execute sequentially (FIFO order)", async () => {
    const order: number[] = [];
    const fn = sequential(async (n: number) => {
      order.push(n);
      await new Promise(r => setTimeout(r, 10));
      return n;
    });

    const results = await Promise.all([fn(1), fn(2), fn(3)]);
    expect(results).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
  });

  test("preserves arguments correctly", async () => {
    const fn = sequential(async (a: number, b: string) => `${a}-${b}`);
    expect(await fn(42, "test")).toBe("42-test");
  });

  test("error in first call does not block subsequent calls", async () => {
    let callCount = 0;
    const fn = sequential(async () => {
      callCount++;
      if (callCount === 1) throw new Error("first fail");
      return "ok";
    });

    await expect(fn()).rejects.toThrow("first fail");
    expect(await fn()).toBe("ok");
  });

  test("preserves rejection reason", async () => {
    const fn = sequential(async () => {
      throw new Error("specific error");
    });
    await expect(fn()).rejects.toThrow("specific error");
  });

  test("multiple args passed correctly", async () => {
    const fn = sequential(async (a: number, b: number, c: number) => a + b + c);
    expect(await fn(1, 2, 3)).toBe(6);
  });

  test("returns different wrapper for each call to sequential", () => {
    const fn1 = sequential(async () => 1);
    const fn2 = sequential(async () => 2);
    expect(fn1).not.toBe(fn2);
  });

  test("handles rapid concurrent calls", async () => {
    const order: number[] = [];
    const fn = sequential(async (n: number) => {
      order.push(n);
      return n;
    });

    const promises = Array.from({ length: 10 }, (_, i) => fn(i));
    const results = await Promise.all(promises);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test("execution order matches call order", async () => {
    const log: string[] = [];
    const fn = sequential(async (label: string) => {
      log.push(`start:${label}`);
      await new Promise(r => setTimeout(r, 5));
      log.push(`end:${label}`);
      return label;
    });

    await Promise.all([fn("a"), fn("b")]);
    expect(log[0]).toBe("start:a");
    expect(log[1]).toBe("end:a");
    expect(log[2]).toBe("start:b");
    expect(log[3]).toBe("end:b");
  });

  test("works with functions returning different types", async () => {
    const fn = sequential(async (x: number): Promise<string | number> => {
      return x > 0 ? "positive" : x;
    });
    expect(await fn(5)).toBe("positive");
    expect(await fn(-1)).toBe(-1);
  });
});
