import { describe, expect, test } from "bun:test";
import { escapeXml, escapeXmlAttr } from "../xml";

describe("escapeXml", () => {
  test("escapes ampersand", () => {
    expect(escapeXml("a & b")).toBe("a &amp; b");
  });

  test("escapes less-than", () => {
    expect(escapeXml("<div>")).toBe("&lt;div&gt;");
  });

  test("escapes greater-than", () => {
    expect(escapeXml("a > b")).toBe("a &gt; b");
  });

  test("escapes multiple special chars", () => {
    expect(escapeXml("<a & b>")).toBe("&lt;a &amp; b&gt;");
  });

  test("returns empty string unchanged", () => {
    expect(escapeXml("")).toBe("");
  });

  test("returns normal text unchanged", () => {
    expect(escapeXml("hello world")).toBe("hello world");
  });
});

describe("escapeXmlAttr", () => {
  test("escapes double quotes", () => {
    expect(escapeXmlAttr('say "hello"')).toBe("say &quot;hello&quot;");
  });

  test("escapes single quotes", () => {
    expect(escapeXmlAttr("it's")).toBe("it&apos;s");
  });

  test("escapes all special chars", () => {
    expect(escapeXmlAttr('<a & "b">')).toBe("&lt;a &amp; &quot;b&quot;&gt;");
  });
});
