import { describe, expect, test } from "bun:test";
import { parseConfigString } from "../gitConfigParser";

describe("parseConfigString", () => {
  test("parses simple remote url", () => {
    const config = '[remote "origin"]\n\turl = https://github.com/user/repo.git';
    expect(parseConfigString(config, "remote", "origin", "url")).toBe(
      "https://github.com/user/repo.git"
    );
  });

  test("section matching is case-insensitive", () => {
    const config = '[REMOTE "origin"]\n\turl = https://example.com';
    expect(parseConfigString(config, "remote", "origin", "url")).toBe(
      "https://example.com"
    );
  });

  test("subsection matching is case-sensitive", () => {
    const config = '[remote "Origin"]\n\turl = https://example.com';
    expect(parseConfigString(config, "remote", "origin", "url")).toBeNull();
  });

  test("subsection matching is case-sensitive (positive)", () => {
    const config = '[remote "Origin"]\n\turl = https://example.com';
    expect(parseConfigString(config, "remote", "Origin", "url")).toBe(
      "https://example.com"
    );
  });

  test("key matching is case-insensitive", () => {
    const config = '[remote "origin"]\n\tURL = https://example.com';
    expect(parseConfigString(config, "remote", "origin", "url")).toBe(
      "https://example.com"
    );
  });

  test("parses quoted value with spaces", () => {
    const config = '[user]\n\tname = "John Doe"';
    expect(parseConfigString(config, "user", null, "name")).toBe("John Doe");
  });

  test("handles escape sequence \\n inside quotes", () => {
    const config = '[user]\n\tname = "line1\\nline2"';
    expect(parseConfigString(config, "user", null, "name")).toBe(
      "line1\nline2"
    );
  });

  test("handles escape sequence \\t inside quotes", () => {
    const config = '[user]\n\tname = "col1\\tcol2"';
    expect(parseConfigString(config, "user", null, "name")).toBe(
      "col1\tcol2"
    );
  });

  test("handles escape sequence \\\\ inside quotes", () => {
    const config = '[user]\n\tname = "back\\\\slash"';
    expect(parseConfigString(config, "user", null, "name")).toBe("back\\slash");
  });

  test("handles escape sequence \\\" inside quotes", () => {
    const config = '[user]\n\tname = "say \\"hello\\""';
    expect(parseConfigString(config, "user", null, "name")).toBe('say "hello"');
  });

  test("strips inline comment with #", () => {
    const config = '[remote "origin"]\n\turl = https://example.com # comment';
    expect(parseConfigString(config, "remote", "origin", "url")).toBe(
      "https://example.com"
    );
  });

  test("strips inline comment with ;", () => {
    const config = '[remote "origin"]\n\turl = https://example.com ; comment';
    expect(parseConfigString(config, "remote", "origin", "url")).toBe(
      "https://example.com"
    );
  });

  test("finds value in correct section among multiple sections", () => {
    const config = [
      '[remote "origin"]',
      "\turl = https://origin.example.com",
      '[remote "upstream"]',
      "\turl = https://upstream.example.com",
    ].join("\n");
    expect(parseConfigString(config, "remote", "upstream", "url")).toBe(
      "https://upstream.example.com"
    );
  });

  test("returns null for missing key", () => {
    const config = '[remote "origin"]\n\turl = https://example.com';
    expect(
      parseConfigString(config, "remote", "origin", "pushurl")
    ).toBeNull();
  });

  test("returns null for missing section", () => {
    const config = '[remote "origin"]\n\turl = https://example.com';
    expect(parseConfigString(config, "branch", "main", "merge")).toBeNull();
  });

  test("returns null for boolean key (no = sign)", () => {
    const config = "[core]\n\tbare";
    expect(parseConfigString(config, "core", null, "bare")).toBeNull();
  });

  test("returns null for empty config string", () => {
    expect(parseConfigString("", "remote", "origin", "url")).toBeNull();
  });

  test("handles section without subsection", () => {
    const config = "[core]\n\trepositoryformatversion = 0";
    expect(
      parseConfigString(config, "core", null, "repositoryformatversion")
    ).toBe("0");
  });

  test("does not match section without subsection when subsection is requested", () => {
    const config = "[core]\n\tbare = false";
    // Looking for [core "something"] but config has [core]
    expect(parseConfigString(config, "core", "something", "bare")).toBeNull();
  });

  test("skips comment-only lines", () => {
    const config = [
      "# This is a comment",
      "; This is also a comment",
      '[remote "origin"]',
      "\turl = https://example.com",
    ].join("\n");
    expect(parseConfigString(config, "remote", "origin", "url")).toBe(
      "https://example.com"
    );
  });
});
