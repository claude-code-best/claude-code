import { describe, expect, test } from 'bun:test'
import { parseGitCommitId, detectGitOperation } from '../gitOperationTracking'

describe('parseGitCommitId', () => {
  test('extracts commit hash from git commit output', () => {
    expect(parseGitCommitId('[main abc1234] fix: some message')).toBe('abc1234')
  })

  test('extracts hash from root commit output', () => {
    expect(
      parseGitCommitId('[main (root-commit) abc1234] initial commit'),
    ).toBe('abc1234')
  })

  test('returns undefined for non-commit output', () => {
    expect(parseGitCommitId('nothing to commit')).toBeUndefined()
  })

  test('handles various branch name formats', () => {
    expect(parseGitCommitId('[feature/foo abc1234] message')).toBe('abc1234')
    expect(parseGitCommitId('[fix/bar-baz abc1234] message')).toBe('abc1234')
    expect(parseGitCommitId('[v1.0.0 abc1234] message')).toBe('abc1234')
  })

  test('returns undefined for empty string', () => {
    expect(parseGitCommitId('')).toBeUndefined()
  })
})

describe('detectGitOperation', () => {
  test('detects git commit operation', () => {
    const result = detectGitOperation(
      "git commit -m 'fix bug'",
      '[main abc1234] fix bug',
    )
    expect(result.commit).toBeDefined()
    expect(result.commit!.sha).toBe('abc123')
    expect(result.commit!.kind).toBe('committed')
  })

  test('detects git commit --amend operation', () => {
    const result = detectGitOperation(
      "git commit --amend -m 'updated'",
      '[main def5678] updated',
    )
    expect(result.commit).toBeDefined()
    expect(result.commit!.kind).toBe('amended')
  })

  test('detects git cherry-pick operation', () => {
    const result = detectGitOperation(
      'git cherry-pick abc1234',
      '[main def5678] cherry picked commit',
    )
    expect(result.commit).toBeDefined()
    expect(result.commit!.kind).toBe('cherry-picked')
  })

  test('detects git push operation', () => {
    const result = detectGitOperation(
      'git push origin main',
      '   abc1234..def5678  main -> main',
    )
    expect(result.push).toBeDefined()
    expect(result.push!.branch).toBe('main')
  })

  test('detects git merge operation', () => {
    const result = detectGitOperation(
      'git merge feature-branch',
      "Merge made by the 'ort' strategy.",
    )
    expect(result.branch).toBeDefined()
    expect(result.branch!.action).toBe('merged')
    expect(result.branch!.ref).toBe('feature-branch')
  })

  test('detects git rebase operation', () => {
    const result = detectGitOperation(
      'git rebase main',
      'Successfully rebased and updated refs/heads/feature.',
    )
    expect(result.branch).toBeDefined()
    expect(result.branch!.action).toBe('rebased')
    expect(result.branch!.ref).toBe('main')
  })

  test('returns null for non-git commands', () => {
    const result = detectGitOperation('ls -la', 'total 100\ndrwxr-xr-x')
    expect(result.commit).toBeUndefined()
    expect(result.push).toBeUndefined()
    expect(result.branch).toBeUndefined()
    expect(result.pr).toBeUndefined()
  })

  test('detects gh pr create operation', () => {
    const result = detectGitOperation(
      "gh pr create --title 'fix' --body 'desc'",
      'https://github.com/owner/repo/pull/42',
    )
    expect(result.pr).toBeDefined()
    expect(result.pr!.number).toBe(42)
    expect(result.pr!.action).toBe('created')
  })

  test('detects gh pr merge operation', () => {
    const result = detectGitOperation(
      'gh pr merge 42',
      '✓ Merged pull request owner/repo#42',
    )
    expect(result.pr).toBeDefined()
    expect(result.pr!.number).toBe(42)
    expect(result.pr!.action).toBe('merged')
  })

  test('handles git commit with -c options', () => {
    const result = detectGitOperation(
      "git -c commit.gpgsign=false commit -m 'msg'",
      '[main aaa1111] msg',
    )
    expect(result.commit).toBeDefined()
    expect(result.commit!.sha).toBe('aaa111')
  })

  test('detects fast-forward merge', () => {
    const result = detectGitOperation(
      'git merge develop',
      'Fast-forward\n file.txt | 1 +\n 1 file changed',
    )
    expect(result.branch).toBeDefined()
    expect(result.branch!.action).toBe('merged')
    expect(result.branch!.ref).toBe('develop')
  })

  test('detects gh pr edit operation', () => {
    const result = detectGitOperation(
      "gh pr edit 42 --title 'new title'",
      'https://github.com/owner/repo/pull/42',
    )
    expect(result.pr).toBeDefined()
    expect(result.pr!.number).toBe(42)
    expect(result.pr!.action).toBe('edited')
  })

  test('detects gh pr comment operation', () => {
    const result = detectGitOperation(
      "gh pr comment 42 --body 'looks good'",
      'https://github.com/owner/repo/pull/42',
    )
    expect(result.pr).toBeDefined()
    expect(result.pr!.number).toBe(42)
    expect(result.pr!.action).toBe('commented')
  })

  test('detects gh pr close operation', () => {
    const result = detectGitOperation(
      'gh pr close 42',
      '✓ Closed pull request owner/repo#42',
    )
    expect(result.pr).toBeDefined()
    expect(result.pr!.number).toBe(42)
    expect(result.pr!.action).toBe('closed')
  })

  test('detects gh pr ready operation', () => {
    const result = detectGitOperation(
      'gh pr ready 42',
      '✓ Converted pull request owner/repo#42 to "Ready for review"',
    )
    expect(result.pr).toBeDefined()
    expect(result.pr!.number).toBe(42)
    expect(result.pr!.action).toBe('ready')
  })

  test('handles empty command string', () => {
    const result = detectGitOperation('', 'some output')
    expect(result.commit).toBeUndefined()
    expect(result.push).toBeUndefined()
    expect(result.branch).toBeUndefined()
    expect(result.pr).toBeUndefined()
  })

  test('handles empty output string', () => {
    const result = detectGitOperation("git commit -m 'msg'", '')
    expect(result.commit).toBeUndefined()
  })

  test('handles malformed git commit output', () => {
    const result = detectGitOperation(
      "git commit -m 'msg'",
      'error: something went wrong',
    )
    expect(result.commit).toBeUndefined()
  })
})
