import { describe, expect, test } from 'bun:test'
import { getDestructiveCommandWarning } from '../destructiveCommandWarning'

describe('getDestructiveCommandWarning', () => {
  // ─── Git data loss ─────────────────────────────────────────────────
  test('detects git reset --hard', () => {
    const w = getDestructiveCommandWarning('git reset --hard HEAD~1')
    expect(w).toContain('discard uncommitted changes')
  })

  test('detects git push --force', () => {
    const w = getDestructiveCommandWarning('git push --force origin main')
    expect(w).toContain('overwrite remote history')
  })

  test('detects git push -f', () => {
    expect(getDestructiveCommandWarning('git push -f')).toContain(
      'overwrite remote history',
    )
  })

  test('detects git clean -f', () => {
    const w = getDestructiveCommandWarning('git clean -fd')
    expect(w).toContain('delete untracked files')
  })

  test('does not flag git clean --dry-run', () => {
    expect(getDestructiveCommandWarning('git clean -fdn')).toBeNull()
  })

  test('detects git checkout .', () => {
    const w = getDestructiveCommandWarning('git checkout -- .')
    expect(w).toContain('discard all working tree changes')
  })

  test('detects git restore .', () => {
    const w = getDestructiveCommandWarning('git restore -- .')
    expect(w).toContain('discard all working tree changes')
  })

  test('detects git stash drop', () => {
    const w = getDestructiveCommandWarning('git stash drop')
    expect(w).toContain('remove stashed changes')
  })

  test('detects git branch -D', () => {
    const w = getDestructiveCommandWarning('git branch -D feature')
    expect(w).toContain('force-delete a branch')
  })

  // ─── Git safety bypass ────────────────────────────────────────────
  test('detects --no-verify', () => {
    const w = getDestructiveCommandWarning("git commit --no-verify -m 'x'")
    expect(w).toContain('skip safety hooks')
  })

  test('detects git commit --amend', () => {
    const w = getDestructiveCommandWarning('git commit --amend')
    expect(w).toContain('rewrite the last commit')
  })

  // ─── File deletion ────────────────────────────────────────────────
  test('detects rm -rf', () => {
    const w = getDestructiveCommandWarning('rm -rf /tmp/dir')
    expect(w).toContain('recursively force-remove')
  })

  test('detects rm -r', () => {
    const w = getDestructiveCommandWarning('rm -r dir')
    expect(w).toContain('recursively remove')
  })

  test('detects rm -f', () => {
    const w = getDestructiveCommandWarning('rm -f file.txt')
    expect(w).toContain('force-remove')
  })

  // ─── Database ─────────────────────────────────────────────────────
  test('detects DROP TABLE', () => {
    const w = getDestructiveCommandWarning("psql -c 'DROP TABLE users'")
    expect(w).toContain('drop or truncate')
  })

  test('detects TRUNCATE TABLE', () => {
    const w = getDestructiveCommandWarning('TRUNCATE TABLE logs')
    expect(w).toContain('drop or truncate')
  })

  test('detects DELETE FROM without WHERE', () => {
    const w = getDestructiveCommandWarning('DELETE FROM users;')
    expect(w).toContain('delete all rows')
  })

  // ─── Infrastructure ───────────────────────────────────────────────
  test('detects kubectl delete', () => {
    const w = getDestructiveCommandWarning('kubectl delete pod my-pod')
    expect(w).toContain('delete Kubernetes')
  })

  test('detects terraform destroy', () => {
    const w = getDestructiveCommandWarning('terraform destroy')
    expect(w).toContain('destroy Terraform')
  })

  // ─── Safe commands ────────────────────────────────────────────────
  test('returns null for safe commands', () => {
    expect(getDestructiveCommandWarning('ls -la')).toBeNull()
    expect(getDestructiveCommandWarning('git status')).toBeNull()
    expect(getDestructiveCommandWarning('npm install')).toBeNull()
    expect(getDestructiveCommandWarning('cat file.txt')).toBeNull()
  })
})
