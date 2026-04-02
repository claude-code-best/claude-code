import { describe, expect, test } from "bun:test";
import { interpretCommandResult } from "../commandSemantics";

describe("interpretCommandResult", () => {
  describe("grep / rg", () => {
    test("grep exit 0 is not error", () => {
      const result = interpretCommandResult("grep pattern file", 0, "match", "");
      expect(result.isError).toBe(false);
    });

    test("grep exit 1 (no match) is not error", () => {
      const result = interpretCommandResult("grep pattern file", 1, "", "");
      expect(result.isError).toBe(false);
      expect(result.message).toBe("No matches found");
    });

    test("grep exit 2 is error", () => {
      const result = interpretCommandResult("grep pattern file", 2, "", "error");
      expect(result.isError).toBe(true);
    });

    test("rg exit 0 is not error", () => {
      const result = interpretCommandResult("rg pattern", 0, "match", "");
      expect(result.isError).toBe(false);
    });

    test("rg exit 1 (no match) is not error", () => {
      const result = interpretCommandResult("rg pattern", 1, "", "");
      expect(result.isError).toBe(false);
    });

    test("rg exit 2 is error", () => {
      const result = interpretCommandResult("rg pattern", 2, "", "error");
      expect(result.isError).toBe(true);
    });

    test("grep.exe is recognized", () => {
      const result = interpretCommandResult("grep.exe pattern file", 1, "", "");
      expect(result.isError).toBe(false);
    });
  });

  describe("findstr", () => {
    test("findstr exit 0 is not error", () => {
      const result = interpretCommandResult("findstr pattern file", 0, "match", "");
      expect(result.isError).toBe(false);
    });

    test("findstr exit 1 (no match) is not error", () => {
      const result = interpretCommandResult("findstr pattern file", 1, "", "");
      expect(result.isError).toBe(false);
    });

    test("findstr exit 2 is error", () => {
      const result = interpretCommandResult("findstr pattern file", 2, "", "error");
      expect(result.isError).toBe(true);
    });
  });

  describe("robocopy", () => {
    test("robocopy exit 0 (no files copied) is not error", () => {
      const result = interpretCommandResult("robocopy src dest", 0, "", "");
      expect(result.isError).toBe(false);
      expect(result.message).toBe("No files copied (already in sync)");
    });

    test("robocopy exit 1 (files copied) is not error", () => {
      const result = interpretCommandResult("robocopy src dest", 1, "", "");
      expect(result.isError).toBe(false);
      expect(result.message).toBe("Files copied successfully");
    });

    test("robocopy exit 2 (extra files) is not error", () => {
      const result = interpretCommandResult("robocopy src dest", 2, "", "");
      expect(result.isError).toBe(false);
    });

    test("robocopy exit 7 (success with mismatches) is not error", () => {
      const result = interpretCommandResult("robocopy src dest", 7, "", "");
      expect(result.isError).toBe(false);
    });

    test("robocopy exit 8 (copy errors) is error", () => {
      const result = interpretCommandResult("robocopy src dest", 8, "", "error");
      expect(result.isError).toBe(true);
    });

    test("robocopy exit 16 (serious error) is error", () => {
      const result = interpretCommandResult("robocopy src dest", 16, "", "error");
      expect(result.isError).toBe(true);
    });
  });

  describe("default behavior", () => {
    test("unknown command exit 0 is not error", () => {
      const result = interpretCommandResult("somecmd arg", 0, "ok", "");
      expect(result.isError).toBe(false);
    });

    test("unknown command exit 1 is error", () => {
      const result = interpretCommandResult("somecmd arg", 1, "", "fail");
      expect(result.isError).toBe(true);
      expect(result.message).toBe("Command failed with exit code 1");
    });

    test("unknown command exit 127 is error", () => {
      const result = interpretCommandResult("missing-cmd", 127, "", "not found");
      expect(result.isError).toBe(true);
    });
  });

  describe("pipeline — last segment determines result", () => {
    test("pipe with grep as last segment", () => {
      const result = interpretCommandResult("cat file | grep pattern", 1, "", "");
      expect(result.isError).toBe(false);
    });

    test("semicolon — last segment determines result", () => {
      const result = interpretCommandResult("echo hello; somecmd", 1, "", "fail");
      expect(result.isError).toBe(true);
    });
  });

  describe("path-stripped command names", () => {
    test("C:\\tools\\rg.exe is recognized as rg", () => {
      const result = interpretCommandResult("C:\\tools\\rg.exe pattern", 1, "", "");
      expect(result.isError).toBe(false);
    });

    test("./tools/grep is recognized as grep", () => {
      const result = interpretCommandResult("./tools/grep pattern", 1, "", "");
      expect(result.isError).toBe(false);
    });
  });

  describe("call operator stripping", () => {
    test("& grep pattern works", () => {
      const result = interpretCommandResult("& grep pattern", 1, "", "");
      expect(result.isError).toBe(false);
    });

    test('. "grep.exe" pattern works', () => {
      const result = interpretCommandResult('. "grep.exe" pattern', 1, "", "");
      expect(result.isError).toBe(false);
    });
  });
});
