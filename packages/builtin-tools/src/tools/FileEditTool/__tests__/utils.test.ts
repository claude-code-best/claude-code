import { mock, describe, expect, test } from "bun:test";
import { logMock } from "../../../../../../tests/mocks/log";

// 模拟 log.ts 以切断繁重的依赖链
mock.module("src/utils/log.ts", logMock);

const {
  normalizeQuotes,
  stripTrailingWhitespace,
  findActualString,
  preserveQuoteStyle,
  applyEditToFile,
  LEFT_SINGLE_CURLY_QUOTE,
  RIGHT_SINGLE_CURLY_QUOTE,
  LEFT_DOUBLE_CURLY_QUOTE,
  RIGHT_DOUBLE_CURLY_QUOTE,
} = await import("../utils");

// ─── normalizeQuotes ────────────────────────────────────────────────────

describe("normalizeQuotes", () => {
  test("将左单花引号转换为直引号", () => {
    expect(normalizeQuotes(`${LEFT_SINGLE_CURLY_QUOTE}hello`)).toBe("'hello");
  });

  test("将右单花引号转换为直引号", () => {
    expect(normalizeQuotes(`hello${RIGHT_SINGLE_CURLY_QUOTE}`)).toBe("hello'");
  });

  test("将左双花引号转换为直引号", () => {
    expect(normalizeQuotes(`${LEFT_DOUBLE_CURLY_QUOTE}hello`)).toBe('"hello');
  });

  test("将右双花引号转换为直引号", () => {
    expect(normalizeQuotes(`hello${RIGHT_DOUBLE_CURLY_QUOTE}`)).toBe('hello"');
  });

  test("保持直引号不变", () => {
    expect(normalizeQuotes("'hello' \"world\"")).toBe("'hello' \"world\"");
  });

  test("处理空字符串", () => {
    expect(normalizeQuotes("")).toBe("");
  });
});

// ─── stripTrailingWhitespace ────────────────────────────────────────────

describe("stripTrailingWhitespace", () => {
  test("去除行尾空格", () => {
    expect(stripTrailingWhitespace("hello   \nworld  ")).toBe("hello\nworld");
  });

  test("去除行尾制表符", () => {
    expect(stripTrailingWhitespace("hello	\nworld	")).toBe("hello\nworld");
  });

  test("保留行首空白字符", () => {
    expect(stripTrailingWhitespace("  hello  \n  world  ")).toBe(
      "  hello\n  world"
    );
  });

  test("处理空字符串", () => {
    expect(stripTrailingWhitespace("")).toBe("");
  });

  test("处理 CRLF 换行符", () => {
    expect(stripTrailingWhitespace("hello   \nworld  ")).toBe(
      "hello\nworld"
    );
  });

  test("处理无尾随空白字符的情况", () => {
    expect(stripTrailingWhitespace("hello\nworld")).toBe("hello\nworld");
  });

  test("处理仅 CR 换行符", () => {
    expect(stripTrailingWhitespace("hello   \nworld  ")).toBe("hello\nworld");
  });

  test("处理无尾随换行符的内容", () => {
    expect(stripTrailingWhitespace("hello   ")).toBe("hello");
  });
});

// ─── findActualString ───────────────────────────────────────────────────

describe("findActualString", () => {
  test("查找精确匹配", () => {
    expect(findActualString("hello world", "hello")).toBe("hello");
  });

  test("在花引号标准化后查找匹配", () => {
    const fileContent = `${LEFT_DOUBLE_CURLY_QUOTE}hello${RIGHT_DOUBLE_CURLY_QUOTE}`;
    const result = findActualString(fileContent, '"hello"');
    expect(result).not.toBeNull();
  });

  test("未找到时返回 null", () => {
    expect(findActualString("hello world", "xyz")).toBeNull();
  });

  test("在非空内容中搜索空字符串时返回 null", () => {
    // 空字符串通过 includes() 方法总是在索引 0 处被找到
    const result = findActualString("hello", "");
    expect(result).toBe("");
  });

  // ── Tab/space normalization (Bug #2 reproduction) ──

  test("finds match when search uses spaces but file uses tabs", () => {
    // File content uses Tab indentation
    const fileContent = "\tif (x) {\n\t\treturn 1;\n\t}";
    // User copies from Read output which renders tabs as spaces
    const searchWithSpaces = "    if (x) {\n        return 1;\n    }";
    const result = findActualString(fileContent, searchWithSpaces);
    expect(result).not.toBeNull();
    expect(result).toBe(fileContent);
  });

  test("finds match when search mixes tabs and spaces inconsistently", () => {
    const fileContent = "\tconst x = 1; // comment";
    const searchMixed = "    const x = 1; // comment";
    const result = findActualString(fileContent, searchMixed);
    expect(result).not.toBeNull();
  });

  test("finds match for single-line tab-to-space mismatch", () => {
    const fileContent = "\t\torder_price = NormalizeDouble(ask, digits);";
    const searchSpaces = "        order_price = NormalizeDouble(ask, digits);";
    const result = findActualString(fileContent, searchSpaces);
    expect(result).not.toBeNull();
  });

  // ── CJK / UTF-8 characters (Bug #1 reproduction) ──

  test("finds match with CJK characters in content", () => {
    const fileContent = "input int x = 620; // 止盈点数(点) — 32个pip=320点";
    const result = findActualString(fileContent, fileContent);
    expect(result).toBe(fileContent);
  });

  test("finds match with CJK characters when tab/space differs", () => {
    const fileContent = "\t// 向上突破 → Sell Limit (逆方向做空)";
    const searchSpaces = "    // 向上突破 → Sell Limit (逆方向做空)";
    const result = findActualString(fileContent, searchSpaces);
    expect(result).not.toBeNull();
    expect(result).toBe(fileContent);
  });

  // ── Multiline with tabs + CJK (combined Bug #1 + #2) ──

  test("finds multiline match with tabs and CJK characters", () => {
    const fileContent = "\tif(effective_dir == BREAKOUT_UP)\n\t\t{\n\t\t\t// 向上突破\n\t\t}";
    const searchSpaces = "    if(effective_dir == BREAKOUT_UP)\n        {\n            // 向上突破\n        }";
    const result = findActualString(fileContent, searchSpaces);
    expect(result).not.toBeNull();
    expect(result).toBe(fileContent);
  });

  // ── Returned string must be a valid substring of fileContent ──

  test("returned string from tab match is a real substring of fileContent", () => {
    const fileContent = "prefix\n\t\tindented code\nsuffix";
    const searchSpaces = "prefix\n        indented code\nsuffix";
    const result = findActualString(fileContent, searchSpaces);
    expect(result).not.toBeNull();
    expect(fileContent.includes(result!)).toBe(true);
  });

  test("returned string from partial tab match is a real substring", () => {
    const fileContent = "line1\n\tif (x) {\n\t\tdoStuff();\n\t}\nline5";
    const searchSpaces = "    if (x) {\n        doStuff();\n    }";
    const result = findActualString(fileContent, searchSpaces);
    expect(result).not.toBeNull();
    expect(fileContent.includes(result!)).toBe(true);
  });

  test("tab match with mixed indentation levels", () => {
    const fileContent = "class Foo {\n\t\tmethod1() {\n\t\t\treturn 42;\n\t\t}\n}";
    const searchSpaces = "class Foo {\n        method1() {\n            return 42;\n        }\n}";
    const result = findActualString(fileContent, searchSpaces);
    expect(result).not.toBeNull();
    expect(fileContent.includes(result!)).toBe(true);
  });
});

