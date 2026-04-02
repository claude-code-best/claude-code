import { describe, expect, test } from "bun:test";
import { normalizeGitRemoteUrl } from "../git";

describe("normalizeGitRemoteUrl", () => {
  describe("SSH format (git@host:owner/repo)", () => {
    test("normalizes basic SSH URL", () => {
      expect(normalizeGitRemoteUrl("git@github.com:owner/repo.git")).toBe(
        "github.com/owner/repo"
      );
    });

    test("handles SSH URL without .git suffix", () => {
      expect(normalizeGitRemoteUrl("git@github.com:owner/repo")).toBe(
        "github.com/owner/repo"
      );
    });

    test("handles nested paths", () => {
      expect(normalizeGitRemoteUrl("git@gitlab.com:group/sub/repo.git")).toBe(
        "gitlab.com/group/sub/repo"
      );
    });
  });

  describe("HTTPS format", () => {
    test("normalizes basic HTTPS URL", () => {
      expect(
        normalizeGitRemoteUrl("https://github.com/owner/repo.git")
      ).toBe("github.com/owner/repo");
    });

    test("handles HTTPS without .git suffix", () => {
      expect(normalizeGitRemoteUrl("https://github.com/owner/repo")).toBe(
        "github.com/owner/repo"
      );
    });

    test("handles HTTP URL", () => {
      expect(normalizeGitRemoteUrl("http://github.com/owner/repo.git")).toBe(
        "github.com/owner/repo"
      );
    });

    test("handles HTTPS with auth", () => {
      expect(
        normalizeGitRemoteUrl("https://user@github.com/owner/repo.git")
      ).toBe("github.com/owner/repo");
    });
  });

  describe("ssh:// format", () => {
    test("normalizes ssh:// URL", () => {
      expect(
        normalizeGitRemoteUrl("ssh://git@github.com/owner/repo")
      ).toBe("github.com/owner/repo");
    });

    test("handles ssh:// with .git suffix", () => {
      expect(
        normalizeGitRemoteUrl("ssh://git@github.com/owner/repo.git")
      ).toBe("github.com/owner/repo");
    });
  });

  describe("CCR proxy URLs", () => {
    test("handles legacy proxy format (assumes github.com)", () => {
      expect(
        normalizeGitRemoteUrl(
          "http://local_proxy@127.0.0.1:16583/git/owner/repo"
        )
      ).toBe("github.com/owner/repo");
    });

    test("handles GHE proxy format (host in path)", () => {
      expect(
        normalizeGitRemoteUrl(
          "http://local_proxy@127.0.0.1:16583/git/ghe.company.com/owner/repo"
        )
      ).toBe("ghe.company.com/owner/repo");
    });

    test("handles localhost proxy", () => {
      expect(
        normalizeGitRemoteUrl(
          "http://proxy@localhost:8080/git/owner/repo"
        )
      ).toBe("github.com/owner/repo");
    });
  });

  describe("case normalization", () => {
    test("converts to lowercase", () => {
      expect(normalizeGitRemoteUrl("git@GitHub.COM:Owner/Repo.git")).toBe(
        "github.com/owner/repo"
      );
    });

    test("converts HTTPS to lowercase", () => {
      expect(
        normalizeGitRemoteUrl("https://GitHub.COM/Owner/Repo.git")
      ).toBe("github.com/owner/repo");
    });
  });

  describe("edge cases", () => {
    test("returns null for empty string", () => {
      expect(normalizeGitRemoteUrl("")).toBeNull();
    });

    test("returns null for whitespace only", () => {
      expect(normalizeGitRemoteUrl("   ")).toBeNull();
    });

    test("returns null for unrecognized format", () => {
      expect(normalizeGitRemoteUrl("not-a-url")).toBeNull();
    });

    test("trims whitespace before parsing", () => {
      expect(
        normalizeGitRemoteUrl("  git@github.com:owner/repo.git  ")
      ).toBe("github.com/owner/repo");
    });
  });
});
