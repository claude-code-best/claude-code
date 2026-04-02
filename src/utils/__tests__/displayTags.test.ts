import { describe, expect, test } from "bun:test";
import {
  stripDisplayTags,
  stripDisplayTagsAllowEmpty,
  stripIdeContextTags,
} from "../displayTags";

describe("stripDisplayTags", () => {
  test("strips a single system tag and returns remaining text", () => {
    expect(
      stripDisplayTags("<system-reminder>secret stuff</system-reminder>text")
    ).toBe("text");
  });

  test("strips multiple tags and preserves text between them", () => {
    const input =
      "<hook-output>data</hook-output>hello <task-info>info</task-info>world";
    expect(stripDisplayTags(input)).toBe("hello world");
  });

  test("preserves uppercase JSX component names", () => {
    expect(stripDisplayTags("fix the <Button> layout")).toBe(
      "fix the <Button> layout"
    );
  });

  test("preserves angle brackets in prose (when x < y)", () => {
    expect(stripDisplayTags("when x < y")).toBe("when x < y");
  });

  test("preserves DOCTYPE declarations", () => {
    expect(stripDisplayTags("<!DOCTYPE html>")).toBe("<!DOCTYPE html>");
  });

  test("returns original text when stripping would result in empty", () => {
    const input = "<system-reminder>all tags</system-reminder>";
    expect(stripDisplayTags(input)).toBe(input);
  });

  test("strips tags with attributes", () => {
    expect(
      stripDisplayTags('<context type="ide">data</context>hello')
    ).toBe("hello");
  });

  test("handles multi-line tag content", () => {
    const input = "<info>\nline1\nline2\n</info>remaining";
    expect(stripDisplayTags(input)).toBe("remaining");
  });

  test("returns trimmed result", () => {
    expect(
      stripDisplayTags("  <tag>content</tag>  hello  ")
    ).toBe("hello");
  });

  test("handles empty string input", () => {
    // Empty string is falsy, so stripDisplayTags returns original
    expect(stripDisplayTags("")).toBe("");
  });

  test("handles whitespace-only input", () => {
    // After trim, result is empty string which is falsy, returns original
    expect(stripDisplayTags("   ")).toBe("   ");
  });
});

describe("stripDisplayTagsAllowEmpty", () => {
  test("returns empty string when all content is tags", () => {
    expect(
      stripDisplayTagsAllowEmpty("<system-reminder>stuff</system-reminder>")
    ).toBe("");
  });

  test("strips tags and returns remaining text", () => {
    expect(
      stripDisplayTagsAllowEmpty("<tag>content</tag>hello")
    ).toBe("hello");
  });

  test("returns empty string for empty input", () => {
    expect(stripDisplayTagsAllowEmpty("")).toBe("");
  });

  test("returns empty string for whitespace-only content after strip", () => {
    expect(
      stripDisplayTagsAllowEmpty("<tag>content</tag>  ")
    ).toBe("");
  });
});

describe("stripIdeContextTags", () => {
  test("strips ide_opened_file tags", () => {
    expect(
      stripIdeContextTags(
        "<ide_opened_file>path/to/file.ts</ide_opened_file>hello"
      )
    ).toBe("hello");
  });

  test("strips ide_selection tags", () => {
    expect(
      stripIdeContextTags("<ide_selection>selected code</ide_selection>world")
    ).toBe("world");
  });

  test("strips ide tags with attributes", () => {
    expect(
      stripIdeContextTags(
        '<ide_opened_file path="foo.ts">content</ide_opened_file>text'
      )
    ).toBe("text");
  });

  test("preserves other lowercase tags", () => {
    expect(
      stripIdeContextTags("<system-reminder>data</system-reminder>hello")
    ).toBe("<system-reminder>data</system-reminder>hello");
  });

  test("preserves user-typed HTML like <code>", () => {
    expect(stripIdeContextTags("use <code>foo</code> here")).toBe(
      "use <code>foo</code> here"
    );
  });

  test("strips only IDE tags while preserving other tags and text", () => {
    const input =
      "<ide_opened_file>f.ts</ide_opened_file><system-reminder>x</system-reminder>text";
    expect(stripIdeContextTags(input)).toBe(
      "<system-reminder>x</system-reminder>text"
    );
  });
});
