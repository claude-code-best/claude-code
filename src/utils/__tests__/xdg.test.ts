import { describe, expect, test } from 'bun:test'
import {
  getXDGStateHome,
  getXDGCacheHome,
  getXDGDataHome,
  getUserBinDir,
} from '../xdg'

describe('getXDGStateHome', () => {
  test('returns ~/.local/state by default', () => {
    const result = getXDGStateHome({ homedir: '/home/user' })
    expect(result).toBe('/home/user/.local/state')
  })

  test('respects XDG_STATE_HOME env var', () => {
    const result = getXDGStateHome({
      homedir: '/home/user',
      env: { XDG_STATE_HOME: '/custom/state' },
    })
    expect(result).toBe('/custom/state')
  })

  test('uses custom homedir from options', () => {
    const result = getXDGStateHome({ homedir: '/opt/home' })
    expect(result).toBe('/opt/home/.local/state')
  })
})

describe('getXDGCacheHome', () => {
  test('returns ~/.cache by default', () => {
    const result = getXDGCacheHome({ homedir: '/home/user' })
    expect(result).toBe('/home/user/.cache')
  })

  test('respects XDG_CACHE_HOME env var', () => {
    const result = getXDGCacheHome({
      homedir: '/home/user',
      env: { XDG_CACHE_HOME: '/tmp/cache' },
    })
    expect(result).toBe('/tmp/cache')
  })
})

describe('getXDGDataHome', () => {
  test('returns ~/.local/share by default', () => {
    const result = getXDGDataHome({ homedir: '/home/user' })
    expect(result).toBe('/home/user/.local/share')
  })

  test('respects XDG_DATA_HOME env var', () => {
    const result = getXDGDataHome({
      homedir: '/home/user',
      env: { XDG_DATA_HOME: '/custom/data' },
    })
    expect(result).toBe('/custom/data')
  })
})

describe('getUserBinDir', () => {
  test('returns ~/.local/bin', () => {
    const result = getUserBinDir({ homedir: '/home/user' })
    expect(result).toBe('/home/user/.local/bin')
  })

  test('uses custom homedir from options', () => {
    const result = getUserBinDir({ homedir: '/opt/me' })
    expect(result).toBe('/opt/me/.local/bin')
  })
})

describe('path construction', () => {
  test('all paths end with correct subdirectory', () => {
    const home = '/home/test'
    expect(getXDGStateHome({ homedir: home })).toMatch(/\.local\/state$/)
    expect(getXDGCacheHome({ homedir: home })).toMatch(/\.cache$/)
    expect(getXDGDataHome({ homedir: home })).toMatch(/\.local\/share$/)
    expect(getUserBinDir({ homedir: home })).toMatch(/\.local\/bin$/)
  })

  test('respects HOME via homedir override', () => {
    const result = getXDGStateHome({ homedir: '/Users/me' })
    expect(result).toBe('/Users/me/.local/state')
  })
})
