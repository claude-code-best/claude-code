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

const mockSwitchSession = mock(() => {})

const mockGetOriginalCwd = mock(() => '/current/working/dir')
mockModulePreservingExports('../../../bootstrap/state.ts', {
  setOriginalCwd: mock(() => {}),
  switchSession: mockSwitchSession,
  addSlowOperation: mock(() => {}),
  getOriginalCwd: mockGetOriginalCwd,
  getSessionProjectDir: mock(() => null),
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

const mockListSessionsImpl = mock(async () => [])
mockModulePreservingExports('../../../utils/listSessionsImpl.ts', {
  listSessionsImpl: mockListSessionsImpl,
})

const mockResolveSessionFilePath = mock(async () => ({
  filePath: '/fake/project/dir/session.jsonl',
  projectPath: '/tmp',
  fileSize: 100,
}))
mockModulePreservingExports('../../../utils/sessionStoragePortable.js', {
  resolveSessionFilePath: mockResolveSessionFilePath,
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
    mockSwitchSession.mockClear()
    mockSubmitMessage.mockReset()
    mockSubmitMessage.mockImplementation(async function* (_input: string) {})
    mockGetMainLoopModel.mockClear()
    mockGetDefaultAppState.mockClear()
    mockGetSettings.mockReset()
    mockGetSettings.mockImplementation(() => ({}))
    mockListSessionsImpl.mockReset()
    mockListSessionsImpl.mockImplementation(async () => [])
    mockGetOriginalCwd.mockReset()
    mockGetOriginalCwd.mockImplementation(() => '/current/working/dir')
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

    test('advertises embeddedContext capability and disables image until multimodal input lands', async () => {
      const agent = new AcpAgent(makeConn())
      const res = await agent.initialize({} as any)
      // image:false — promptToQueryInput does not parse image blocks yet
      expect(res.agentCapabilities?.promptCapabilities?.image).toBe(false)
      expect(res.agentCapabilities?.promptCapabilities?.embeddedContext).toBe(
        true,
      )
    })

    test('returns explicit empty authMethods', async () => {
      const agent = new AcpAgent(makeConn())
      const res = await agent.initialize({} as any)
      expect(res.authMethods).toEqual([])
    })

    test('loadSession capability is true', async () => {
      const agent = new AcpAgent(makeConn())
      const res = await agent.initialize({} as any)
      expect(res.agentCapabilities?.loadSession).toBe(true)
    })

    test('session capabilities include list, resume, close (fork advertised via _meta)', async () => {
      const agent = new AcpAgent(makeConn())
      const res = await agent.initialize({} as any)
      const caps = res.agentCapabilities?.sessionCapabilities as any
      expect(caps).toBeDefined()
      expect(caps.list).toBeDefined()
      expect(caps.resume).toBeDefined()
      expect(caps.close).toBeDefined()
      // fork is UNSTABLE — advertised under _meta.claudeCode.forkSession, not
      // under sessionCapabilities (which is stable-v1 only).
      expect(caps.fork).toBeUndefined()
      expect(
        (res.agentCapabilities?._meta as any)?.claudeCode?.forkSession,
      ).toBe(true)
    })

    test('advertises session/delete capability per session-delete RFD', async () => {
      // UNSTABLE per session-delete.mdx: capability-gated session/delete.
      // SDK 0.19.0's SessionCapabilities type predates this field; we advertise
      // it via type augmentation so clients implementing the RFD can find it.
      const agent = new AcpAgent(makeConn())
      const res = await agent.initialize({} as any)
      const caps = res.agentCapabilities?.sessionCapabilities as any
      expect(caps.delete).toEqual({})
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

    test('returns modes, configOptions, and models (clients need models to populate selector)', async () => {
      const agent = new AcpAgent(makeConn())
      const res = await agent.newSession({ cwd: '/tmp' } as any)
      expect(res.modes).toBeDefined()
      expect(res.configOptions).toBeDefined()
      // SDK 0.19.2 marks NewSessionResponse.models as UNSTABLE but the schema allows it, and
      // standard clients (Cursor/Zed/VS Code) read it to populate the model selector. Omitting
      // it forces supportsModelSelection=false on the client.
      expect(res.models).toBeDefined()
      expect(Array.isArray(res.models!.availableModels)).toBe(true)
      expect(typeof res.models!.currentModelId).toBe('string')
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
      await agent.newSession({ cwd: '/tmp' } as any)
      expect(mockGetMainLoopModel).toHaveBeenCalled()
      // models is no longer in the v1 response, but the engine still receives it
      expect(mockSetModel).toHaveBeenCalledWith('claude-sonnet-4-6')
    })

    test('calls queryEngine.setModel with resolved model', async () => {
      const agent = new AcpAgent(makeConn())
      await agent.newSession({ cwd: '/tmp' } as any)
      expect(mockSetModel).toHaveBeenCalledWith('claude-sonnet-4-6')
    })

    test('respects model alias resolution via getMainLoopModel', async () => {
      mockGetMainLoopModel.mockReturnValueOnce('glm-5.1')
      const agent = new AcpAgent(makeConn())
      await agent.newSession({ cwd: '/tmp' } as any)
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

    test('honors _meta.permissionMode bypass without any opt-in (always available when process allows)', async () => {
      // bypass is exposed by default; only the root/sandbox process guard remains.
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

    test('honors _meta.permissionMode bypass regardless of local env gate', async () => {
      // The old CLAUDE_CODE_ACP_ALLOW_BYPASS_PERMISSIONS opt-in no longer gates availability,
      // but setting it should still not break the request.
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

    test('rejects empty prompt text with an error', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      await expect(
        agent.prompt({ sessionId, prompt: [] } as any),
      ).rejects.toThrow('Prompt content is empty')
    })

    test('rejects whitespace-only prompt with an error', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      await expect(
        agent.prompt({
          sessionId,
          prompt: [{ type: 'text', text: '   ' }],
        } as any),
      ).rejects.toThrow('Prompt content is empty')
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

    test('returns usage at root and under _meta.claudeCode.usage from forwardSessionUpdates', async () => {
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
      // Per session-usage.mdx RFD: PromptResponse.usage is at the root
      // (UNSTABLE in v1 but implemented by all major ACP clients).
      const rootUsage = (res as any).usage
      expect(rootUsage).toBeDefined()
      expect(rootUsage.inputTokens).toBe(100)
      expect(rootUsage.outputTokens).toBe(50)
      expect(rootUsage.totalTokens).toBe(165)
      // The same payload is mirrored under _meta.claudeCode.usage for
      // consumers that read the vendor namespace.
      const metaUsage = (res as any)._meta?.claudeCode?.usage
      expect(metaUsage).toBeDefined()
      expect(metaUsage.totalTokens).toBe(165)
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

  describe('deleteSession (session/delete via extMethod)', () => {
    test('extMethod routes session/delete to unstable_deleteSession', async () => {
      const agent = new AcpAgent(makeConn())
      const result = await agent.extMethod('session/delete', {
        sessionId: 'nonexistent-sid-for-delete-test',
      })
      // Idempotent: returns empty object even when session doesn't exist
      expect(result).toEqual({})
    })

    test('rejects session/delete without sessionId', async () => {
      const agent = new AcpAgent(makeConn())
      await expect(agent.extMethod('session/delete', {})).rejects.toThrow(
        'non-empty sessionId',
      )
    })

    test('rejects unknown methods with methodNotFound-style error', async () => {
      const agent = new AcpAgent(makeConn())
      await expect(
        agent.extMethod('totally/unknown/method', {}),
      ).rejects.toThrow()
    })

    test('unstable_deleteSession is idempotent for missing session', async () => {
      const agent = new AcpAgent(makeConn())
      // No file exists for this ID; both calls must succeed (per spec §Semantics)
      const r1 = await agent.unstable_deleteSession({
        sessionId: 'definitely-missing-id-1',
      })
      const r2 = await agent.unstable_deleteSession({
        sessionId: 'definitely-missing-id-2',
      })
      expect(r1).toEqual({})
      expect(r2).toEqual({})
    })

    test('unstable_deleteSession tears down active in-memory session', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      expect(agent.sessions.has(sessionId)).toBe(true)
      // deleteSession should remove the in-memory entry even though there's
      // no on-disk file (newSession doesn't persist immediately in tests).
      await agent.unstable_deleteSession({ sessionId })
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
    test('reports totalTokens as sum of all token types under _meta.claudeCode.usage', async () => {
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
      const usage = (res as any)._meta?.claudeCode?.usage
      expect(usage).toBeDefined()
      expect(usage.totalTokens).toBe(165)
    })

    test('omits _meta.usage when forwardSessionUpdates returns none', async () => {
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
      expect((res as any)._meta).toBeUndefined()
    })
  })

  describe('prompt userMessageId echo (message-id RFD)', () => {
    test('echoes client-supplied messageId as userMessageId', async () => {
      // Per rfds/message-id.mdx: when the client provides a `messageId` on
      // PromptRequest, the Agent echoes it back as `userMessageId`.
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      ;(forwardSessionUpdates as ReturnType<typeof mock>).mockResolvedValueOnce(
        {
          stopReason: 'end_turn',
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            cachedReadTokens: 0,
            cachedWriteTokens: 0,
          },
        },
      )
      const clientMessageId = '11111111-2222-3333-4444-555555555555'
      const res = await agent.prompt({
        sessionId,
        prompt: [{ type: 'text', text: 'hello' }],
        messageId: clientMessageId,
      } as any)
      expect((res as any).userMessageId).toBe(clientMessageId)
    })

    test('omits userMessageId when client does not supply messageId', async () => {
      // Per rfds/message-id.mdx: agent MAY self-generate; we take the
      // conservative approach of staying silent when the client didn't ask.
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
      expect((res as any).userMessageId).toBeUndefined()
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
      // resume also returns models so clients can render the selector after reconnect.
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
        // params.sessionId is the source session to fork from
        sessionId: original.sessionId,
        cwd: '/tmp',
        mcpServers: [],
      } as any)
      expect(forked.sessionId).not.toBe(original.sessionId)
      expect(agent.sessions.has(forked.sessionId)).toBe(true)
    })

    test('attempts to load source session history when forking', async () => {
      const agent = new AcpAgent(makeConn())
      const original = await agent.newSession({ cwd: '/tmp' } as any)
      mockGetLastSessionLog.mockClear()
      await agent.unstable_forkSession({
        sessionId: original.sessionId,
        cwd: '/tmp',
        mcpServers: [],
      } as any)
      expect(mockGetLastSessionLog).toHaveBeenCalledWith(original.sessionId)
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

    test('availableModes includes bypassPermissions by default (no opt-in needed)', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      const session = agent.sessions.get(sessionId)
      const modeIds = session?.modes.availableModes.map((m: any) => m.id)
      expect(modeIds).toContain('bypassPermissions')
    })

    test('can switch to bypassPermissions without any opt-in gate', async () => {
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
      // Even though bypass is available by default, removeBypassMode simulates a session
      // where the mode was stripped (e.g., future custom filter). The rejection still fires.
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

      // bypassPermissions passes the config-option layer (it's still listed in the
      // option's options array — removeBypassMode only strips it from modes.availableModes
      // and isBypassPermissionsModeAvailable), then applySessionMode rejects it with
      // "Mode not available". This covers the second of the two validation layers.
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

    test('rejects mode values not listed in the option options array', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)

      await expect(
        agent.setSessionConfigOption({
          sessionId,
          configId: 'mode',
          value: 'totally-not-a-real-mode',
        } as any),
      ).rejects.toThrow(/must be one of:/)
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

  describe('listSessions', () => {
    test('passes params.cwd through to listSessionsImpl when provided', async () => {
      const agent = new AcpAgent(makeConn())
      await agent.listSessions({ cwd: '/explicit/path' } as any)
      expect(mockListSessionsImpl).toHaveBeenCalledWith({
        dir: '/explicit/path',
      })
    })

    test('falls back to current working dir when client omits cwd', async () => {
      // Standard clients (Goose, possibly others) call session/list with
      // empty params. Without a fallback, listSessionsImpl treats undefined
      // dir as "all projects" and returns every session on disk.
      mockGetOriginalCwd.mockImplementation(() => '/active/project')
      const agent = new AcpAgent(makeConn())
      await agent.listSessions({} as any)
      expect(mockListSessionsImpl).toHaveBeenCalledWith({
        dir: '/active/project',
      })
    })

    test('falls back to current working dir when client sends null cwd', async () => {
      mockGetOriginalCwd.mockImplementation(() => '/active/project')
      const agent = new AcpAgent(makeConn())
      await agent.listSessions({ cwd: null } as any)
      expect(mockListSessionsImpl).toHaveBeenCalledWith({
        dir: '/active/project',
      })
    })

    test('rejects client-supplied cursor (pagination not implemented)', async () => {
      const agent = new AcpAgent(makeConn())
      await expect(
        agent.listSessions({ cursor: 'page2' } as any),
      ).rejects.toThrow(/Pagination cursor not supported/)
    })

    test('filters out candidates without a cwd field', async () => {
      mockListSessionsImpl.mockImplementation(
        async () =>
          [
            {
              sessionId: 'with-cwd',
              cwd: '/p',
              summary: 'Has cwd',
              lastModified: 0,
            },
            { sessionId: 'no-cwd', summary: 'No cwd', lastModified: 0 },
          ] as any,
      )
      const agent = new AcpAgent(makeConn())
      const res = await agent.listSessions({ cwd: '/p' } as any)
      expect(res.sessions).toHaveLength(1)
      expect(res.sessions[0].sessionId).toBe('with-cwd')
    })
  })

  describe('sessionId alignment with global state', () => {
    test('newSession calls switchSession with the generated sessionId', async () => {
      const agent = new AcpAgent(makeConn())
      const res = await agent.newSession({ cwd: '/tmp' } as any)
      expect(mockSwitchSession).toHaveBeenCalledWith(res.sessionId, null)
    })

    test('resumeSession calls switchSession with the requested sessionId', async () => {
      const agent = new AcpAgent(makeConn())
      const requestedId = 'resume-test-session-id'
      await agent.unstable_resumeSession({
        sessionId: requestedId,
        cwd: '/tmp',
        mcpServers: [],
      } as any)

      expect(mockSwitchSession).toHaveBeenCalledWith(
        requestedId,
        expect.any(String),
      )
    })

    test('loadSession calls switchSession with the requested sessionId', async () => {
      const agent = new AcpAgent(makeConn())
      const requestedId = 'load-test-session-id'
      await agent.loadSession({
        sessionId: requestedId,
        cwd: '/tmp',
        mcpServers: [],
      } as any)

      expect(mockSwitchSession).toHaveBeenCalledWith(
        requestedId,
        expect.any(String),
      )
    })

    test('resumeSession with existing session still calls switchSession', async () => {
      const agent = new AcpAgent(makeConn())
      const { sessionId } = await agent.newSession({ cwd: '/tmp' } as any)
      mockSwitchSession.mockClear()

      // Resume the same session — should still align global state
      await agent.unstable_resumeSession({
        sessionId,
        cwd: '/tmp',
        mcpServers: [],
      } as any)

      expect(mockSwitchSession).toHaveBeenCalledWith(
        sessionId,
        expect.any(String),
      )
    })

    test('prompt switches global sessionId to the correct session', async () => {
      const agent = new AcpAgent(makeConn())
      await agent.newSession({ cwd: '/tmp' } as any)
      await agent.newSession({ cwd: '/tmp' } as any)
      mockSwitchSession.mockClear()

      // Prompts must switch global state so recordTranscript writes to
      // the correct session file in multi-session scenarios.
      const s1 = agent.sessions.keys().next().value
      await agent.prompt({
        sessionId: s1,
        prompt: [{ type: 'text', text: 'hello' }],
      } as any)
      expect(mockSwitchSession).toHaveBeenCalledWith(s1, null)
    })
  })
})
