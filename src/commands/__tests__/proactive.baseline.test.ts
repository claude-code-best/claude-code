import { beforeEach, describe, expect, test } from 'bun:test'
import proactiveCommand from '../proactive'
import {
  activateProactive,
  deactivateProactive,
  isProactiveActive,
} from '../../proactive/index'

beforeEach(() => {
  deactivateProactive()
})

describe('/proactive baseline', () => {
  test('invoking the command enables proactive mode and emits a system reminder', async () => {
    const mod = await proactiveCommand.load()
    let resultText: string | undefined
    let options: Parameters<Parameters<typeof mod.call>[0]>[1] | undefined

    await mod.call((result, opts) => {
      resultText = result
      options = opts
    }, {} as any)

    expect(isProactiveActive()).toBe(true)
    expect(resultText).toContain('Proactive mode enabled')
    expect(options?.display).toBe('system')
    expect(options?.metaMessages?.[0]).toContain(
      'Proactive mode is now enabled',
    )
  })

  test('invoking the command again disables proactive mode', async () => {
    const mod = await proactiveCommand.load()
    activateProactive('test')

    let resultText: string | undefined
    let options: Parameters<Parameters<typeof mod.call>[0]>[1] | undefined

    await mod.call((result, opts) => {
      resultText = result
      options = opts
    }, {} as any)

    expect(isProactiveActive()).toBe(false)
    expect(resultText).toBe('Proactive mode disabled')
    expect(options?.display).toBe('system')
  })
})
