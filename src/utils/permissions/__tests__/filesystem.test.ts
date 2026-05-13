import { describe, expect, mock, test } from 'bun:test'
import { logMock } from '../../../../tests/mocks/log'

mock.module('src/utils/log.ts', logMock)

const { patternWithRoot } = await import('../filesystem')

describe('patternWithRoot', () => {
  // ── Linux / macOS ────────────────────────────────────────────

  describe('relative paths', () => {
    test('plain relative path → root=null', () => {
      const r = patternWithRoot('src/config.json', 'localSettings')
      expect(r.root).toBeNull()
      expect(r.relativePattern).toBe('src/config.json')
    })

    test('strips ./ prefix → root=null', () => {
      const r = patternWithRoot('./config.json', 'localSettings')
      expect(r.root).toBeNull()
      expect(r.relativePattern).toBe('config.json')
    })

    test('glob pattern → root=null', () => {
      const r = patternWithRoot('src/**/*.ts', 'localSettings')
      expect(r.root).toBeNull()
      expect(r.relativePattern).toBe('src/**/*.ts')
    })

    test('leading dotfile → root=null', () => {
      const r = patternWithRoot('.env', 'localSettings')
      expect(r.root).toBeNull()
      expect(r.relativePattern).toBe('.env')
    })
  })

  describe('home directory', () => {
    test('~/.config/app.json → homedir root', () => {
      const r = patternWithRoot('~/.config/app.json', 'localSettings')
      expect(r.root).not.toBeNull()
      expect(r.relativePattern).toBe('/.config/app.json')
    })

    test('~ only (no /) → falls to root=null', () => {
      const r = patternWithRoot('~', 'localSettings')
      expect(r.root).toBeNull()
      expect(r.relativePattern).toBe('~')
    })
  })

  describe('absolute paths', () => {
    test('/home/user/config.json', () => {
      const r = patternWithRoot('/home/user/config.json', 'localSettings')
      expect(r.root).not.toBeNull()
      expect(r.relativePattern).toBe('/home/user/config.json')
    })

    test('/etc/hosts', () => {
      const r = patternWithRoot('/etc/hosts', 'localSettings')
      expect(r.root).not.toBeNull()
      expect(r.relativePattern).toBe('/etc/hosts')
    })

    test('/tmp/output.log', () => {
      const r = patternWithRoot('/tmp/output.log', 'localSettings')
      expect(r.root).not.toBeNull()
      expect(r.relativePattern).toBe('/tmp/output.log')
    })

    test('/Users/shared/data.json (userSettings source)', () => {
      const r = patternWithRoot('/Users/shared/data.json', 'userSettings')
      expect(r.root).not.toBeNull()
      expect(r.relativePattern).toBe('/Users/shared/data.json')
    })
  })

  describe('// prefix (filesystem root)', () => {
    test('//etc/hosts → root=/, relative=/etc/hosts', () => {
      const r = patternWithRoot('//etc/hosts', 'localSettings')
      expect(r.root).not.toBeNull()
      expect(r.relativePattern).toBe('/etc/hosts')
    })

    test('//home/user/file.txt', () => {
      const r = patternWithRoot('//home/user/file.txt', 'localSettings')
      expect(r.root).not.toBeNull()
      expect(r.relativePattern).toBe('/home/user/file.txt')
    })
  })

  describe('/c/... NOT treated as Windows drive on Linux', () => {
    test('/c/Users/me/config.json → settings-root (no drive letter)', () => {
      const r = patternWithRoot('/c/Users/me/config.json', 'localSettings')
      expect(r.root).not.toBeNull()
      expect(r.root).not.toMatch(/^[A-Za-z]:/)
      expect(r.relativePattern).toBe('/c/Users/me/config.json')
    })
  })
})
