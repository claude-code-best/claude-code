import { mock, describe, expect, test } from "bun:test";

mock.module("src/utils/debug.js", () => ({
  logForDebugging: () => {},
  isDebugMode: () => false,
}));

mock.module("src/utils/errors.js", () => ({
  errorMessage: (e: unknown) => String(e),
}));

mock.module("src/utils/stringUtils.js", () => ({
  plural: (n: number, singular: string, plural?: string) =>
    n === 1 ? singular : (plural ?? singular + "s"),
}));

const {
  formatGoToDefinitionResult,
  formatFindReferencesResult,
  formatHoverResult,
  formatDocumentSymbolResult,
  formatWorkspaceSymbolResult,
  formatPrepareCallHierarchyResult,
  formatIncomingCallsResult,
  formatOutgoingCallsResult,
} = await import("../formatters");

// Minimal LSP type stubs for testing
const makeLocation = (uri: string, startLine: number, startChar: number, endLine: number, endChar: number) => ({
  uri,
  range: {
    start: { line: startLine, character: startChar },
    end: { line: endLine, character: endChar },
  },
});

const makeSymbol = (name: string, kind: number, range: { start: { line: number; character: number }; end: { line: number; character: number } }) => ({
  name,
  kind,
  range,
  children: undefined,
});

const makeCallItem = (name: string, uri: string, line: number) => ({
  name,
  kind: 12, // Function
  uri,
  range: {
    start: { line: line, character: 0 },
    end: { line: line, character: 10 },
  },
  selectionRange: {
    start: { line: line, character: 0 },
    end: { line: line, character: name.length },
  },
});

describe("formatGoToDefinitionResult", () => {
  test("returns no definitions message for null", () => {
    const result = formatGoToDefinitionResult(null);
    expect(result).toContain("No definition found");
  });

  test("formats single location", () => {
    const loc = makeLocation("file:///src/foo.ts", 10, 5, 10, 15);
    const result = formatGoToDefinitionResult(loc);
    expect(result).toContain("foo.ts");
    // LSP lines are 0-based, display is 1-based → line 10 = display line 11
    expect(result).toContain("11");
  });

  test("formats array of locations", () => {
    const locs = [
      makeLocation("file:///src/a.ts", 1, 0, 1, 5),
      makeLocation("file:///src/b.ts", 5, 0, 5, 5),
    ];
    const result = formatGoToDefinitionResult(locs);
    expect(result).toContain("a.ts");
    expect(result).toContain("b.ts");
  });
});

describe("formatFindReferencesResult", () => {
  test("returns no references message for null", () => {
    expect(formatFindReferencesResult(null)).toContain("No references found");
  });

  test("formats references", () => {
    const refs = [
      makeLocation("file:///src/a.ts", 1, 0, 1, 5),
      makeLocation("file:///src/b.ts", 3, 0, 3, 5),
    ];
    const result = formatFindReferencesResult(refs);
    expect(result).toContain("a.ts");
    expect(result).toContain("b.ts");
  });
});

describe("formatHoverResult", () => {
  test("returns no hover message for null", () => {
    expect(formatHoverResult(null)).toContain("No hover information");
  });

  test("formats hover with string contents", () => {
    const hover = {
      contents: { kind: "plaintext", value: "string" },
      range: makeLocation("file:///a.ts", 0, 0, 0, 5).range,
    };
    const result = formatHoverResult(hover as any);
    expect(result).toContain("string");
  });
});

describe("formatDocumentSymbolResult", () => {
  test("returns no symbols message for null", () => {
    expect(formatDocumentSymbolResult(null)).toContain("No symbols found");
  });

  test("returns no symbols for empty array", () => {
    expect(formatDocumentSymbolResult([])).toContain("No symbols found");
  });

  test("formats document symbols", () => {
    const symbols = [
      makeSymbol("MyClass", 5, { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } }),
      makeSymbol("myMethod", 6, { start: { line: 2, character: 0 }, end: { line: 5, character: 0 } }),
    ];
    const result = formatDocumentSymbolResult(symbols as any);
    expect(result).toContain("MyClass");
    expect(result).toContain("myMethod");
  });
});

describe("formatWorkspaceSymbolResult", () => {
  test("returns no symbols for null", () => {
    expect(formatWorkspaceSymbolResult(null)).toContain("No symbols found");
  });

  test("formats workspace symbols", () => {
    const symbols = [
      {
        name: "SearchResult",
        kind: 12,
        location: makeLocation("file:///src/a.ts", 0, 0, 0, 5),
      },
    ];
    const result = formatWorkspaceSymbolResult(symbols as any);
    expect(result).toContain("SearchResult");
  });
});

describe("formatPrepareCallHierarchyResult", () => {
  test("returns no items for null", () => {
    expect(formatPrepareCallHierarchyResult(null)).toContain("No call hierarchy");
  });

  test("formats call hierarchy items", () => {
    const items = [makeCallItem("main", "file:///src/main.ts", 5)];
    const result = formatPrepareCallHierarchyResult(items as any);
    expect(result).toContain("main");
    expect(result).toContain("main.ts");
  });
});

describe("formatIncomingCallsResult", () => {
  test("returns no calls for null", () => {
    expect(formatIncomingCallsResult(null)).toContain("No incoming calls");
  });

  test("formats incoming calls", () => {
    const calls = [
      {
        from: makeCallItem("caller", "file:///src/a.ts", 3),
        fromRanges: [makeLocation("file:///src/a.ts", 3, 0, 3, 5).range],
      },
    ];
    const result = formatIncomingCallsResult(calls as any);
    expect(result).toContain("caller");
  });
});

describe("formatOutgoingCallsResult", () => {
  test("returns no calls for null", () => {
    expect(formatOutgoingCallsResult(null)).toContain("No outgoing calls");
  });

  test("formats outgoing calls", () => {
    const calls = [
      {
        to: makeCallItem("callee", "file:///src/b.ts", 10),
        fromRanges: [makeLocation("file:///src/main.ts", 5, 0, 5, 5).range],
      },
    ];
    const result = formatOutgoingCallsResult(calls as any);
    expect(result).toContain("callee");
  });
});
