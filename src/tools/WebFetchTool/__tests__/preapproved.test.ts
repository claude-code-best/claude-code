import { describe, expect, test } from "bun:test";
import { isPreapprovedHost } from "../preapproved";

describe("isPreapprovedHost", () => {
  test("exact hostname match returns true", () => {
    expect(isPreapprovedHost("docs.python.org", "/3/")).toBe(true);
  });

  test("developer.mozilla.org is preapproved", () => {
    expect(isPreapprovedHost("developer.mozilla.org", "/en-US/")).toBe(true);
  });

  test("bun.sh is preapproved", () => {
    expect(isPreapprovedHost("bun.sh", "/docs")).toBe(true);
  });

  test("unknown hostname returns false", () => {
    expect(isPreapprovedHost("evil.com", "/")).toBe(false);
  });

  test("localhost is not preapproved", () => {
    expect(isPreapprovedHost("localhost", "/")).toBe(false);
  });

  test("empty hostname returns false", () => {
    expect(isPreapprovedHost("", "/")).toBe(false);
  });

  test("path-scoped entry matches exact path", () => {
    // github.com/anthropics is a path-scoped entry
    expect(isPreapprovedHost("github.com", "/anthropics")).toBe(true);
  });

  test("path-scoped entry matches sub-path", () => {
    expect(isPreapprovedHost("github.com", "/anthropics/claude-code")).toBe(true);
  });

  test("path-scoped entry does not match other paths", () => {
    // github.com is NOT in the hostname-only set (only github.com/anthropics is)
    expect(isPreapprovedHost("github.com", "/torvalds/linux")).toBe(false);
  });

  test("path-scoped entry with trailing slash", () => {
    expect(isPreapprovedHost("github.com", "/anthropics/")).toBe(true);
  });

  test("vercel.com/docs matches (path-scoped)", () => {
    expect(isPreapprovedHost("vercel.com", "/docs")).toBe(true);
  });

  test("vercel.com/docs/something matches", () => {
    expect(isPreapprovedHost("vercel.com", "/docs/something")).toBe(true);
  });

  test("vercel.com root does not match", () => {
    expect(isPreapprovedHost("vercel.com", "/")).toBe(false);
  });

  test("docs.netlify.com matches (path-scoped)", () => {
    expect(isPreapprovedHost("docs.netlify.com", "/")).toBe(true);
  });

  test("case sensitivity — hostname must match exactly", () => {
    expect(isPreapprovedHost("Docs.Python.org", "/3/")).toBe(false);
  });

  test("subdomain of preapproved host does not match", () => {
    expect(isPreapprovedHost("sub.docs.python.org", "/3/")).toBe(false);
  });

  test("www.typescriptlang.org is preapproved", () => {
    expect(isPreapprovedHost("www.typescriptlang.org", "/docs/")).toBe(true);
  });

  test("modelcontextprotocol.io is preapproved", () => {
    expect(isPreapprovedHost("modelcontextprotocol.io", "/")).toBe(true);
  });
});
