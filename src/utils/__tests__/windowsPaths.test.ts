import { describe, expect, test } from "bun:test";
import {
  windowsPathToPosixPath,
  posixPathToWindowsPath,
} from "../windowsPaths";

// ─── windowsPathToPosixPath ────────────────────────────────────────────

describe("windowsPathToPosixPath", () => {
  test("converts drive letter path to posix", () => {
    expect(windowsPathToPosixPath("C:\\Users\\foo")).toBe("/c/Users/foo");
  });

  test("lowercases the drive letter", () => {
    expect(windowsPathToPosixPath("D:\\Work\\project")).toBe(
      "/d/Work/project"
    );
  });

  test("handles lowercase drive letter input", () => {
    expect(windowsPathToPosixPath("e:\\data")).toBe("/e/data");
  });

  test("converts UNC path", () => {
    expect(windowsPathToPosixPath("\\\\server\\share\\dir")).toBe(
      "//server/share/dir"
    );
  });

  test("converts root drive path", () => {
    expect(windowsPathToPosixPath("D:\\")).toBe("/d/");
  });

  test("converts relative path by flipping backslashes", () => {
    expect(windowsPathToPosixPath("src\\main.ts")).toBe("src/main.ts");
  });

  test("handles forward slashes in windows drive path", () => {
    // The regex matches both / and \\ after drive letter
    expect(windowsPathToPosixPath("C:/Users/foo")).toBe("/c/Users/foo");
  });

  test("already-posix relative path passes through", () => {
    expect(windowsPathToPosixPath("src/main.ts")).toBe("src/main.ts");
  });

  test("handles deeply nested path", () => {
    expect(
      windowsPathToPosixPath("C:\\Users\\me\\Documents\\project\\src\\index.ts")
    ).toBe("/c/Users/me/Documents/project/src/index.ts");
  });
});

// ─── posixPathToWindowsPath ────────────────────────────────────────────

describe("posixPathToWindowsPath", () => {
  test("converts MSYS2/Git Bash drive path to windows", () => {
    expect(posixPathToWindowsPath("/c/Users/foo")).toBe("C:\\Users\\foo");
  });

  test("uppercases the drive letter", () => {
    expect(posixPathToWindowsPath("/d/Work/project")).toBe(
      "D:\\Work\\project"
    );
  });

  test("converts cygdrive path", () => {
    expect(posixPathToWindowsPath("/cygdrive/d/work")).toBe("D:\\work");
  });

  test("converts cygdrive root path", () => {
    expect(posixPathToWindowsPath("/cygdrive/c/")).toBe("C:\\");
  });

  test("converts UNC posix path to windows UNC", () => {
    expect(posixPathToWindowsPath("//server/share/dir")).toBe(
      "\\\\server\\share\\dir"
    );
  });

  test("converts root drive posix path", () => {
    expect(posixPathToWindowsPath("/d/")).toBe("D:\\");
  });

  test("converts bare drive mount (no trailing slash)", () => {
    // /d matches the regex ^\/([A-Za-z])(\/|$) where $2 is empty
    expect(posixPathToWindowsPath("/d")).toBe("D:\\");
  });

  test("converts relative path by flipping forward slashes", () => {
    expect(posixPathToWindowsPath("src/main.ts")).toBe("src\\main.ts");
  });

  test("handles already-windows relative path", () => {
    // No leading / or //, just flips / to backslash
    expect(posixPathToWindowsPath("foo\\bar")).toBe("foo\\bar");
  });
});

// ─── round-trip conversions ────────────────────────────────────────────

describe("round-trip conversions", () => {
  test("drive path round-trips windows -> posix -> windows", () => {
    const original = "C:\\Users\\foo\\bar";
    const posix = windowsPathToPosixPath(original);
    const back = posixPathToWindowsPath(posix);
    expect(back).toBe(original);
  });

  test("drive path round-trips posix -> windows -> posix", () => {
    const original = "/c/Users/foo/bar";
    const win = posixPathToWindowsPath(original);
    const back = windowsPathToPosixPath(win);
    expect(back).toBe(original);
  });
});
