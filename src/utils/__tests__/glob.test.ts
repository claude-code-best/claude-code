import { describe, expect, test } from "bun:test";
import { extractGlobBaseDirectory } from "../glob";

describe("extractGlobBaseDirectory", () => {
  test("extracts base dir from glob with *", () => {
    const result = extractGlobBaseDirectory("src/utils/*.ts");
    expect(result.baseDir).toBe("src/utils");
    expect(result.relativePattern).toBe("*.ts");
  });

  test("extracts base dir from glob with **", () => {
    const result = extractGlobBaseDirectory("src/**/*.ts");
    expect(result.baseDir).toBe("src");
    expect(result.relativePattern).toBe("**/*.ts");
  });

  test("returns dirname for literal path", () => {
    const result = extractGlobBaseDirectory("src/utils/file.ts");
    expect(result.baseDir).toBe("src/utils");
    expect(result.relativePattern).toBe("file.ts");
  });

  test("handles glob starting with pattern", () => {
    const result = extractGlobBaseDirectory("*.ts");
    expect(result.baseDir).toBe("");
    expect(result.relativePattern).toBe("*.ts");
  });

  test("handles braces pattern", () => {
    const result = extractGlobBaseDirectory("src/{a,b}/*.ts");
    expect(result.baseDir).toBe("src");
    expect(result.relativePattern).toBe("{a,b}/*.ts");
  });

  test("handles question mark pattern", () => {
    const result = extractGlobBaseDirectory("src/?.ts");
    expect(result.baseDir).toBe("src");
    expect(result.relativePattern).toBe("?.ts");
  });
});
