import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const repoRoot = resolve(import.meta.dir, '..', '..')
const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

async function findPackageJson(
  startPath: string,
  expectedName: string,
): Promise<string> {
  let current = dirname(startPath)
  for (let depth = 0; depth < 10; depth++) {
    const candidate = join(current, 'package.json')
    const file = Bun.file(candidate)
    if (await file.exists()) {
      try {
        const parsed = JSON.parse(await file.text()) as { name?: unknown }
        if (parsed.name === expectedName) {
          return candidate
        }
      } catch {
        // ignore parse errors and keep walking up
      }
    }
    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  throw new Error(
    `package.json with name "${expectedName}" not found above ${startPath}`,
  )
}

describe('dependency security overrides', () => {
  test('mcpb can load patched inquirer prompts from its package context', async () => {
    const mcpbRequire = createRequire(import.meta.resolve('@anthropic-ai/mcpb'))
    const promptsPath = mcpbRequire.resolve('@inquirer/prompts')
    const prompts = (await import(pathToFileURL(promptsPath).href)) as {
      input?: unknown
      select?: unknown
    }

    expect(typeof prompts.input).toBe('function')
    expect(typeof prompts.select).toBe('function')
  })

  test('google auth gaxios multipart boundary still uses a UUID', async () => {
    const vertexRequire = createRequire(
      import.meta.resolve('@anthropic-ai/vertex-sdk'),
    )
    const gaxios = vertexRequire('gaxios') as {
      request(options: {
        adapter(options: { headers: Headers; url: string }): Promise<{
          config: unknown
          data: string
          headers: Record<string, string>
          request: { responseURL: string }
          status: number
          statusText: string
        }>
        multipart: Array<{ body: string; headers: Record<string, string> }>
        url: string
      }): Promise<{ status: number }>
    }
    let contentType: string | undefined

    const response = await gaxios.request({
      url: 'https://example.com/upload',
      multipart: [
        { body: 'payload', headers: { 'Content-Type': 'text/plain' } },
      ],
      adapter: async options => {
        contentType = options.headers.get('content-type') ?? undefined
        return {
          config: options,
          data: '',
          headers: {},
          request: { responseURL: options.url },
          status: 200,
          statusText: 'OK',
        }
      },
    })

    expect(response.status).toBe(200)
    expect(contentType).toMatch(/^multipart\/related; boundary=[0-9a-f-]{36}$/)
    expect(contentType?.split('boundary=')[1]).toMatch(uuidV4Pattern)
  })

  test('azure identity msal guid generation works through its package context', () => {
    const identityRequire = createRequire(
      import.meta.resolve('@azure/identity'),
    )
    const msal = identityRequire('@azure/msal-node') as {
      CryptoProvider: new () => { createNewGuid(): string }
    }
    const cryptoProvider = new msal.CryptoProvider()

    expect(cryptoProvider.createNewGuid()).toMatch(uuidV4Pattern)
  })

  test('remote control markdown renderer resolves streamdown and mermaid', async () => {
    const rcsRequire = createRequire(
      join(repoRoot, 'packages/remote-control-server/package.json'),
    )
    const streamdownPath = rcsRequire.resolve('streamdown')
    const streamdown = (await import(pathToFileURL(streamdownPath).href)) as {
      Streamdown?: unknown
    }
    const streamdownRequire = createRequire(streamdownPath)
    const uuid = (await import(
      pathToFileURL(streamdownRequire.resolve('uuid')).href
    )) as { v4(): string }
    const mermaidPath = streamdownRequire.resolve('mermaid')
    // mermaid does not export ./package.json in its exports map, so resolving
    // 'mermaid/package.json' throws ERR_PACKAGE_PATH_NOT_EXPORTED in runtimes
    // that honor exports semantics. Walk up from the resolved entry until a
    // package.json with name === 'mermaid' is found.
    const mermaidPackagePath = await findPackageJson(mermaidPath, 'mermaid')
    const mermaidPackage = JSON.parse(
      await Bun.file(mermaidPackagePath).text(),
    ) as {
      name?: unknown
      exports?: { '.'?: { import?: unknown } }
    }

    expect(streamdown.Streamdown).toBeDefined()
    expect(uuid.v4()).toMatch(uuidV4Pattern)
    expect(mermaidPackage.name).toBe('mermaid')
    expect(mermaidPath).toContain('mermaid.core.mjs')
    expect(mermaidPackage.exports?.['.']?.import).toBe(
      './dist/mermaid.core.mjs',
    )
  })

  test('grpc proto-loader keeps its protobuf 7 parser path working', () => {
    const exporterRequire = createRequire(
      import.meta.resolve('@opentelemetry/exporter-trace-otlp-grpc'),
    )
    const grpcRequire = createRequire(exporterRequire.resolve('@grpc/grpc-js'))
    const protoLoader = grpcRequire('@grpc/proto-loader') as {
      loadSync(
        path: string,
        options?: Record<string, unknown>,
      ): Record<string, unknown>
    }
    const tempDir = mkdtempSync(join(tmpdir(), 'proto-loader-smoke-'))
    const protoPath = join(tempDir, 'service.proto')

    writeFileSync(
      protoPath,
      [
        'syntax = "proto3";',
        'package smoke;',
        'message Ping { string id = 1; }',
        'service PingService { rpc Send(Ping) returns (Ping); }',
      ].join('\n'),
    )

    try {
      const loaded = protoLoader.loadSync(protoPath, { keepCase: true })
      expect(loaded['smoke.Ping']).toBeDefined()
      expect(loaded['smoke.PingService']).toBeDefined()
    } finally {
      rmSync(tempDir, { force: true, recursive: true })
    }
  })
})
