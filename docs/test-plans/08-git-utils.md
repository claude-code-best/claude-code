# Git 工具测试计划

## 概述

Git 工具模块提供 git 远程 URL 规范化、仓库根目录查找、裸仓库安全检测等功能。测试重点是纯函数的 URL 规范化和需要文件系统 mock 的仓库发现逻辑。

## 被测文件

| 文件 | 关键导出 |
|------|----------|
| `src/utils/git.ts` | `normalizeGitRemoteUrl`, `findGitRoot`, `findCanonicalGitRoot`, `getIsGit`, `isAtGitRoot`, `getRepoRemoteHash`, `isCurrentDirectoryBareGitRepo`, `gitExe`, `getGitState`, `stashToCleanState`, `preserveGitStateForIssue` |

---

## 测试用例

### describe('normalizeGitRemoteUrl')（纯函数）

#### SSH 格式

- test('normalizes SSH URL') — `'git@github.com:owner/repo.git'` → `'github.com/owner/repo'`
- test('normalizes SSH URL without .git suffix') — `'git@github.com:owner/repo'` → `'github.com/owner/repo'`
- test('handles GitLab SSH') — `'git@gitlab.com:group/subgroup/repo.git'` → `'gitlab.com/group/subgroup/repo'`

#### HTTPS 格式

- test('normalizes HTTPS URL') — `'https://github.com/owner/repo.git'` → `'github.com/owner/repo'`
- test('normalizes HTTPS URL without .git suffix') — `'https://github.com/owner/repo'` → `'github.com/owner/repo'`
- test('normalizes HTTP URL') — `'http://github.com/owner/repo.git'` → `'github.com/owner/repo'`

#### SSH:// 协议格式

- test('normalizes ssh:// URL') — `'ssh://git@github.com/owner/repo'` → `'github.com/owner/repo'`
- test('handles user prefix in ssh://') — `'ssh://user@host/path'` → `'host/path'`

#### 代理 URL（CCR git proxy）

- test('normalizes legacy proxy URL') — `'http://local_proxy@127.0.0.1:16583/git/owner/repo'` → `'github.com/owner/repo'`
- test('normalizes GHE proxy URL') — `'http://user@127.0.0.1:8080/git/ghe.company.com/owner/repo'` → `'ghe.company.com/owner/repo'`

#### 边界情况

- test('returns null for empty string') — `''` → null
- test('returns null for whitespace') — `'  '` → null
- test('returns null for unrecognized format') — `'not-a-url'` → null
- test('output is lowercase') — `'git@GitHub.com:Owner/Repo.git'` → `'github.com/owner/repo'`
- test('SSH and HTTPS for same repo produce same result') — 相同仓库不同协议 → 相同输出

---

### describe('findGitRoot')（需文件系统 Mock）

- test('finds git root from nested directory') — `/project/src/utils/` → `/project/`（假设 `/project/.git` 存在）
- test('finds git root from root directory') — `/project/` → `/project/`
- test('returns null for non-git directory') — 无 `.git` → null
- test('handles worktree .git file') — `.git` 为文件时也识别
- test('memoizes results') — 同一路径不重复查找

### describe('findCanonicalGitRoot')

- test('returns same as findGitRoot for regular repo')
- test('resolves worktree to main repo root') — worktree 路径 → 主仓库根目录
- test('returns null for non-git directory')

### describe('gitExe')

- test('returns git path string') — 返回字符串
- test('memoizes the result') — 多次调用返回同一值

---

### describe('getRepoRemoteHash')（需 Mock）

- test('returns 16-char hex hash') — 返回值为 16 位十六进制字符串
- test('returns null when no remote') — 无 remote URL 时返回 null
- test('same repo SSH/HTTPS produce same hash') — 不同协议同一仓库 hash 相同

---

### describe('isCurrentDirectoryBareGitRepo')（需文件系统 Mock）

- test('detects bare git repo attack vector') — 目录含 HEAD + objects/ + refs/ 但无有效 .git/HEAD → true
- test('returns false for normal directory') — 普通目录 → false
- test('returns false for regular git repo') — 有效 .git 目录 → false

---

## Mock 需求

| 依赖 | Mock 方式 | 说明 |
|------|-----------|------|
| `statSync` | mock module | `findGitRoot` 中的 .git 检测 |
| `readFileSync` | mock module | worktree .git 文件读取 |
| `realpathSync` | mock module | 路径解析 |
| `execFileNoThrow` | mock module | git 命令执行 |
| `whichSync` | mock module | `gitExe` 中的 git 路径查找 |
| `getCwd` | mock module | 当前工作目录 |
| `getRemoteUrl` | mock module | `getRepoRemoteHash` 依赖 |
| 临时目录 | `mkdtemp` | 集成测试中创建临时 git 仓库 |

## 集成测试场景

### describe('Git repo discovery')（放在 tests/integration/）

- test('findGitRoot works in actual git repo') — 在临时 git init 的目录中验证
- test('normalizeGitRemoteUrl + getRepoRemoteHash produces stable hash') — URL → hash 端到端验证
