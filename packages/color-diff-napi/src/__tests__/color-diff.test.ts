import { describe, expect, test } from "bun:test";
import { __test } from "../index";

const { ansi256FromRgb, colorToEscape, detectColorMode, detectLanguage, tokenize } = __test;

describe("ansi256FromRgb", () => {
	test("black maps to index 16", () => {
		expect(ansi256FromRgb(0, 0, 0)).toBe(16);
	});

	test("pure red maps to cube red", () => {
		expect(ansi256FromRgb(255, 0, 0)).toBe(196);
	});

	test("pure green maps to cube green", () => {
		expect(ansi256FromRgb(0, 255, 0)).toBe(46);
	});

	test("pure blue maps to cube blue", () => {
		expect(ansi256FromRgb(0, 0, 255)).toBe(21);
	});

	test("grey values map to grey ramp", () => {
		const idx = ansi256FromRgb(128, 128, 128);
		// Should be in the grey ramp range (232-255)
		expect(idx).toBeGreaterThanOrEqual(232);
		expect(idx).toBeLessThanOrEqual(255);
	});
});

describe("colorToEscape", () => {
	test("palette index < 8 uses standard ANSI codes", () => {
		const color = { r: 1, g: 0, b: 0, a: 0 }; // palette index 1
		expect(colorToEscape(color, true, "truecolor")).toBe("\x1b[31m"); // fg red
		expect(colorToEscape(color, false, "truecolor")).toBe("\x1b[41m"); // bg red
	});

	test("palette index 8-15 uses bright ANSI codes", () => {
		const color = { r: 9, g: 0, b: 0, a: 0 }; // bright red
		expect(colorToEscape(color, true, "truecolor")).toBe("\x1b[91m");
	});

	test("alpha=1 returns terminal default", () => {
		const color = { r: 0, g: 0, b: 0, a: 1 };
		expect(colorToEscape(color, true, "truecolor")).toBe("\x1b[39m");
		expect(colorToEscape(color, false, "truecolor")).toBe("\x1b[49m");
	});

	test("truecolor uses RGB escape", () => {
		const color = { r: 100, g: 150, b: 200, a: 255 };
		expect(colorToEscape(color, true, "truecolor")).toBe("\x1b[38;2;100;150;200m");
	});

	test("color256 uses 256-color escape", () => {
		const color = { r: 100, g: 150, b: 200, a: 255 };
		const result = colorToEscape(color, true, "color256");
		expect(result).toMatch(/^\x1b\[38;5;\d+m$/);
	});
});

describe("detectColorMode", () => {
	test("returns ansi for ansi-containing theme names", () => {
		expect(detectColorMode("ansi")).toBe("ansi");
		expect(detectColorMode("base16-ansi-dark")).toBe("ansi");
	});

	test("returns truecolor or color256 for non-ansi themes", () => {
		const mode = detectColorMode("monokai");
		expect(["truecolor", "color256"]).toContain(mode);
	});
});

describe("detectLanguage", () => {
	test("detects language from file extension", () => {
		expect(detectLanguage("index.ts", null)).toBe("ts");
		expect(detectLanguage("main.py", null)).toBe("py");
		expect(detectLanguage("style.css", null)).toBe("css");
	});

	test("detects language from known filenames", () => {
		expect(detectLanguage("Makefile", null)).toBe("makefile");
		expect(detectLanguage("Dockerfile", null)).toBe("dockerfile");
	});

	test("returns null for unknown extensions", () => {
		expect(detectLanguage("file.xyz123", null)).toBeNull();
	});
});

describe("tokenize", () => {
	test("returns array of tokens", () => {
		const result = tokenize("hello world");
		expect(Array.isArray(result)).toBe(true);
		expect(result.length).toBeGreaterThan(0);
	});

	test("preserves original text when joined", () => {
		const text = "foo bar baz";
		const tokens = tokenize(text);
		expect(tokens.join("")).toBe(text);
	});
});
