import { mock, describe, expect, test, beforeEach } from "bun:test";
import { logMock } from "../../../tests/mocks/log";

// Mock log.ts to cut the bootstrap/state dependency chain
mock.module("src/utils/log.ts", logMock);

const { memoizeWithTTL, memoizeWithTTLAsync, memoizeWithLRU } = await import(
  "../memoize"
);

// ─── memoizeWithTTL ────────────────────────────────────────────────────

describe("memoizeWithTTL", () => {
  test("returns cached value on second call", () => {
    let calls = 0;
    const fn = memoizeWithTTL((x: number) => {
      calls++;
      return x * 2;
    }, 60_000);

    expect(fn(5)).toBe(10);
    expect(fn(5)).toBe(10);
    expect(calls).toBe(1);
  });

  test("different args get separate cache entries", () => {
    let calls = 0;
    const fn = memoizeWithTTL((x: number) => {
      calls++;
      return x + 1;
    }, 60_000);

    expect(fn(1)).toBe(2);
    expect(fn(2)).toBe(3);
    expect(calls).toBe(2);
  });

  test("cache.clear empties the cache", () => {
    let calls = 0;
    const fn = memoizeWithTTL(() => {
      calls++;
      return "val";
    }, 60_000);

    fn();
    fn.cache.clear();
    fn();
    expect(calls).toBe(2);
  });

  test("returns stale value and triggers background refresh after TTL", async () => {
    let calls = 0;
    const fn = memoizeWithTTL((x: number) => {
      calls++;
      return x * calls;
    }, 1); // 1ms TTL

    const first = fn(10);
    expect(first).toBe(10); // calls=1, 10*1

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 10));

    // Should return stale value (10) and trigger background refresh
    const second = fn(10);
    expect(second).toBe(10); // stale value returned immediately

    // Wait for background refresh microtask
    await new Promise((r) => setTimeout(r, 10));

    // Now cache should have refreshed value (calls=2 during refresh, 10*2=20)
    const third = fn(10);
    expect(third).toBe(20);
  });
});

// ─── memoizeWithTTLAsync ───────────────────────────────────────────────

describe("memoizeWithTTLAsync", () => {
  test("caches async result", async () => {
    let calls = 0;
    const fn = memoizeWithTTLAsync(async (x: number) => {
      calls++;
      return x * 2;
    }, 60_000);

    expect(await fn(5)).toBe(10);
    expect(await fn(5)).toBe(10);
    expect(calls).toBe(1);
  });

  test("deduplicates concurrent cold-miss calls", async () => {
    let calls = 0;
    const fn = memoizeWithTTLAsync(async (x: number) => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return x;
    }, 60_000);

    const [a, b, c] = await Promise.all([fn(1), fn(1), fn(1)]);
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(c).toBe(1);
    expect(calls).toBe(1);
  });

  test("cache.clear forces re-computation", async () => {
    let calls = 0;
    const fn = memoizeWithTTLAsync(async () => {
      calls++;
      return "v";
    }, 60_000);

    await fn();
    fn.cache.clear();
    await fn();
    expect(calls).toBe(2);
  });

  test("returns stale value on TTL expiry", async () => {
    let calls = 0;
    const fn = memoizeWithTTLAsync(async () => {
      calls++;
      return calls;
    }, 1); // 1ms TTL

    const first = await fn();
    expect(first).toBe(1);

    await new Promise((r) => setTimeout(r, 10));

    // Should return stale value (1) immediately
    const second = await fn();
    expect(second).toBe(1);
  });
});

// ─── memoizeWithLRU ────────────────────────────────────────────────────

describe("memoizeWithLRU", () => {
  test("caches results by key", () => {
    let calls = 0;
    const fn = memoizeWithLRU(
      (x: number) => {
        calls++;
        return x * 2;
      },
      (x) => String(x),
      10
    );

    expect(fn(5)).toBe(10);
    expect(fn(5)).toBe(10);
    expect(calls).toBe(1);
  });

  test("evicts least recently used when max reached", () => {
    let calls = 0;
    const fn = memoizeWithLRU(
      (x: number) => {
        calls++;
        return x;
      },
      (x) => String(x),
      3
    );

    fn(1);
    fn(2);
    fn(3);
    expect(calls).toBe(3);

    fn(4); // evicts key "1"
    expect(fn.cache.has("1")).toBe(false);
    expect(fn.cache.has("4")).toBe(true);
  });

  test("cache.size returns current size", () => {
    const fn = memoizeWithLRU(
      (x: number) => x,
      (x) => String(x),
      10
    );

    fn(1);
    fn(2);
    expect(fn.cache.size()).toBe(2);
  });

  test("cache.delete removes entry", () => {
    const fn = memoizeWithLRU(
      (x: number) => x,
      (x) => String(x),
      10
    );

    fn(1);
    expect(fn.cache.has("1")).toBe(true);
    fn.cache.delete("1");
    expect(fn.cache.has("1")).toBe(false);
  });

  test("cache.get returns value without updating recency", () => {
    const fn = memoizeWithLRU(
      (x: number) => x * 10,
      (x) => String(x),
      10
    );

    fn(5);
    expect(fn.cache.get("5")).toBe(50);
  });

  test("cache.clear empties everything", () => {
    const fn = memoizeWithLRU(
      (x: number) => x,
      (x) => String(x),
      10
    );

    fn(1);
    fn(2);
    fn.cache.clear();
    expect(fn.cache.size()).toBe(0);
  });
});
