# Git Utilities Test Plan

## Overview

The git utility module provides git remote URL normalization, repository root discovery, bare repository safety detection, and other functionality. The testing focus is on pure function URL normalization and repository discovery logic that requires filesystem mocks.

## Files Under Test

| File | Key Exports |
|------|-------------|
| `src/utils/git.ts` | `normalizeGitRemoteUrl`, `findGitRoot`, `findCanonicalGitRoot`, `getIsGit`, `isAtGitRoot`, `getRepoRemoteHash`, `isCurrentDirectoryBareGitRepo`, `gitExe`, `getGitState`, `stashToCleanState`, `preserveGitStateForIssue` |

---

## Test Cases

### describe('normalizeGitRemoteUrl') (pure function)

#### SSH Format

- test('normalizes SSH URL') — `'git@github.com:owner/repo.git'` → `'github.com/owner/repo'`
- test('normalizes SSH URL without .git suffix') — `'git@github.com:owner/repo'` → `'github.com/owner/repo'`
- test('handles GitLab SSH') — `'git@gitlab.com:group/subgroup/repo.git'` → `'gitlab.com/group/subgroup/repo'`

#### HTTPS Format

- test('normalizes HTTPS URL') — `'https://github.com/owner/repo.git'` → `'github.com/owner/repo'`
- test('normalizes HTTPS URL without .git suffix') — `'https://github.com/owner/repo'` → `'github.com/owner/repo'`
- test('normalizes HTTP URL') — `'http://github.com/owner/repo.git'` → `'github.com/owner/repo'`

#### SSH:// Protocol Format

- test('normalizes ssh:// URL') — `'ssh://git@github.com/owner/repo'` → `'github.com/owner/repo'`
- test('handles user prefix in ssh://') — `'ssh://user@host/path'` → `'host/path'`

#### Proxy URLs (CCR git proxy)

- test('normalizes legacy proxy URL') — `'http://local_proxy@127.0.0.1:16583/git/owner/repo'` → `'github.com/owner/repo'`
- test('normalizes GHE proxy URL') — `'http://user@127.0.0.1:8080/git/ghe.company.com/owner/repo'` → `'ghe.company.com/owner/repo'`

#### Edge Cases

- test('returns null for empty string') — `''` → null
- test('returns null for whitespace') — `'  '` → null
- test('returns null for unrecognized format') — `'not-a-url'` → null
- test('output is lowercase') — `'git@GitHub.com:Owner/Repo.git'` → `'github.com/owner/repo'`
- test('SSH and HTTPS for same repo produce same result') — Same repository with different protocols → same output

---

### describe('findGitRoot') (requires filesystem mock)

- test('finds git root from nested directory') — `/project/src/utils/` → `/project/` (assuming `/project/.git` exists)
- test('finds git root from root directory') — `/project/` → `/project/`
- test('returns null for non-git directory') — No `.git` → null
- test('handles worktree .git file') — Also identified when `.git` is a file
- test('memoizes results') — Same path does not trigger repeated lookups

### describe('findCanonicalGitRoot')

- test('returns same as findGitRoot for regular repo')
- test('resolves worktree to main repo root') — Worktree path → main repository root
- test('returns null for non-git directory')

### describe('gitExe')

- test('returns git path string') — Returns a string
- test('memoizes the result') — Multiple calls return the same value

---

### describe('getRepoRemoteHash') (requires mock)

- test('returns 16-char hex hash') — Return value is a 16-character hexadecimal string
- test('returns null when no remote') — Returns null when no remote URL exists
- test('same repo SSH/HTTPS produce same hash') — Same repository with different protocols produces the same hash

---

### describe('isCurrentDirectoryBareGitRepo') (requires filesystem mock)

- test('detects bare git repo attack vector') — Directory contains HEAD + objects/ + refs/ but no valid .git/HEAD → true
- test('returns false for normal directory') — Regular directory → false
- test('returns false for regular git repo') — Valid .git directory → false

---

## Mock Requirements

| Dependency | Mock Approach | Notes |
|------------|---------------|-------|
| `statSync` | mock module | `.git` detection in `findGitRoot` |
| `readFileSync` | mock module | Worktree `.git` file reading |
| `realpathSync` | mock module | Path resolution |
| `execFileNoThrow` | mock module | Git command execution |
| `whichSync` | mock module | Git path lookup in `gitExe` |
| `getCwd` | mock module | Current working directory |
| `getRemoteUrl` | mock module | `getRepoRemoteHash` dependency |
| Temporary directory | `mkdtemp` | Creating temporary git repos in integration tests |

## Integration Test Scenarios

### describe('Git repo discovery') (located in tests/integration/)

- test('findGitRoot works in actual git repo') — Verified in a temporary git-initialized directory
- test('normalizeGitRemoteUrl + getRepoRemoteHash produces stable hash') — URL to hash end-to-end verification
