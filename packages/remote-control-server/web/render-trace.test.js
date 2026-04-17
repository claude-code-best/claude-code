import { describe, expect, test } from "bun:test";

import {
  addAssistantToolTraceHost,
  addToolTraceEntry,
  clearActiveToolTraceHost,
  createToolTraceState,
} from "./render.js";

describe("tool trace grouping state", () => {
  test("keeps tool entries attached to the current assistant turn", () => {
    let state = createToolTraceState();

    const assistant = addAssistantToolTraceHost(state, "Checking the repo");
    state = assistant.state;

    const toolUse = addToolTraceEntry(state, "use");
    state = toolUse.state;

    const toolResult = addToolTraceEntry(state, "result");
    state = toolResult.state;

    expect(assistant.host).toEqual({
      id: "trace-1",
      kind: "assistant",
      assistantContent: "Checking the repo",
      entryKinds: [],
    });
    expect(toolUse.createdHost).toBeNull();
    expect(toolResult.createdHost).toBeNull();
    expect(state.hosts).toEqual([
      {
        id: "trace-1",
        kind: "assistant",
        assistantContent: "Checking the repo",
        entryKinds: ["use", "result"],
      },
    ]);
  });

  test("creates an orphan trace host when tool activity has no assistant turn", () => {
    const result = addToolTraceEntry(createToolTraceState(), "use");

    expect(result.createdHost).toEqual({
      id: "trace-1",
      kind: "orphan",
      assistantContent: "",
      entryKinds: ["use"],
    });
    expect(result.state.hosts).toEqual([
      {
        id: "trace-1",
        kind: "orphan",
        assistantContent: "",
        entryKinds: ["use"],
      },
    ]);
  });

  test("starts a new orphan host after a visible user turn clears the active assistant host", () => {
    let state = createToolTraceState();
    state = addAssistantToolTraceHost(state, "Running tools").state;
    state = addToolTraceEntry(state, "use").state;

    state = clearActiveToolTraceHost(state);

    const nextResult = addToolTraceEntry(state, "result");

    expect(nextResult.createdHost).toEqual({
      id: "trace-2",
      kind: "orphan",
      assistantContent: "",
      entryKinds: ["result"],
    });
    expect(nextResult.state.hosts).toEqual([
      {
        id: "trace-1",
        kind: "assistant",
        assistantContent: "Running tools",
        entryKinds: ["use"],
      },
      {
        id: "trace-2",
        kind: "orphan",
        assistantContent: "",
        entryKinds: ["result"],
      },
    ]);
  });
});