// ─── preserveQuoteStyle ─────────────────────────────────────────────────

describe("preserveQuoteStyle", () => {
  test("未发生标准化时返回未更改的 newString", () => {
    expect(preserveQuoteStyle("hello", "hello", "world")).toBe("world");
  });

  test("在替换中将直双引号转换为花双引号", () => {
    const oldString = '"hello"';
    const actualOldString = `${LEFT_DOUBLE_CURLY_QUOTE}hello${RIGHT_DOUBLE_CURLY_QUOTE}`;
    const newString = '"world"';
    const result = preserveQuoteStyle(oldString, actualOldString, newString);
    expect(result).toContain(LEFT_DOUBLE_CURLY_QUOTE);
    expect(result).toContain(RIGHT_DOUBLE_CURLY_QUOTE);
  });

  test("在替换中将直单引号转换为花单引号", () => {
    const oldString = "'hello'";
    const actualOldString = `${LEFT_SINGLE_CURLY_QUOTE}hello${RIGHT_SINGLE_CURLY_QUOTE}`;
    const newString = "'world'";
    const result = preserveQuoteStyle(oldString, actualOldString, newString);
    expect(result).toContain(LEFT_SINGLE_CURLY_QUOTE);
    expect(result).toContain(RIGHT_SINGLE_CURLY_QUOTE);
  });

  test("将缩写中的撇号视为右花单引号", () => {
    const oldString = "'it's a test'";
    const actualOldString = `${LEFT_SINGLE_CURLY_QUOTE}it${RIGHT_SINGLE_CURLY_QUOTE}s a test${RIGHT_SINGLE_CURLY_QUOTE}`;
    const newString = "'don't worry'";
    const result = preserveQuoteStyle(oldString, actualOldString, newString);
    // 位置 0 处的前导 ' 应为 LEFT_SINGLE_CURLY_QUOTE
    expect(result[0]).toBe(LEFT_SINGLE_CURLY_QUOTE);
    // "don't" 中的撇号（n 和 t 之间）应为 RIGHT_SINGLE_CURLY_QUOTE
    expect(result).toContain(RIGHT_SINGLE_CURLY_QUOTE);
  });
});

// ─── applyEditToFile ────────────────────────────────────────────────────

describe("applyEditToFile", () => {
  test("默认替换第一个匹配项", () => {
    expect(applyEditToFile("foo bar foo", "foo", "baz")).toBe("baz bar foo");
  });

  test("replaces all occurrences with replaceAll=true", () => {
    expect(applyEditToFile("foo bar foo", "foo", "baz", true)).toBe(
      "baz bar baz"
    );
  });

  test("handles deletion (empty newString) with trailing newline", () => {
    const result = applyEditToFile("line1\nline2\nline3\n", "line2", "");
    expect(result).toBe("line1\nline3\n");
  });

  test("处理不带尾随换行符的删除操作", () => {
    const result = applyEditToFile("foobar", "foo", "");
    expect(result).toBe("bar");
  });

  test("handles no match (returns original)", () => {
    expect(applyEditToFile("hello world", "xyz", "abc")).toBe("hello world");
  });

  test("处理原始内容为空时的插入操作", () => {
    expect(applyEditToFile("", "", "new content")).toBe("new content");
  });

  test("处理多行 oldString 和 newString", () => {
    const content = "line1\nline2\nline3\n";
    const result = applyEditToFile(content, "line2\nline3", "replaced");
    expect(result).toBe("line1\nreplaced\n");
  });

  test("处理跨多行的多行替换", () => {
    const content = "header\nold line A\nold line B\nfooter\n";
    const result = applyEditToFile(
      content,
      "old line A\nold line B",
      "new line X\nnew line Y"
    );
    expect(result).toBe("页眉\n新行 X\n新行 Y\n页脚\n");
  });
});
