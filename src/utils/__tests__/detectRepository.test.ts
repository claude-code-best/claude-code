import { describe, expect, test } from 'bun:test'
import { parseGitRemote, parseGitHubRepository } from '../detectRepository'

describe('parseGitRemote', () => {
  // HTTPS
  test('parses HTTPS URL: https://github.com/owner/repo.git', () => {
    const result = parseGitRemote('https://github.com/owner/repo.git')
    expect(result).toEqual({ host: 'github.com', owner: 'owner', name: 'repo' })
  })

  test('parses HTTPS URL without .git suffix', () => {
    const result = parseGitRemote('https://github.com/owner/repo')
    expect(result).toEqual({ host: 'github.com', owner: 'owner', name: 'repo' })
  })

  test('parses HTTPS URL with subdirectory path (only takes first 2 segments)', () => {
    const result = parseGitRemote('https://github.com/owner/repo.git')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('repo')
  })

  // SSH
  test('parses SSH URL: git@github.com:owner/repo.git', () => {
    const result = parseGitRemote('git@github.com:owner/repo.git')
    expect(result).toEqual({ host: 'github.com', owner: 'owner', name: 'repo' })
  })

  test('parses SSH URL without .git suffix', () => {
    const result = parseGitRemote('git@github.com:owner/repo')
    expect(result).toEqual({ host: 'github.com', owner: 'owner', name: 'repo' })
  })

  // ssh://
  test('parses ssh:// URL: ssh://git@github.com/owner/repo.git', () => {
    const result = parseGitRemote('ssh://git@github.com/owner/repo.git')
    expect(result).toEqual({ host: 'github.com', owner: 'owner', name: 'repo' })
  })

  // git://
  test('parses git:// URL', () => {
    const result = parseGitRemote('git://github.com/owner/repo.git')
    expect(result).toEqual({ host: 'github.com', owner: 'owner', name: 'repo' })
  })

  // Boundary
  test('returns null for invalid URL', () => {
    expect(parseGitRemote('not-a-url')).toBeNull()
  })

  test('returns null for empty string', () => {
    expect(parseGitRemote('')).toBeNull()
  })

  test('handles GHE hostname', () => {
    const result = parseGitRemote('https://ghe.corp.com/team/project.git')
    expect(result).toEqual({
      host: 'ghe.corp.com',
      owner: 'team',
      name: 'project',
    })
  })

  test('handles port number in URL', () => {
    const result = parseGitRemote('https://github.com:443/owner/repo.git')
    expect(result).not.toBeNull()
    expect(result!.owner).toBe('owner')
    expect(result!.name).toBe('repo')
  })

  test('rejects SSH config alias without real hostname', () => {
    expect(parseGitRemote('git@github.com-work:owner/repo.git')).toBeNull()
  })

  test('handles repo names with dots', () => {
    const result = parseGitRemote('https://github.com/owner/cc.kurs.web.git')
    expect(result).toEqual({
      host: 'github.com',
      owner: 'owner',
      name: 'cc.kurs.web',
    })
  })
})

describe('parseGitHubRepository', () => {
  test("extracts 'owner/repo' from valid remote URL", () => {
    expect(parseGitHubRepository('https://github.com/owner/repo.git')).toBe(
      'owner/repo',
    )
  })

  test("handles plain 'owner/repo' string input", () => {
    expect(parseGitHubRepository('owner/repo')).toBe('owner/repo')
  })

  test('returns null for non-GitHub host', () => {
    expect(
      parseGitHubRepository('https://gitlab.com/owner/repo.git'),
    ).toBeNull()
  })

  test('returns null for invalid input', () => {
    expect(parseGitHubRepository('not-valid')).toBeNull()
  })

  test('is case-sensitive for owner/repo', () => {
    expect(parseGitHubRepository('Owner/Repo')).toBe('Owner/Repo')
  })

  test('handles SSH format for github.com', () => {
    expect(parseGitHubRepository('git@github.com:owner/repo.git')).toBe(
      'owner/repo',
    )
  })

  test('returns null for GHE SSH URL', () => {
    expect(parseGitHubRepository('git@ghe.corp.com:owner/repo.git')).toBeNull()
  })

  test('handles plain owner/repo with .git suffix', () => {
    expect(parseGitHubRepository('owner/repo.git')).toBe('owner/repo')
  })
})
