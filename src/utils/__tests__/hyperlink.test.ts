import { describe, expect, test } from "bun:test";
import { createHyperlink, OSC8_START, OSC8_END } from "../hyperlink";

// ─── OSC8 constants ────────────────────────────────────────────────────

describe("OSC8 constants", () => {
  test("OSC8_START is the correct escape sequence", () => {
    expect(OSC8_START).toBe("\x1b]8;;");
  });

  test("OSC8_END is the BEL character", () => {
    expect(OSC8_END).toBe("\x07");
  });
});

// ─── createHyperlink ───────────────────────────────────────────────────

describe("createHyperlink", () => {
  test("supported + no content: wraps URL in OSC 8 with URL as display text", () => {
    const url = "https://example.com";
    const result = createHyperlink(url, undefined, { supportsHyperlinks: true });

    expect(result).toContain(OSC8_START);
    expect(result).toContain(OSC8_END);
    // Structure: OSC8_START + url + OSC8_END + coloredText + OSC8_START + OSC8_END
    expect(result).toStartWith(`${OSC8_START}${url}${OSC8_END}`);
    expect(result).toEndWith(`${OSC8_START}${OSC8_END}`);
  });

  test("supported + content: shows content as link text", () => {
    const url = "https://example.com";
    const content = "click here";
    const result = createHyperlink(url, content, { supportsHyperlinks: true });

    expect(result).toStartWith(`${OSC8_START}${url}${OSC8_END}`);
    expect(result).toContain("click here");
    expect(result).toEndWith(`${OSC8_START}${OSC8_END}`);
  });

  test("not supported: returns plain URL regardless of content", () => {
    const url = "https://example.com";
    const result = createHyperlink(url, "some content", {
      supportsHyperlinks: false,
    });

    expect(result).toBe(url);
  });

  test("not supported + no content: returns plain URL", () => {
    const url = "https://example.com/path?q=1";
    const result = createHyperlink(url, undefined, {
      supportsHyperlinks: false,
    });

    expect(result).toBe(url);
  });

  test("URL with special characters works when supported", () => {
    const url = "https://example.com/path?a=1&b=2#section";
    const result = createHyperlink(url, undefined, { supportsHyperlinks: true });

    expect(result).toStartWith(`${OSC8_START}${url}${OSC8_END}`);
    expect(result).toEndWith(`${OSC8_START}${OSC8_END}`);
  });

  test("URL with special characters works when not supported", () => {
    const url = "https://example.com/path?a=1&b=2#section";
    const result = createHyperlink(url, undefined, {
      supportsHyperlinks: false,
    });

    expect(result).toBe(url);
  });

  test("supported link text contains the display content", () => {
    const result = createHyperlink("https://example.com", "text", {
      supportsHyperlinks: true,
    });

    // The colored text portion is between the two OSC8 sequences
    const inner = result.slice(
      `${OSC8_START}https://example.com${OSC8_END}`.length,
      result.length - `${OSC8_START}${OSC8_END}`.length
    );
    // chalk.blue may or may not emit ANSI depending on environment,
    // but the display text must always be present
    expect(inner).toContain("text");
  });

  test("empty content string is treated as display text when supported", () => {
    const url = "https://example.com";
    const result = createHyperlink(url, "", { supportsHyperlinks: true });

    // Empty string is falsy, so displayText falls back to url
    // Actually: content ?? url — "" is not null/undefined, so "" is used
    expect(result).toStartWith(`${OSC8_START}${url}${OSC8_END}`);
    expect(result).toEndWith(`${OSC8_START}${OSC8_END}`);
  });
});
