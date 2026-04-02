import { describe, expect, test } from "bun:test";
import { validateUuid, createAgentId } from "../uuid";

describe("validateUuid", () => {
  test("validates correct UUID", () => {
    const result = validateUuid("550e8400-e29b-41d4-a716-446655440000");
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  test("validates uppercase UUID", () => {
    const result = validateUuid("550E8400-E29B-41D4-A716-446655440000");
    expect(result).toBe("550E8400-E29B-41D4-A716-446655440000");
  });

  test("returns null for non-string", () => {
    expect(validateUuid(123)).toBeNull();
    expect(validateUuid(null)).toBeNull();
    expect(validateUuid(undefined)).toBeNull();
  });

  test("returns null for invalid UUID format", () => {
    expect(validateUuid("not-a-uuid")).toBeNull();
    expect(validateUuid("550e8400-e29b-41d4-a716")).toBeNull();
    expect(validateUuid("550e8400e29b41d4a716446655440000")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(validateUuid("")).toBeNull();
  });

  test("returns null for UUID with invalid chars", () => {
    expect(validateUuid("550e8400-e29b-41d4-a716-44665544000g")).toBeNull();
  });

  test("returns null for UUID with leading/trailing whitespace", () => {
    expect(validateUuid(" 550e8400-e29b-41d4-a716-446655440000")).toBeNull();
    expect(validateUuid("550e8400-e29b-41d4-a716-446655440000 ")).toBeNull();
  });
});

describe("createAgentId", () => {
  test("generates id without label in correct format", () => {
    const id = createAgentId();
    expect(id).toMatch(/^a[0-9a-f]{16}$/);
  });

  test("generates id with label in correct format", () => {
    const id = createAgentId("compact");
    expect(id).toMatch(/^acompact-[0-9a-f]{16}$/);
  });
});
