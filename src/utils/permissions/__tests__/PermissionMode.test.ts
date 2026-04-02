import { mock, describe, expect, test, beforeEach, afterEach } from "bun:test";

// Mock slowOperations to cut bootstrap/state dependency chain
// (figures.js → env.js → fsOperations.js → slowOperations.js → bootstrap/state.js)
mock.module("src/utils/slowOperations.ts", () => ({
  jsonStringify: JSON.stringify,
  jsonParse: JSON.parse,
  slowLogging: { enabled: false },
  clone: (v: any) => structuredClone(v),
  cloneDeep: (v: any) => structuredClone(v),
  callerFrame: () => "",
  SLOW_OPERATION_THRESHOLD_MS: 100,
  writeFileSync_DEPRECATED: () => {},
}));
mock.module("src/utils/log.ts", () => ({
  logError: () => {},
  logToFile: () => {},
  getLogDisplayTitle: () => "",
  logEvent: () => {},
}));

const {
  isExternalPermissionMode,
  toExternalPermissionMode,
  permissionModeFromString,
  permissionModeTitle,
  isDefaultMode,
  permissionModeShortTitle,
  permissionModeSymbol,
  getModeColor,
  PERMISSION_MODES,
  EXTERNAL_PERMISSION_MODES,
} = await import("../PermissionMode");

// ─── PERMISSION_MODES / EXTERNAL_PERMISSION_MODES ──────────────────────

describe("PERMISSION_MODES", () => {
  test("includes all external modes", () => {
    for (const m of EXTERNAL_PERMISSION_MODES) {
      expect(PERMISSION_MODES).toContain(m);
    }
  });

  test("includes default, plan, acceptEdits, bypassPermissions, dontAsk", () => {
    expect(PERMISSION_MODES).toContain("default");
    expect(PERMISSION_MODES).toContain("plan");
    expect(PERMISSION_MODES).toContain("acceptEdits");
    expect(PERMISSION_MODES).toContain("bypassPermissions");
    expect(PERMISSION_MODES).toContain("dontAsk");
  });
});

// ─── permissionModeFromString ──────────────────────────────────────────

describe("permissionModeFromString", () => {
  test("returns valid mode for known string", () => {
    expect(permissionModeFromString("plan")).toBe("plan");
    expect(permissionModeFromString("default")).toBe("default");
    expect(permissionModeFromString("dontAsk")).toBe("dontAsk");
    expect(permissionModeFromString("acceptEdits")).toBe("acceptEdits");
    expect(permissionModeFromString("bypassPermissions")).toBe("bypassPermissions");
  });

  test("returns 'default' for unknown string", () => {
    expect(permissionModeFromString("unknown")).toBe("default");
    expect(permissionModeFromString("")).toBe("default");
  });
});

// ─── permissionModeTitle ───────────────────────────────────────────────

describe("permissionModeTitle", () => {
  test("returns title for known modes", () => {
    expect(permissionModeTitle("default")).toBe("Default");
    expect(permissionModeTitle("plan")).toBe("Plan Mode");
    expect(permissionModeTitle("acceptEdits")).toBe("Accept edits");
    expect(permissionModeTitle("bypassPermissions")).toBe("Bypass Permissions");
    expect(permissionModeTitle("dontAsk")).toBe("Don't Ask");
  });

  test("falls back to Default for unknown mode", () => {
    expect(permissionModeTitle("nonexistent" as any)).toBe("Default");
  });
});

// ─── permissionModeShortTitle ──────────────────────────────────────────

describe("permissionModeShortTitle", () => {
  test("returns short title for known modes", () => {
    expect(permissionModeShortTitle("default")).toBe("Default");
    expect(permissionModeShortTitle("plan")).toBe("Plan");
    expect(permissionModeShortTitle("bypassPermissions")).toBe("Bypass");
    expect(permissionModeShortTitle("dontAsk")).toBe("DontAsk");
    expect(permissionModeShortTitle("acceptEdits")).toBe("Accept");
  });
});

// ─── permissionModeSymbol ──────────────────────────────────────────────

describe("permissionModeSymbol", () => {
  test("returns empty string for default", () => {
    expect(permissionModeSymbol("default")).toBe("");
  });

  test("returns non-empty for non-default modes", () => {
    expect(permissionModeSymbol("plan").length).toBeGreaterThan(0);
    expect(permissionModeSymbol("acceptEdits").length).toBeGreaterThan(0);
  });
});

// ─── getModeColor ──────────────────────────────────────────────────────

describe("getModeColor", () => {
  test("returns 'text' for default", () => {
    expect(getModeColor("default")).toBe("text");
  });

  test("returns 'planMode' for plan", () => {
    expect(getModeColor("plan")).toBe("planMode");
  });

  test("returns 'error' for bypassPermissions", () => {
    expect(getModeColor("bypassPermissions")).toBe("error");
  });

  test("returns 'error' for dontAsk", () => {
    expect(getModeColor("dontAsk")).toBe("error");
  });

  test("returns 'autoAccept' for acceptEdits", () => {
    expect(getModeColor("acceptEdits")).toBe("autoAccept");
  });
});

// ─── isDefaultMode ─────────────────────────────────────────────────────

describe("isDefaultMode", () => {
  test("returns true for 'default'", () => {
    expect(isDefaultMode("default")).toBe(true);
  });

  test("returns true for undefined", () => {
    expect(isDefaultMode(undefined)).toBe(true);
  });

  test("returns false for other modes", () => {
    expect(isDefaultMode("plan")).toBe(false);
    expect(isDefaultMode("dontAsk")).toBe(false);
  });
});

// ─── toExternalPermissionMode ──────────────────────────────────────────

describe("toExternalPermissionMode", () => {
  test("maps default to default", () => {
    expect(toExternalPermissionMode("default")).toBe("default");
  });

  test("maps plan to plan", () => {
    expect(toExternalPermissionMode("plan")).toBe("plan");
  });

  test("maps dontAsk to dontAsk", () => {
    expect(toExternalPermissionMode("dontAsk")).toBe("dontAsk");
  });

  test("maps acceptEdits to acceptEdits", () => {
    expect(toExternalPermissionMode("acceptEdits")).toBe("acceptEdits");
  });

  test("maps bypassPermissions to bypassPermissions", () => {
    expect(toExternalPermissionMode("bypassPermissions")).toBe("bypassPermissions");
  });
});

// ─── isExternalPermissionMode ──────────────────────────────────────────

describe("isExternalPermissionMode", () => {
  test("returns true for external modes (non-ant)", () => {
    // USER_TYPE is not 'ant' in tests, so always true
    expect(isExternalPermissionMode("default")).toBe(true);
    expect(isExternalPermissionMode("plan")).toBe(true);
  });

  describe("when USER_TYPE is 'ant'", () => {
    const savedUserType = process.env.USER_TYPE;

    beforeEach(() => {
      process.env.USER_TYPE = "ant";
    });

    afterEach(() => {
      if (savedUserType !== undefined) {
        process.env.USER_TYPE = savedUserType;
      } else {
        delete process.env.USER_TYPE;
      }
    });

    test("returns false for 'auto' (ant-only mode)", () => {
      expect(isExternalPermissionMode("auto")).toBe(false);
    });

    test("returns false for 'bubble' (ant-only mode)", () => {
      expect(isExternalPermissionMode("bubble")).toBe(false);
    });

    test("returns true for standard external modes", () => {
      expect(isExternalPermissionMode("default")).toBe(true);
      expect(isExternalPermissionMode("plan")).toBe(true);
      expect(isExternalPermissionMode("dontAsk")).toBe(true);
    });
  });
});
