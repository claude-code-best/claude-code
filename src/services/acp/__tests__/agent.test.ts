import {
  describe,
  expect,
  test,
  mock,
  beforeEach,
  afterEach,
  afterAll,
  spyOn,
} from 'bun:test'

// ── Mock infrastructure ──────────────────────────────────────────
// bun:test mock.module is process-global: it leaks to sibling test files
// in the same worker. Preserve real exports before partial module mocking
// so afterAll can restore them, preventing cross-file pollution.

const _restores: (() => void)[] = []
const originalCwd = process.cwd()
const originalAcpPermissionMode = process.env.ACP_PERMISSION_MODE
const originalAcpAllowBypass =
  process.env.CLAUDE_CODE_ACP_ALLOW_BYPASS_PERMISSIONS

function mockModulePreservingExports(
  tsPath: string,
  overrides: Record<string, unknown>,
) {
  const jsPath = tsPath.replace(/\.ts$/, '.js')
  const snapshot = { ...(require(tsPath) as Record<string, unknown>) }
  mock.module(jsPath, () => ({ ...snapshot, ...overrides }))
  _restores.push(() => mock.module(jsPath, () => snapshot))
}

afterAll(() => {
  for (let i = _restores.length - 1; i >= 0; i--) {
    _restores[i]()
  }
  _restores.length = 0
  restoreEnv('ACP_PERMISSION_MODE', originalAcpPermissionMode)
  restoreEnv('CLAUDE_CODE_ACP_ALLOW_BYPASS_PERMISSIONS', originalAcpAllowBypass)
})

// ── Module mocks (must precede any import of the module under test) ──

const mockSetModel = mock(() => {})
const mockSubmitMessage = mock(async function* (_input: string) {})

mockModulePreservingExports('../../../QueryEngine.ts', {
  QueryEngine: class MockQueryEngine {
    submitMessage = mockSubmitMessage
    interrupt = mock(() => {})
    resetAbortController = mock(() => {})
    getAbortSignal = mock(() => new AbortController().signal)
    setModel = mockSetModel
  },
})

mockModulePreservingExports('../../../tools.ts', {
  getTools: mock(() => []),
})

mockModulePreservingExports('../../../Tool.ts', {
  toolMatchesName: mock(() => false),
  findToolByName: mock(() => undefined),
  filterToolProgressMessages: mock(() => []),
  buildTool: mock((def: any) => def),
})

mockModulePreservingExports('../../../utils/config.ts', {
  enableConfigs: mock(() => {}),
})

mockModulePreservingExports('../../../bootstrap/state.ts', {
  setOriginalCwd: mock(() => {}),
  addSlowOperation: mock(() => {}),
})

const mockGetDefaultAppState = mock(() => ({
  toolPermissionContext: {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: { user: [], project: [], local: [] },
    alwaysDenyRules: { user: [], project: [], local: [] },
    alwaysAskRules: { user: [], project: [], local: [] },
    isBypassPermissionsModeAvailable: true,
  },
  fastMode: false,
  settings: {},
  tasks: {},
  verbose: false,
  mainLoopModel: null,
  mainLoopModelForSession: null,
}))

mockModulePreservingExports('../../../state/AppStateStore.ts', {
  getDefaultAppState: mockGetDefaultAppState,
})

mockModulePreservingExports('../utils.ts', {
  computeSessionFingerprint: mock(() => '{}'),
  sanitizeTitle: mock((s: string) => s),
})

mockModulePreservingExports('../bridge.ts', {
  forwardSessionUpdates: mock(async () => ({
    stopReason: 'end_turn' as const,
  })),
  replayHistoryMessages: mock(async () => {}),
  toolInfoFromToolUse: mock(() => ({
    title: 'Test',
    kind: 'other',
    content: [],
    locations: [],
  })),
})

mockModulePreservingExports('../../../utils/listSessionsImpl.ts', {
  listSessionsImpl: mock(async () => []),
})

const mockGetMainLoopModel = mock(() => 'claude-sonnet-4-6')

mockModulePreservingExports('../../../utils/model/model.ts', {
  getMainLoopModel: mockGetMainLoopModel,
})

mockModulePreservingExports('../../../utils/model/modelOptions.ts', {
  getModelOptions: mock(() => []),
})

const mockApplySafeEnvVars = mock(() => {})
mockModulePreservingExports('../../../utils/managedEnv.ts', {
  applySafeConfigEnvironmentVariables: mockApplySafeEnvVars,
})

