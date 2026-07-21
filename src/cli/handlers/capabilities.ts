export type CapabilityActivation =
  | 'always'
  | 'runtime-config'
  | 'environment'
  | 'not-compiled'

export interface Capability {
  name: string
  compiled: boolean
  activation: CapabilityActivation
  usage: string
  description: string
}

type CapabilityMetadata = Omit<Capability, 'name' | 'compiled'>

const KNOWN_FEATURES: Record<string, CapabilityMetadata> = {
  BRIDGE_MODE: {
    activation: 'runtime-config',
    usage: 'bun run rcs:local | ccb remote-control',
    description:
      'Connects a local Bridge Worker to Remote Control, including self-hosted RCS.',
  },
  DAEMON: {
    activation: 'always',
    usage: 'ccb daemon <start|stop|status>',
    description: 'Runs persistent supervisors and background workers.',
  },
  SESSION_TERMINALS: {
    activation: 'always',
    usage: 'bun run rcs:local, then open the Code session terminal panel',
    description: 'Provides persistent terminals for Remote Control sessions.',
  },
}

const VIRTUAL_CAPABILITIES: Capability[] = [
  {
    name: 'headless-output',
    compiled: true,
    activation: 'always',
    usage: 'ccb --print "prompt" --output-format <text|json|stream-json>',
    description: 'Runs the CLI without the interactive terminal UI.',
  },
  {
    name: 'model-providers',
    compiled: true,
    activation: 'runtime-config',
    usage: '/login or the RCS Web Provider settings page',
    description:
      'Selects and persists Anthropic, OpenAI, Gemini, Grok, and compatible providers.',
  },
  {
    name: 'model-streaming',
    compiled: true,
    activation: 'always',
    usage:
      'Interactive/RCS: automatic; headless: --print --verbose --output-format stream-json --include-partial-messages',
    description:
      'Streams model events; partial output controls visibility, not the API streaming transport.',
  },
]

export function buildCapabilities(
  compiledFeatures: readonly string[],
): Capability[] {
  const compiled = new Set(compiledFeatures)
  const featureNames = new Set([
    ...Object.keys(KNOWN_FEATURES),
    ...compiledFeatures,
  ])
  const features = [...featureNames].map(name => {
    const isCompiled = compiled.has(name)
    const metadata = KNOWN_FEATURES[name] ?? {
      activation: 'always' as const,
      usage: `Set FEATURE_${name}=1 at build/dev time`,
      description:
        'Compiled feature flag without additional capability metadata.',
    }
    return {
      name,
      compiled: isCompiled,
      activation: isCompiled ? metadata.activation : 'not-compiled',
      usage: metadata.usage,
      description: metadata.description,
    } satisfies Capability
  })

  return [...features, ...VIRTUAL_CAPABILITIES].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  )
}

export function getCapabilitiesOutput(options: {
  json: boolean
  compiledFeatures?: readonly string[]
}): string {
  const compiledFeatures =
    options.compiledFeatures ??
    (typeof MACRO === 'undefined' ? [] : MACRO.COMPILED_FEATURES)
  const capabilities = buildCapabilities(compiledFeatures)
  if (options.json) {
    return `${JSON.stringify(
      { version: 1, compiledFeatures: [...compiledFeatures], capabilities },
      null,
      2,
    )}\n`
  }

  const lines = ['Capabilities', '============', '']
  for (const capability of capabilities) {
    lines.push(
      `${capability.name} [${capability.compiled ? 'compiled' : 'not compiled'}]`,
      `  Activation: ${capability.activation}`,
      `  Usage: ${capability.usage}`,
      `  ${capability.description}`,
      '',
    )
  }
  return `${lines.join('\n').trimEnd()}\n`
}

export function parseCapabilitiesArgs(args: readonly string[]): {
  json: boolean
} {
  const unknown = args.find(argument => argument !== '--json')
  if (unknown) throw new Error(`Unknown capabilities option: ${unknown}`)
  return { json: args.includes('--json') }
}
