import { mock, describe, expect, test } from "bun:test";

// Mock dependencies before import
const mockCwd = "/Users/test/project";

mock.module("src/utils/cwd.js", () => ({
  getCwd: () => mockCwd,
}));

mock.module("src/utils/powershell/parser.js", () => ({
  PS_TOKENIZER_DASH_CHARS: new Set(["-", "\u2013", "\u2014", "\u2015"]),
}));

const { isGitInternalPathPS, isDotGitPathPS } = await import("../gitSafety");

describe("isGitInternalPathPS", () => {
  test("detects .git/config", () => {
    expect(isGitInternalPathPS(".git/config")).toBe(true);
  });

  test("detects .git/hooks/pre-commit", () => {
    expect(isGitInternalPathPS(".git/hooks/pre-commit")).toBe(true);
  });

  test("detects HEAD", () => {
    expect(isGitInternalPathPS("HEAD")).toBe(true);
  });

  test("detects refs/heads/main", () => {
    expect(isGitInternalPathPS("refs/heads/main")).toBe(true);
  });

  test("detects objects/pack/abc.pack", () => {
    expect(isGitInternalPathPS("objects/pack/abc.pack")).toBe(true);
  });

  test("detects hooks/pre-commit", () => {
    expect(isGitInternalPathPS("hooks/pre-commit")).toBe(true);
  });

  test("detects .git", () => {
    expect(isGitInternalPathPS(".git")).toBe(true);
  });

  test("detects .git/HEAD", () => {
    expect(isGitInternalPathPS(".git/HEAD")).toBe(true);
  });

  test("normal file is not git-internal", () => {
    expect(isGitInternalPathPS("src/main.ts")).toBe(false);
  });

  test("README.md is not git-internal", () => {
    expect(isGitInternalPathPS("README.md")).toBe(false);
  });

  test("package.json is not git-internal", () => {
    expect(isGitInternalPathPS("package.json")).toBe(false);
  });

  test("handles backslash paths (Windows)", () => {
    expect(isGitInternalPathPS(".git\\config")).toBe(true);
  });

  test("handles .git with NTFS short name (git~1)", () => {
    expect(isGitInternalPathPS("git~1/config")).toBe(true);
  });

  test("handles .git with NTFS short name variant (git~2)", () => {
    expect(isGitInternalPathPS("git~2/HEAD")).toBe(true);
  });

  test("handles leading ./ prefix", () => {
    expect(isGitInternalPathPS("./.git/config")).toBe(true);
  });

  test("handles quoted paths", () => {
    expect(isGitInternalPathPS('".git/config"')).toBe(true);
  });

  test("handles backtick-escaped paths", () => {
    expect(isGitInternalPathPS("`.gi`t/config")).toBe(true);
  });
});

describe("isDotGitPathPS", () => {
  test("detects .git/config", () => {
    expect(isDotGitPathPS(".git/config")).toBe(true);
  });

  test("detects .git", () => {
    expect(isDotGitPathPS(".git")).toBe(true);
  });

  test("detects .git/hooks/pre-commit", () => {
    expect(isDotGitPathPS(".git/hooks/pre-commit")).toBe(true);
  });

  test(".gitignore is NOT a .git path", () => {
    expect(isDotGitPathPS(".gitignore")).toBe(false);
  });

  test(".gitmodules is NOT a .git path", () => {
    expect(isDotGitPathPS(".gitmodules")).toBe(false);
  });

  test("HEAD alone is NOT a .git path (could be non-git file)", () => {
    expect(isDotGitPathPS("HEAD")).toBe(false);
  });

  test("refs/heads is NOT a .git path (bare-repo style)", () => {
    expect(isDotGitPathPS("refs/heads/main")).toBe(false);
  });

  test("hooks/pre-commit is NOT a .git path (bare-repo style)", () => {
    expect(isDotGitPathPS("hooks/pre-commit")).toBe(false);
  });

  test("handles NTFS short name git~1", () => {
    expect(isDotGitPathPS("git~1/config")).toBe(true);
  });

  test("normal file is not .git path", () => {
    expect(isDotGitPathPS("src/main.ts")).toBe(false);
  });

  test("handles backslash paths", () => {
    expect(isDotGitPathPS(".git\\HEAD")).toBe(true);
  });

  test("handles quoted paths", () => {
    expect(isDotGitPathPS('".git/HEAD"')).toBe(true);
  });
});