const mockGetSettings = mock(() => ({}))
mockModulePreservingExports('../../../utils/settings/settings.ts', {
  getSettings_DEPRECATED: mockGetSettings,
})

const mockDeserializeMessages = mock((msgs: unknown[]) => msgs)
mockModulePreservingExports('../../../utils/conversationRecovery.ts', {
  deserializeMessages: mockDeserializeMessages,
})

const mockGetLastSessionLog = mock(async () => null)
const mockSessionIdExists = mock(() => false)
mockModulePreservingExports('../../../utils/sessionStorage.ts', {
  getLastSessionLog: mockGetLastSessionLog,
  sessionIdExists: mockSessionIdExists,
})

const mockGetCommands = mock(async () => [
  {
    name: 'commit',
    description: 'Create a git commit',
    type: 'prompt',
    userInvocable: true,
    isHidden: false,
    argumentHint: '[message]',
  },
  {
    name: 'compact',
    description: 'Compact conversation',
    type: 'local',
    userInvocable: true,
    isHidden: false,
  },
  {
    name: 'hidden-skill',
    description: 'Hidden skill',
    type: 'prompt',
    userInvocable: false,
    isHidden: true,
  },
])

mockModulePreservingExports('../../../commands.ts', {
  getCommands: mockGetCommands,
})

// ── Import after mocks ────────────────────────────────────────────

const { AcpAgent } = await import('../agent.js')
const { forwardSessionUpdates } = await import('../bridge.js')

// ── Helpers ───────────────────────────────────────────────────────

function makeConn() {
  return {
    sessionUpdate: mock(async () => {}),
    requestPermission: mock(async () => ({
      outcome: { outcome: 'cancelled' },
    })),
  } as any
}

