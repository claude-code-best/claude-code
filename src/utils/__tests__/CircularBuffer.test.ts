import { describe, expect, test } from "bun:test";
import { CircularBuffer } from "../CircularBuffer";

describe("CircularBuffer", () => {
  test("starts empty", () => {
    const buf = new CircularBuffer<number>(5);
    expect(buf.length()).toBe(0);
    expect(buf.toArray()).toEqual([]);
  });

  test("adds items up to capacity", () => {
    const buf = new CircularBuffer<number>(3);
    buf.add(1);
    buf.add(2);
    buf.add(3);
    expect(buf.length()).toBe(3);
    expect(buf.toArray()).toEqual([1, 2, 3]);
  });

  test("evicts oldest when full", () => {
    const buf = new CircularBuffer<number>(3);
    buf.add(1);
    buf.add(2);
    buf.add(3);
    buf.add(4);
    expect(buf.length()).toBe(3);
    expect(buf.toArray()).toEqual([2, 3, 4]);
  });

  test("evicts multiple oldest items", () => {
    const buf = new CircularBuffer<number>(2);
    buf.add(1);
    buf.add(2);
    buf.add(3);
    buf.add(4);
    buf.add(5);
    expect(buf.toArray()).toEqual([4, 5]);
  });

  test("addAll adds multiple items", () => {
    const buf = new CircularBuffer<number>(5);
    buf.addAll([1, 2, 3]);
    expect(buf.toArray()).toEqual([1, 2, 3]);
  });

  test("addAll with overflow", () => {
    const buf = new CircularBuffer<number>(3);
    buf.addAll([1, 2, 3, 4, 5]);
    expect(buf.toArray()).toEqual([3, 4, 5]);
  });

  test("getRecent returns last N items", () => {
    const buf = new CircularBuffer<number>(5);
    buf.addAll([1, 2, 3, 4, 5]);
    expect(buf.getRecent(3)).toEqual([3, 4, 5]);
  });

  test("getRecent returns fewer when not enough items", () => {
    const buf = new CircularBuffer<number>(5);
    buf.add(1);
    buf.add(2);
    expect(buf.getRecent(5)).toEqual([1, 2]);
  });

  test("getRecent works after wraparound", () => {
    const buf = new CircularBuffer<number>(3);
    buf.addAll([1, 2, 3, 4, 5]);
    expect(buf.getRecent(2)).toEqual([4, 5]);
  });

  test("clear resets buffer", () => {
    const buf = new CircularBuffer<number>(5);
    buf.addAll([1, 2, 3]);
    buf.clear();
    expect(buf.length()).toBe(0);
    expect(buf.toArray()).toEqual([]);
  });

  test("works with string type", () => {
    const buf = new CircularBuffer<string>(2);
    buf.add("a");
    buf.add("b");
    buf.add("c");
    expect(buf.toArray()).toEqual(["b", "c"]);
  });

  test("capacity=1 keeps only the most recent item", () => {
    const buf = new CircularBuffer<number>(1);
    buf.add(10);
    expect(buf.toArray()).toEqual([10]);
    buf.add(20);
    expect(buf.toArray()).toEqual([20]);
    buf.add(30);
    expect(buf.toArray()).toEqual([30]);
    expect(buf.getRecent(1)).toEqual([30]);
  });

  test("getRecent on empty buffer returns empty array", () => {
    const buf = new CircularBuffer<number>(5);
    expect(buf.getRecent(3)).toEqual([]);
  });
});
