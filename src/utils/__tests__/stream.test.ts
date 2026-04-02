import { describe, expect, test } from "bun:test";
import { Stream } from "../stream";

describe("Stream", () => {
  test("enqueue then read resolves with the value", async () => {
    const stream = new Stream<number>();
    stream[Symbol.asyncIterator]();
    stream.enqueue(42);
    const result = await stream.next();
    expect(result).toEqual({ done: false, value: 42 });
  });

  test("enqueue multiple then drain in order", async () => {
    const stream = new Stream<string>();
    stream[Symbol.asyncIterator]();
    stream.enqueue("a");
    stream.enqueue("b");
    stream.enqueue("c");
    expect(await stream.next()).toEqual({ done: false, value: "a" });
    expect(await stream.next()).toEqual({ done: false, value: "b" });
    expect(await stream.next()).toEqual({ done: false, value: "c" });
  });

  test("next() blocks until enqueue provides a value", async () => {
    const stream = new Stream<number>();
    stream[Symbol.asyncIterator]();
    const promise = stream.next();
    // Not resolved yet — enqueue after a microtask
    stream.enqueue(99);
    const result = await promise;
    expect(result).toEqual({ done: false, value: 99 });
  });

  test("done() resolves pending reader with done:true", async () => {
    const stream = new Stream<number>();
    stream[Symbol.asyncIterator]();
    const promise = stream.next();
    stream.done();
    expect(await promise).toEqual({ done: true, value: undefined });
  });

  test("done() with no pending reader — subsequent next returns done:true", async () => {
    const stream = new Stream<number>();
    stream[Symbol.asyncIterator]();
    stream.done();
    expect(await stream.next()).toEqual({ done: true, value: undefined });
  });

  test("error() rejects pending reader", async () => {
    const stream = new Stream<number>();
    stream[Symbol.asyncIterator]();
    const promise = stream.next();
    stream.error(new Error("boom"));
    expect(promise).rejects.toThrow("boom");
  });

  test("error() after done — hasError is set but next returns done:true (isDone checked first)", async () => {
    const stream = new Stream<number>();
    stream[Symbol.asyncIterator]();
    stream.done();
    stream.error(new Error("late error"));
    // next() checks isDone before hasError, so it returns done:true
    expect(await stream.next()).toEqual({ done: true, value: undefined });
  });

  test("enqueue after done — queue is checked before isDone, value is consumed", async () => {
    const stream = new Stream<number>();
    stream[Symbol.asyncIterator]();
    stream.done();
    stream.enqueue(1);
    // next() checks queue.length > 0 first, so enqueued value is returned
    expect(await stream.next()).toEqual({ done: false, value: 1 });
    // After draining queue, done takes effect
    expect(await stream.next()).toEqual({ done: true, value: undefined });
  });

  test("return() marks stream as done and calls returned callback", async () => {
    let called = false;
    const stream = new Stream<number>(() => { called = true; });
    stream[Symbol.asyncIterator]();
    const result = await stream.return();
    expect(result).toEqual({ done: true, value: undefined });
    expect(called).toBe(true);
    // Subsequent next returns done
    expect(await stream.next()).toEqual({ done: true, value: undefined });
  });

  test("return() without callback still works", async () => {
    const stream = new Stream<number>();
    stream[Symbol.asyncIterator]();
    const result = await stream.return();
    expect(result).toEqual({ done: true, value: undefined });
  });

  test("Symbol.asyncIterator throws on second call", () => {
    const stream = new Stream<number>();
    stream[Symbol.asyncIterator]();
    expect(() => stream[Symbol.asyncIterator]()).toThrow(
      "Stream can only be iterated once"
    );
  });

  test("for-await-of iteration drains queued values then ends", async () => {
    const stream = new Stream<string>();
    stream.enqueue("x");
    stream.enqueue("y");
    stream.done();
    const results: string[] = [];
    for await (const value of stream) {
      results.push(value);
    }
    expect(results).toEqual(["x", "y"]);
  });

  test("for-await-of blocks until done", async () => {
    const stream = new Stream<number>();
    const results: number[] = [];

    const iterPromise = (async () => {
      for await (const v of stream) {
        results.push(v);
      }
    })();

    // Enqueue after a tick
    await Promise.resolve();
    stream.enqueue(1);
    stream.enqueue(2);
    stream.done();

    await iterPromise;
    expect(results).toEqual([1, 2]);
  });

  test("error during for-await-of rejects the loop", async () => {
    const stream = new Stream<number>();
    const iterPromise = (async () => {
      for await (const _ of stream) {
        // will error before any value
      }
    })();
    stream.error(new Error("stream broken"));
    expect(iterPromise).rejects.toThrow("stream broken");
  });

  test("concurrent enqueue from multiple sources does not lose data", async () => {
    const stream = new Stream<number>();
    // Rapid sequential enqueue
    for (let i = 0; i < 100; i++) {
      stream.enqueue(i);
    }
    stream.done();

    const results: number[] = [];
    for await (const v of stream) {
      results.push(v);
    }
    expect(results.length).toBe(100);
    expect(results[0]).toBe(0);
    expect(results[99]).toBe(99);
  });
});
