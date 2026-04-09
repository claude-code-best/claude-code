import { describe, test, expect, beforeEach, afterAll, mock, spyOn } from "bun:test";

// Mock config before importing modules that depend on it
const mockConfig = {
  port: 3000,
  host: "0.0.0.0",
  apiKeys: ["test-key-1", "test-key-2"],
  baseUrl: "",
  pollTimeout: 8,
  heartbeatInterval: 20,
  jwtExpiresIn: 3600,
  disconnectTimeout: 300,
};

mock.module("../config", () => ({
  config: mockConfig,
  getBaseUrl: () => "http://localhost:3000",
}));

import { validateApiKey, hashApiKey } from "../auth/api-key";
import { generateWorkerJwt, verifyWorkerJwt } from "../auth/jwt";
import { issueToken, resolveToken } from "../auth/token";
import { storeReset, storeCreateUser } from "../store";

// ---------- api-key ----------

describe("validateApiKey", () => {
  test("validates a configured API key", () => {
    expect(validateApiKey("test-key-1")).toBe(true);
    expect(validateApiKey("test-key-2")).toBe(true);
  });

  test("rejects unknown key", () => {
    expect(validateApiKey("unknown-key")).toBe(false);
  });

  test("rejects undefined", () => {
    expect(validateApiKey(undefined)).toBe(false);
  });

  test("rejects empty string", () => {
    expect(validateApiKey("")).toBe(false);
  });
});

describe("hashApiKey", () => {
  test("produces consistent SHA-256 hex", () => {
    const hash = hashApiKey("my-key");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey("my-key")).toBe(hash);
  });

  test("different keys produce different hashes", () => {
    expect(hashApiKey("key-a")).not.toBe(hashApiKey("key-b"));
  });
});

// ---------- jwt ----------

describe("JWT", () => {
  // JWT reads process.env.RCS_API_KEYS directly (not via config)
  const originalKeys = process.env.RCS_API_KEYS;

  beforeEach(() => {
    process.env.RCS_API_KEYS = "jwt-test-secret";
  });

  afterAll(() => {
    process.env.RCS_API_KEYS = originalKeys;
  });

  describe("generateWorkerJwt", () => {
    test("produces a three-part base64url token", () => {
      const token = generateWorkerJwt("ses_123", 3600);
      const parts = token.split(".");
      expect(parts).toHaveLength(3);
      for (const part of parts) {
        expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    });

    test("contains correct header", () => {
      const token = generateWorkerJwt("ses_123", 3600);
      const header = JSON.parse(atob(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
      expect(header.alg).toBe("HS256");
      expect(header.typ).toBe("JWT");
    });

    test("throws when no API key configured", () => {
      delete process.env.RCS_API_KEYS;
      expect(() => generateWorkerJwt("ses_123", 3600)).toThrow("No API key configured");
      process.env.RCS_API_KEYS = "jwt-test-secret";
    });
  });

  describe("verifyWorkerJwt", () => {
    test("verifies a valid token", () => {
      const token = generateWorkerJwt("ses_abc", 3600);
      const payload = verifyWorkerJwt(token);
      expect(payload).not.toBeNull();
      expect(payload!.session_id).toBe("ses_abc");
      expect(payload!.role).toBe("worker");
      expect(payload!.iat).toBeGreaterThan(0);
      expect(payload!.exp).toBeGreaterThan(payload!.iat);
    });

    test("returns null for expired token", () => {
      const token = generateWorkerJwt("ses_old", -10);
      expect(verifyWorkerJwt(token)).toBeNull();
    });

    test("returns null for malformed token (not 3 parts)", () => {
      expect(verifyWorkerJwt("a.b")).toBeNull();
      expect(verifyWorkerJwt("just-a-string")).toBeNull();
    });

    test("returns null for tampered signature", () => {
      const token = generateWorkerJwt("ses_123", 3600);
      const parts = token.split(".");
      const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -4)}xxxx`;
      expect(verifyWorkerJwt(tampered)).toBeNull();
    });

    test("returns null for wrong signing key", () => {
      const token = generateWorkerJwt("ses_123", 3600);
      process.env.RCS_API_KEYS = "wrong-key";
      expect(verifyWorkerJwt(token)).toBeNull();
      process.env.RCS_API_KEYS = "jwt-test-secret";
    });
  });
});

// ---------- token ----------

describe("issueToken / resolveToken", () => {
  beforeEach(() => {
    storeReset();
  });

  test("issues and resolves a token", () => {
    storeCreateUser("alice");
    const { token, expires_in } = issueToken("alice");
    expect(token).toMatch(/^rct_\d+_[0-9a-f]+$/);
    expect(expires_in).toBe(86400);
    expect(resolveToken(token)).toBe("alice");
  });

  test("returns null for unknown token", () => {
    expect(resolveToken("nonexistent")).toBeNull();
  });

  test("returns null for undefined token", () => {
    expect(resolveToken(undefined)).toBeNull();
  });

  test("tokens are unique", () => {
    storeCreateUser("alice");
    const t1 = issueToken("alice").token;
    const t2 = issueToken("alice").token;
    expect(t1).not.toBe(t2);
  });
});
