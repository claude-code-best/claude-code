import { describe, expect, test } from "bun:test";
import {
  createAbortController,
  createChildAbortController,
} from "../abortController";

describe("createAbortController", () => {
  test("returns an AbortController that is not aborted", () => {
    const controller = createAbortController();
    expect(controller.signal.aborted).toBe(false);
  });

  test("aborting the controller sets signal.aborted", () => {
    const controller = createAbortController();
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  test("abort reason is propagated", () => {
    const controller = createAbortController();
    controller.abort("custom reason");
    expect(controller.signal.reason).toBe("custom reason");
  });

  test("accepts custom maxListeners without error", () => {
    const controller = createAbortController(100);
    expect(controller.signal.aborted).toBe(false);
  });
});

describe("createChildAbortController", () => {
  test("child is not aborted initially", () => {
    const parent = createAbortController();
    const child = createChildAbortController(parent);
    expect(child.signal.aborted).toBe(false);
    expect(parent.signal.aborted).toBe(false);
  });

  test("parent abort propagates to child", () => {
    const parent = createAbortController();
    const child = createChildAbortController(parent);
    parent.abort("parent reason");
    expect(child.signal.aborted).toBe(true);
    expect(child.signal.reason).toBe("parent reason");
  });

  test("child abort does NOT propagate to parent", () => {
    const parent = createAbortController();
    const child = createChildAbortController(parent);
    child.abort("child reason");
    expect(child.signal.aborted).toBe(true);
    expect(parent.signal.aborted).toBe(false);
  });

  test("already-aborted parent immediately aborts child", () => {
    const parent = createAbortController();
    parent.abort("pre-abort");
    const child = createChildAbortController(parent);
    expect(child.signal.aborted).toBe(true);
    expect(child.signal.reason).toBe("pre-abort");
  });

  test("multiple children are independent", () => {
    const parent = createAbortController();
    const child1 = createChildAbortController(parent);
    const child2 = createChildAbortController(parent);
    child1.abort("child1");
    expect(child1.signal.aborted).toBe(true);
    expect(child2.signal.aborted).toBe(false);
    // Aborting child1 did not affect child2 or parent
    expect(parent.signal.aborted).toBe(false);
  });

  test("parent abort propagates to all children", () => {
    const parent = createAbortController();
    const child1 = createChildAbortController(parent);
    const child2 = createChildAbortController(parent);
    parent.abort("all go down");
    expect(child1.signal.aborted).toBe(true);
    expect(child2.signal.aborted).toBe(true);
  });

  test("grandchild abort propagation", () => {
    const grandparent = createAbortController();
    const parent = createChildAbortController(grandparent);
    const child = createChildAbortController(parent);
    grandparent.abort("chain");
    expect(parent.signal.aborted).toBe(true);
    expect(child.signal.aborted).toBe(true);
  });

  test("child abort then parent abort — child stays aborted with original reason", () => {
    const parent = createAbortController();
    const child = createChildAbortController(parent);
    child.abort("child first");
    parent.abort("parent later");
    expect(child.signal.reason).toBe("child first");
    expect(parent.signal.reason).toBe("parent later");
  });

  test("accepts custom maxListeners for child", () => {
    const parent = createAbortController();
    const child = createChildAbortController(parent, 200);
    expect(child.signal.aborted).toBe(false);
  });
});
