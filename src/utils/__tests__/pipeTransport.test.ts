import { describe, expect, test } from 'bun:test'
import {
  getPipeDisplayRole,
  isPipeControlled,
  type PipeIpcState,
} from '../pipeTransport.js'

function makePipeState(overrides: Partial<PipeIpcState> = {}): PipeIpcState {
  return {
    role: 'main',
    subIndex: null,
    displayRole: 'main',
    serverName: 'cli-main',
    attachedBy: null,
    localIp: null,
    hostname: null,
    machineId: null,
    mac: null,
    statusVisible: false,
    selectorOpen: false,
    selectedPipes: [],
    routeMode: 'selected',
    slaves: {},
    discoveredPipes: [],
    ...overrides,
  }
}

describe('pipe transport role helpers', () => {
  test('keeps controlled subs on their sub-N display role', () => {
    const state = makePipeState({
      role: 'sub',
      subIndex: 2,
      displayRole: 'slave',
      attachedBy: 'cli-master',
    })

    expect(isPipeControlled(state)).toBe(true)
    expect(getPipeDisplayRole(state)).toBe('sub-2')
  })

  test('preserves master and main display roles', () => {
    expect(getPipeDisplayRole(makePipeState())).toBe('main')
    expect(
      getPipeDisplayRole(
        makePipeState({
          role: 'master',
          displayRole: 'main',
        }),
      ),
    ).toBe('master')
  })
})