function removeBypassMode(session: any) {
  session.modes = {
    ...session.modes,
    availableModes: session.modes.availableModes.filter(
      (mode: any) => mode.id !== 'bypassPermissions',
    ),
  }
  session.appState.toolPermissionContext = {
    ...session.appState.toolPermissionContext,
    isBypassPermissionsModeAvailable: false,
  }
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

// ── Tests ─────────────────────────────────────────────────────────

describe('AcpAgent', () => {
  beforeEach(() => {
    delete process.env.ACP_PERMISSION_MODE
    delete process.env.CLAUDE_CODE_ACP_ALLOW_BYPASS_PERMISSIONS
    mockSetModel.mockClear()
    mockSubmitMessage.mockReset()
    mockSubmitMessage.mockImplementation(async function* (_input: string) {})
    mockGetMainLoopModel.mockClear()
    mockGetDefaultAppState.mockClear()
    mockGetSettings.mockReset()
    mockGetSettings.mockImplementation(() => ({}))
    ;(forwardSessionUpdates as ReturnType<typeof mock>).mockReset()
    ;(forwardSessionUpdates as ReturnType<typeof mock>).mockImplementation(
      async () => ({ stopReason: 'end_turn' as const }),
    )
  })

  afterEach(() => {
    process.chdir(originalCwd)
  })

  describe('initialize', () => {
    test('returns protocol version and agent info', async () => {
      const agent = new AcpAgent(makeConn())
      const res = await agent.initialize({} as any)
      expect(res.protocolVersion).toBeDefined()
      expect(res.agentInfo?.name).toBe('claude-code')
      expect(typeof res.agentInfo?.version).toBe('string')
    })

    test('advertises image and embeddedContext capability', async () => {
      const agent = new AcpAgent(makeConn())
      const res = await agent.initialize({} as any)
      expect(res.agentCapabilities?.promptCapabilities?.image).toBe(true)
      expect(res.agentCapabilities?.promptCapabilities?.embeddedContext).toBe(
        true,
      )
    })

    test('loadSession capability is true', async () => {
      const agent = new AcpAgent(makeConn())
      const res = await agent.initialize({} as any)
      expect(res.agentCapabilities?.loadSession).toBe(true)
    })

    test('session capabilities include fork, list, resume, close', async () => {
      const agent = new AcpAgent(makeConn())
      const res = await agent.initialize({} as any)
      expect(res.agentCapabilities?.sessionCapabilities).toBeDefined()
    })
  })

  describe('authenticate', () => {
    test('returns empty object (no auth required)', async () => {
      const agent = new AcpAgent(makeConn())
      const res = await agent.authenticate({} as any)
      expect(res).toEqual({})
    })
  })

  describe('newSession', () => {
    test('returns a sessionId string', async () => {
      const agent = new AcpAgent(makeConn())
      const res = await agent.newSession({ cwd: '/tmp' } as any)
      expect(typeof res.sessionId).toBe('string')
      expect(res.sessionId.length).toBeGreaterThan(0)
    })

    test('returns modes and models', async () => {
      const agent = new AcpAgent(makeConn())
      const res = await agent.newSession({ cwd: '/tmp' } as any)
      expect(res.modes).toBeDefined()
      expect(res.models).toBeDefined()
      expect(res.configOptions).toBeDefined()
    })

    test('each call returns a unique sessionId', async () => {
      const agent = new AcpAgent(makeConn())
      const r1 = await agent.newSession({ cwd: '/tmp' } as any)
      const r2 = await agent.newSession({ cwd: '/tmp' } as any)
      expect(r1.sessionId).not.toBe(r2.sessionId)
    })

    test('does not leave process cwd changed after session creation', async () => {
      const cwdBeforeSession = process.cwd()
      const agent = new AcpAgent(makeConn())
      await agent.newSession({ cwd: '/tmp' } as any)
      expect(process.cwd()).toBe(cwdBeforeSession)
    })

    test('calls getDefaultAppState to build session appState', async () => {
      const agent = new AcpAgent(makeConn())
      await agent.newSession({ cwd: '/tmp' } as any)
      expect(mockGetDefaultAppState).toHaveBeenCalled()
    })

    test('calls getMainLoopModel to resolve current model', async () => {
      const agent = new AcpAgent(makeConn())
      const res = await agent.newSession({ cwd: '/tmp' } as any)
      expect(mockGetMainLoopModel).toHaveBeenCalled()
      expect(res.models?.currentModelId).toBe('claude-sonnet-4-6')
    })

    test('calls queryEngine.setModel with resolved model', async () => {
      const agent = new AcpAgent(makeConn())
      await agent.newSession({ cwd: '/tmp' } as any)
      expect(mockSetModel).toHaveBeenCalledWith('claude-sonnet-4-6')
    })

    test('respects model alias resolution via getMainLoopModel', async () => {
      mockGetMainLoopModel.mockReturnValueOnce('glm-5.1')
      const agent = new AcpAgent(makeConn())
      const res = await agent.newSession({ cwd: '/tmp' } as any)
      expect(res.models?.currentModelId).toBe('glm-5.1')
      expect(mockSetModel).toHaveBeenCalledWith('glm-5.1')
    })

    test('stores clientCapabilities from initialize', async () => {
      const agent = new AcpAgent(makeConn())
      await agent.initialize({
        clientCapabilities: { _meta: { terminal_output: true } },
      } as any)
      const res = await agent.newSession({ cwd: '/tmp' } as any)
      expect(res.sessionId).toBeDefined()
    })

    test('uses settings permissions.defaultMode when _meta does not provide a mode', async () => {
      mockGetSettings.mockImplementationOnce(() => ({
        permissions: { defaultMode: 'acceptEdits' },
      }))
      const agent = new AcpAgent(makeConn())
      const res = await agent.newSession({ cwd: '/tmp' } as any)

      expect(res.modes?.currentModeId).toBe('acceptEdits')
    })

    test('uses _meta.permissionMode before settings permissions.defaultMode', async () => {
      mockGetSettings.mockImplementationOnce(() => ({
        permissions: { defaultMode: 'acceptEdits' },
      }))
      const agent = new AcpAgent(makeConn())
      const res = await agent.newSession({
        cwd: '/tmp',
        _meta: { permissionMode: 'plan' },
      } as any)

      expect(res.modes?.currentModeId).toBe('plan')
    })

    test('rejects _meta.permissionMode bypass without a local ACP bypass gate', async () => {
      mockGetSettings.mockImplementationOnce(() => ({
        permissions: { defaultMode: 'acceptEdits' },
      }))
      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(
        () => {},
      )
      const agent = new AcpAgent(makeConn())
      try {
        await expect(
          agent.newSession({
            cwd: '/tmp',
            _meta: { permissionMode: 'bypassPermissions' },
          } as any),
        ).rejects.toThrow('Mode not available: bypassPermissions')

        expect(consoleErrorSpy).not.toHaveBeenCalled()
      } finally {
        consoleErrorSpy.mockRestore()
      }
    })

    test('honors _meta.permissionMode bypass with a local ACP bypass gate', async () => {
      process.env.CLAUDE_CODE_ACP_ALLOW_BYPASS_PERMISSIONS = '1'
      const agent = new AcpAgent(makeConn())
      const res = await agent.newSession({
        cwd: '/tmp',
        _meta: { permissionMode: 'bypassPermissions' },
      } as any)

      expect(res.modes?.currentModeId).toBe('bypassPermissions')
      expect(res.modes?.availableModes.map((mode: any) => mode.id)).toContain(
        'bypassPermissions',
      )
    })

    test('falls back to default when settings permissions.defaultMode is invalid', async () => {
      mockGetSettings.mockImplementationOnce(() => ({
        permissions: { defaultMode: 'invalid-mode' },
      }))
      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(
        () => {},
      )
      const agent = new AcpAgent(makeConn())
      try {
        const res = await agent.newSession({ cwd: '/tmp' } as any)

        expect(res.modes?.currentModeId).toBe('default')
        expect(consoleErrorSpy).toHaveBeenCalled()
      } finally {
        consoleErrorSpy.mockRestore()
      }
    })

    test('rejects invalid _meta.permissionMode without falling back to settings', async () => {
      mockGetSettings.mockImplementationOnce(() => ({
        permissions: { defaultMode: 'acceptEdits' },
      }))
      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(
        () => {},
      )
      const agent = new AcpAgent(makeConn())
      try {
        await expect(
          agent.newSession({
            cwd: '/tmp',
            _meta: { permissionMode: 'invalid-mode' },
          } as any),
        ).rejects.toThrow('Invalid _meta.permissionMode: invalid-mode')

        expect(consoleErrorSpy).not.toHaveBeenCalled()
      } finally {
        consoleErrorSpy.mockRestore()
      }
    })
  })

  describe('prompt', () => {
    test('throws when session not found', async () => {
      const agent = new AcpAgent(makeConn())
      await expect(
        agent.prompt({ sessionId: 'nonexistent', prompt: [] } as any),
      ).rejects.toThrow('nonexistent')
    })

    test('returns end_turn for empty prompt text', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      const res = await agent.prompt({ sessionId, prompt: [] } as any)
      expect(res.stopReason).toBe('end_turn')
    })

    test('returns end_turn for whitespace-only prompt', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      const res = await agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: '   ' }],
      } as any)
      expect(res.stopReason).toBe('end_turn')
    })

    test('calls forwardSessionUpdates for valid prompt', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      ;(forwardSessionUpdates as ReturnType<typeof mock>).mockResolvedValueOnce(
        { stopReason: 'end_turn' },
      )
      const res = await agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'hello' }],
      } as any)
      expect(res.stopReason).toBe('end_turn')
    })

    test('cancel before prompt does not block next prompt', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      await agent.cancel({ sessionId } as any)
      ;(forwardSessionUpdates as ReturnType<typeof mock>).mockResolvedValueOnce(
        { stopReason: 'end_turn' },
      )
      const res = await agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'hello' }],
      } as any)
      expect(res.stopReason).toBe('end_turn')
    })

    test('cancel during prompt returns cancelled', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      let resolveStream!: () => void
      ;(
        forwardSessionUpdates as ReturnType<typeof mock>
      ).mockImplementationOnce(
        () =>
          new Promise<{ stopReason: string }>(resolve => {
            resolveStream = () => resolve({ stopReason: 'cancelled' })
          }),
      )
      const promptPromise = agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'hello' }],
      } as any)
      await agent.cancel({ sessionId } as any)
      resolveStream()
      const res = await promptPromise
      expect(res.stopReason).toBe('cancelled')

      ;(forwardSessionUpdates as ReturnType<typeof mock>).mockResolvedValueOnce(
        { stopReason: 'end_turn' },
      )
      const res2 = await agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'world' }],
      } as any)
      expect(res2.stopReason).toBe('end_turn')
    })

    test('propagates unexpected prompt errors', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      ;(
        forwardSessionUpdates as ReturnType<typeof mock>
      ).mockImplementationOnce(async () => {
        throw new Error('unexpected')
      })

      await expect(
        agent.prompt({
          sessionId,
          prompt: [{ type: 'text', text: 'hello' }],
        } as any),
      ).rejects.toThrow('unexpected')
    })

    test('returns usage from forwardSessionUpdates', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      ;(forwardSessionUpdates as ReturnType<typeof mock>).mockResolvedValueOnce(
        {
          stopReason: 'end_turn',
          usage: {
            inputTokens: 100,
            outputTokens: 50,
            cachedReadTokens: 10,
            cachedWriteTokens: 5,
          },
        },
      )
      const res = await agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'hello' }],
      } as any)
      expect(res.usage).toBeDefined()
      expect(res.usage!.inputTokens).toBe(100)
      expect(res.usage!.outputTokens).toBe(50)
      expect(res.usage!.totalTokens).toBe(165)
    })
  })

  describe('cancel', () => {
    test('does not throw for unknown session', async () => {
      const agent = new AcpAgent(makeConn())
      await expect(
        agent.cancel({ sessionId: 'ghost' } as any),
      ).resolves.toBeUndefined()
    })
  })

  describe('closeSession', () => {
    test('throws for unknown session', async () => {
      const agent = new AcpAgent(makeConn())
      await expect(
        agent.unstable_closeSession({ sessionId: 'ghost' } as any),
      ).rejects.toThrow('Session not found')
    })

    test('removes session after close', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      await agent.unstable_closeSession({ sessionId } as any)
      expect(agent.sessions.has(sessionId)).toBe(false)
    })
  })

  describe('setSessionModel', () => {
    test('updates model on queryEngine', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      mockSetModel.mockClear()
      await agent.unstable_setSessionModel({
        sessionId,
        modelId: 'glm-5.1',
      } as any)
      expect(mockSetModel).toHaveBeenCalledWith('glm-5.1')
    })

    test('passes alias modelId to queryEngine as-is for later resolution', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      mockSetModel.mockClear()
      await agent.unstable_setSessionModel({
        sessionId,
        modelId: 'sonnet[1m]',
      } as any)
      expect(mockSetModel).toHaveBeenCalledWith('sonnet[1m]')
    })
  })

  describe('entry.ts initialization contract', () => {
    test('entry.ts imports applySafeConfigEnvironmentVariables from managedEnv', async () => {
      const entrySource = await Bun.file(
        new URL('../entry.ts', import.meta.url),
      ).text()
      expect(entrySource).toContain('applySafeConfigEnvironmentVariables')
      expect(entrySource).toContain('enableConfigs')

      const enableIdx = entrySource.indexOf('enableConfigs()')
      const applyIdx = entrySource.indexOf(
        'applySafeConfigEnvironmentVariables()',
      )
      expect(enableIdx).toBeGreaterThan(-1)
      expect(applyIdx).toBeGreaterThan(-1)
      expect(enableIdx).toBeLessThan(applyIdx)
    })
  })

  describe('prompt usage tracking', () => {
    test('returns totalTokens as sum of all token types', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      ;(forwardSessionUpdates as ReturnType<typeof mock>).mockResolvedValueOnce(
        {
          stopReason: 'end_turn',
          usage: {
            inputTokens: 100,
            outputTokens: 50,
            cachedReadTokens: 10,
            cachedWriteTokens: 5,
          },
        },
      )
      const res = await agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'hello' }],
      } as any)
      expect(res.usage).toBeDefined()
      expect(res.usage!.totalTokens).toBe(165)
    })

    test('returns undefined usage when forwardSessionUpdates returns none', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      ;(forwardSessionUpdates as ReturnType<typeof mock>).mockResolvedValueOnce(
        {
          stopReason: 'end_turn',
        },
      )
      const res = await agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'hello' }],
      } as any)
      expect(res.usage).toBeUndefined()
    })
  })

  describe('prompt error handling', () => {
    test('returns cancelled when session was cancelled during prompt', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      ;(
        forwardSessionUpdates as ReturnType<typeof mock>
      ).mockImplementationOnce(async () => {
        const session = agent.sessions.get(sessionId)
        if (session) session.cancelled = true
        return { stopReason: 'end_turn' }
      })
      const res = await agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'hello' }],
      } as any)
      expect(res.stopReason).toBe('cancelled')
    })

    test('returns cancelled on cancel after error', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      ;(
        forwardSessionUpdates as ReturnType<typeof mock>
      ).mockImplementationOnce(async () => {
        const session = agent.sessions.get(sessionId)
        if (session) session.cancelled = true
        throw new Error('unexpected')
      })
      const res = await agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'hello' }],
      } as any)
      expect(res.stopReason).toBe('cancelled')
    })
  })

  describe('resumeSession', () => {
    test('creates new session with the requested sessionId when not in memory', async () => {
      const agent = new AcpAgent(makeConn())
      const requestedId = 'e73e9b66-9637-4477-b512-af45357b1dcb'
      const res = await agent.unstable_resumeSession({
        sessionId: requestedId,
        cwd: '/tmp',
        mcpServers: [],
      } as any)
      expect(agent.sessions.has(requestedId)).toBe(true)
      expect(res.modes).toBeDefined()
      expect(res.models).toBeDefined()
    })

    test('reuses existing session when sessionId matches and fingerprint unchanged', async () => {
      const agent = new AcpAgent(makeConn())
      const res1 = await agent.newSession({ cwd: '/tmp' } as any)
      const sid = res1.sessionId
      const originalSession = agent.sessions.get(sid)
      const res2 = await agent.unstable_resumeSession({
        sessionId: sid,
        cwd: '/tmp',
        mcpServers: [],
      } as any)
      expect(agent.sessions.get(sid)).toBe(originalSession)
    })

    test('can prompt after resumeSession with previously unknown sessionId', async () => {
      const agent = new AcpAgent(makeConn())
      const sid = 'restored-session-id-1234'
      await agent.unstable_resumeSession({
        sessionId: sid,
        cwd: '/tmp',
        mcpServers: [],
      } as any)
      ;(forwardSessionUpdates as ReturnType<typeof mock>).mockResolvedValueOnce(
        { stopReason: 'end_turn' },
      )
      const res = await agent.prompt({
        sessionId: sid,
        prompt: [{ type: 'text', text: 'hello after restore' }],
      } as any)
      expect(res.stopReason).toBe('end_turn')
    })
  })

  describe('loadSession', () => {
    test('creates new session with the requested sessionId', async () => {
      const agent = new AcpAgent(makeConn())
      const requestedId = 'aaaa-bbbb-cccc'
      await agent.loadSession({
        sessionId: requestedId,
        cwd: '/tmp',
        mcpServers: [],
      } as any)
      expect(agent.sessions.has(requestedId)).toBe(true)
    })

    test('can prompt after loadSession', async () => {
      const agent = new AcpAgent(makeConn())
      const sid = 'loaded-session-id'
      await agent.loadSession({
        sessionId: sid,
        cwd: '/tmp',
        mcpServers: [],
      } as any)
      ;(forwardSessionUpdates as ReturnType<typeof mock>).mockResolvedValueOnce(
        { stopReason: 'end_turn' },
      )
      const res = await agent.prompt({
        sessionId: sid,
        prompt: [{ type: 'text', text: 'hello after load' }],
      } as any)
      expect(res.stopReason).toBe('end_turn')
    })
  })

  describe('forkSession', () => {
    test('returns a different sessionId from any existing', async () => {
      const agent = new AcpAgent(makeConn())
      const original = await agent.newSession({ cwd: '/tmp' } as any)
      const forked = await agent.unstable_forkSession({
        cwd: '/tmp',
        mcpServers: [],
      } as any)
      expect(forked.sessionId).not.toBe(original.sessionId)
      expect(agent.sessions.has(forked.sessionId)).toBe(true)
    })
  })

  describe('setSessionMode', () => {
    test('updates current mode on the session', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      await agent.setSessionMode({ sessionId, modeId: 'auto' } as any)
      const session = agent.sessions.get(sessionId)
      expect(session?.modes.currentModeId).toBe('auto')
    })

    test('throws for invalid mode', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      await expect(
        agent.setSessionMode({ sessionId, modeId: 'invalid_mode' } as any),
      ).rejects.toThrow('Invalid mode')
    })

    test('throws for unknown session', async () => {
      const agent = new AcpAgent(makeConn())
      await expect(
        agent.setSessionMode({ sessionId: 'ghost', modeId: 'auto' } as any),
      ).rejects.toThrow('Session not found')
    })

    test('availableModes excludes bypassPermissions without a local ACP bypass gate', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      const session = agent.sessions.get(sessionId)
      const modeIds = session?.modes.availableModes.map((m: any) => m.id)
      expect(modeIds).not.toContain('bypassPermissions')
    })

    test('rejects bypassPermissions without a local ACP bypass gate', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      await expect(
        agent.setSessionMode({ sessionId, modeId: 'bypassPermissions' } as any),
      ).rejects.toThrow('Mode not available')

      const session = agent.sessions.get(sessionId)
      expect(session?.modes.currentModeId).toBe('default')
      expect(session?.appState.toolPermissionContext.mode).toBe('default')
    })

    test('can switch to bypassPermissions mode with a local ACP bypass gate', async () => {
      process.env.CLAUDE_CODE_ACP_ALLOW_BYPASS_PERMISSIONS = '1'
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      await agent.setSessionMode({
        sessionId,
        modeId: 'bypassPermissions',
      } as any)
      const session = agent.sessions.get(sessionId)
      expect(session?.modes.currentModeId).toBe('bypassPermissions')
      expect(session?.appState.toolPermissionContext.mode).toBe(
        'bypassPermissions',
      )
    })

    test('rejects bypassPermissions when the session does not expose it', async () => {
      process.env.CLAUDE_CODE_ACP_ALLOW_BYPASS_PERMISSIONS = '1'
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      const session = agent.sessions.get(sessionId)
      removeBypassMode(session)

      await expect(
        agent.setSessionMode({ sessionId, modeId: 'bypassPermissions' } as any),
      ).rejects.toThrow('Mode not available')

      expect(session?.modes.currentModeId).toBe('default')
      expect(session?.appState.toolPermissionContext.mode).toBe('default')
    })
  })

  describe('setSessionConfigOption', () => {
    test('throws for unknown config option', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      await expect(
        agent.setSessionConfigOption({
          sessionId,
          configId: 'nonexistent',
          value: 'x',
        } as any),
      ).rejects.toThrow('Unknown config option')
    })

    test('throws for non-string value', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      await expect(
        agent.setSessionConfigOption({
          sessionId,
          configId: 'mode',
          value: 42,
        } as any),
      ).rejects.toThrow('Invalid value')
    })

    test('rejects unavailable mode config values', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      const session = agent.sessions.get(sessionId)
      removeBypassMode(session)

      await expect(
        agent.setSessionConfigOption({
          sessionId,
          configId: 'mode',
          value: 'bypassPermissions',
        } as any),
      ).rejects.toThrow('Mode not available')

      expect(session?.modes.currentModeId).toBe('default')
      expect(session?.appState.toolPermissionContext.mode).toBe('default')
    })
  })

  describe('prompt queueing', () => {
    test('queued prompts execute in order after current prompt finishes', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)

      let resolveFirst!: () => void
      ;(
        forwardSessionUpdates as ReturnType<typeof mock>
      ).mockImplementationOnce(
        () =>
          new Promise<{ stopReason: string }>(resolve => {
            resolveFirst = () => resolve({ stopReason: 'end_turn' })
          }),
      )
      ;(forwardSessionUpdates as ReturnType<typeof mock>).mockResolvedValueOnce(
        { stopReason: 'end_turn' },
      )

      const p1 = agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'first' }],
      } as any)
      const p2 = agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'second' }],
      } as any)

      resolveFirst()
      const [r1, r2] = await Promise.all([p1, p2])
      expect(r1.stopReason).toBe('end_turn')
      expect(r2.stopReason).toBe('end_turn')
    })

    test('drains 1000 queued prompts in FIFO order without sorting the pending map', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)

      let resolveFirst!: () => void
      ;(
        forwardSessionUpdates as ReturnType<typeof mock>
      ).mockImplementationOnce(
        () =>
          new Promise<{ stopReason: string }>(resolve => {
            resolveFirst = () => resolve({ stopReason: 'end_turn' })
          }),
      )

      const first = agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'first' }],
      } as any)
      const queued = Array.from({ length: 1000 }, (_, index) =>
        agent.prompt({
          sessionId,
          prompt: [{ type: 'text', text: `queued-${index}` }],
        } as any),
      )

      resolveFirst()
      const results = await Promise.all([first, ...queued])

      expect(results.every(result => result.stopReason === 'end_turn')).toBe(
        true,
      )
      expect(mockSubmitMessage.mock.calls.map(call => call[0])).toEqual([
        'first',
        ...Array.from({ length: 1000 }, (_, index) => `queued-${index}`),
      ])
    })

    test('keeps promptRunning true while handing off to the next queued prompt', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)

      let resolveFirst!: () => void
      let resolveSecond!: () => void
      ;(
        forwardSessionUpdates as ReturnType<typeof mock>
      ).mockImplementationOnce(
        () =>
          new Promise<{ stopReason: string }>(resolve => {
            resolveFirst = () => resolve({ stopReason: 'end_turn' })
          }),
      )
      ;(
        forwardSessionUpdates as ReturnType<typeof mock>
      ).mockImplementationOnce(
        () =>
          new Promise<{ stopReason: string }>(resolve => {
            resolveSecond = () => resolve({ stopReason: 'end_turn' })
          }),
      )

      const p1 = agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'first' }],
      } as any)
      const p2 = agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'second' }],
      } as any)

      const p3 = p1.then(() =>
        agent.prompt({
          sessionId,
          prompt: [{ type: 'text', text: 'third' }],
        } as any),
      )

      resolveFirst()
      await p1
      const session = agent.sessions.get(sessionId)
      expect(session?.promptRunning).toBe(true)
      expect(mockSubmitMessage.mock.calls.map(call => call[0])).toEqual([
        'first',
        'second',
      ])

      resolveSecond()
      await Promise.all([p2, p3])
      expect(mockSubmitMessage.mock.calls.map(call => call[0])).toEqual([
        'first',
        'second',
        'third',
      ])
    })

    test('queued prompts return cancelled when session is cancelled', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)

      let resolveFirst!: () => void
      ;(
        forwardSessionUpdates as ReturnType<typeof mock>
      ).mockImplementationOnce(
        () =>
          new Promise<{ stopReason: string }>(resolve => {
            resolveFirst = () => resolve({ stopReason: 'end_turn' })
          }),
      )

      const p1 = agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'first' }],
      } as any)
      const p2 = agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'second' }],
      } as any)

      await agent.cancel({ sessionId } as any)
      resolveFirst()
      const [r1, r2] = await Promise.all([p1, p2])
      expect(r1.stopReason).toBe('cancelled')
      expect(r2.stopReason).toBe('cancelled')
    })

    test('queued prompt does not clear active prompt cancellation', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)

      let resolveFirst!: () => void
      ;(
        forwardSessionUpdates as ReturnType<typeof mock>
      ).mockImplementationOnce(
        () =>
          new Promise<{ stopReason: string }>(resolve => {
            resolveFirst = () => resolve({ stopReason: 'end_turn' })
          }),
      )
      ;(forwardSessionUpdates as ReturnType<typeof mock>).mockResolvedValueOnce(
        { stopReason: 'end_turn' },
      )

      const p1 = agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'first' }],
      } as any)

      await agent.cancel({ sessionId } as any)

      const p2 = agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'second' }],
      } as any)

      resolveFirst()

      const [r1, r2] = await Promise.all([p1, p2])
      expect(r1.stopReason).toBe('cancelled')
      expect(r2.stopReason).toBe('end_turn')
      expect(mockSubmitMessage.mock.calls.map(call => call[0])).toEqual([
        'first',
        'second',
      ])
    })
  })

  describe('commands', () => {
    test('sends filtered prompt-type commands to client', async () => {
      const conn = makeConn()
      const agent = new AcpAgent(conn)
      await agent.newSession({ cwd: '/tmp' } as any)

      await new Promise(r => setTimeout(r, 10))

      const calls = (conn.sessionUpdate as ReturnType<typeof mock>).mock.calls
      const cmdUpdate = calls.find((c: any[]) => {
        const update = c[0]?.update
        return update?.sessionUpdate === 'available_commands_update'
      })
      expect(cmdUpdate).toBeDefined()

      const cmds = (cmdUpdate as any[])[0].update.availableCommands
      const names = cmds.map((c: any) => c.name)
      expect(names).toContain('commit')
      expect(names).not.toContain('compact')
      expect(names).not.toContain('hidden-skill')
    })

    test('maps argumentHint to input.hint', async () => {
      const conn = makeConn()
      const agent = new AcpAgent(conn)
      await agent.newSession({ cwd: '/tmp' } as any)

      await new Promise(r => setTimeout(r, 10))

      const calls = (conn.sessionUpdate as ReturnType<typeof mock>).mock.calls
      const cmdUpdate = calls.find((c: any[]) => {
        const update = c[0]?.update
        return update?.sessionUpdate === 'available_commands_update'
      })
      const commit = (cmdUpdate as any[])[0].update.availableCommands.find(
        (c: any) => c.name === 'commit',
      )
      expect(commit.input).toEqual({ hint: '[message]' })
    })
  })
})
