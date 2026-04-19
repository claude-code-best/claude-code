import { describe, test, expect, mock, beforeEach } from "bun:test";

// In-memory localStorage mock
let store: Record<string, string> = {};

beforeEach(() => {
  store = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: () => null,
  };
});

// Mock fetch
const fetchMock = {
  lastUrl: "",
  lastOpts: {} as RequestInit,
  response: { ok: true, status: 200, statusText: "OK" },
  responseData: {} as any,
};

beforeEach(() => {
  fetchMock.lastUrl = "";
  fetchMock.lastOpts = {};
  fetchMock.response = { ok: true, status: 200, statusText: "OK" };
  fetchMock.responseData = {};
});

(globalThis as any).fetch = async (url: string, opts: RequestInit) => {
  fetchMock.lastUrl = url;
  fetchMock.lastOpts = opts;
  return {
    ok: fetchMock.response.ok,
    status: fetchMock.response.status,
    statusText: fetchMock.response.statusText,
    json: async () => fetchMock.responseData,
  } as Response;
};

// Mock crypto.randomUUID
(globalThis as any).crypto = {
  randomUUID: () => "test-uuid-12345678",
};

const { getUuid, setUuid } = await import("../api/client");

// Import api* functions - they depend on getUuid and fetch
const client = await import("../api/client");

// =============================================================================
// getUuid()
// =============================================================================

describe("getUuid", () => {
  test("returns existing UUID from localStorage", () => {
    store["rcs_uuid"] = "existing-uuid";
    expect(getUuid()).toBe("existing-uuid");
  });

  test("generates and stores new UUID when none exists", () => {
    const uuid = getUuid();
    expect(uuid).toBe("test-uuid-12345678");
    expect(store["rcs_uuid"]).toBe("test-uuid-12345678");
  });

  test("returns same UUID on subsequent calls", () => {
    const a = getUuid();
    const b = getUuid();
    expect(a).toBe(b);
  });
});

// =============================================================================
// setUuid()
// =============================================================================

describe("setUuid", () => {
  test("writes UUID to localStorage", () => {
    setUuid("custom-uuid-999");
    expect(store["rcs_uuid"]).toBe("custom-uuid-999");
  });

  test("getUuid returns the set UUID", () => {
    setUuid("my-uuid");
    expect(getUuid()).toBe("my-uuid");
  });
});

// =============================================================================
// api() — tested via apiFetchSession (GET) and apiBind (POST)
// =============================================================================

describe("api functions", () => {
  test("GET request appends uuid to URL", async () => {
    store["rcs_uuid"] = "test-uuid";
    fetchMock.responseData = [];
    await client.apiFetchSessions();
    expect(fetchMock.lastUrl).toContain("uuid=test-uuid");
    expect(fetchMock.lastOpts.method).toBe("GET");
  });

  test("GET request uses ? for URL without existing query params", async () => {
    store["rcs_uuid"] = "test-uuid";
    fetchMock.responseData = [];
    await client.apiFetchSessions();
    expect(fetchMock.lastUrl).toContain("?uuid=");
  });

  test("GET request uses & for URL with existing query params", async () => {
    store["rcs_uuid"] = "test-uuid";
    fetchMock.responseData = [];
    await client.apiFetchAllSessions();
    // apiFetchAllSessions calls GET /web/sessions/all
    expect(fetchMock.lastUrl).toContain("?uuid=");
  });

  test("POST request includes JSON body", async () => {
    store["rcs_uuid"] = "test-uuid";
    fetchMock.responseData = {};
    await client.apiBind("sess-1");
    expect(fetchMock.lastOpts.method).toBe("POST");
    expect(fetchMock.lastOpts.body).toBe(JSON.stringify({ sessionId: "sess-1" }));
    expect(fetchMock.lastOpts.headers).toEqual({ "Content-Type": "application/json" });
  });

  test("throws error on non-ok response", async () => {
    store["rcs_uuid"] = "test-uuid";
    fetchMock.response = { ok: false, status: 401, statusText: "Unauthorized" };
    fetchMock.responseData = { error: { type: "auth", message: "Invalid UUID" } };
    await expect(client.apiFetchSessions()).rejects.toThrow("Invalid UUID");
  });

  test("throws with statusText when error message is missing", async () => {
    store["rcs_uuid"] = "test-uuid";
    fetchMock.response = { ok: false, status: 500, statusText: "Internal Server Error" };
    fetchMock.responseData = {};
    await expect(client.apiFetchSessions()).rejects.toThrow("Internal Server Error");
  });
});
