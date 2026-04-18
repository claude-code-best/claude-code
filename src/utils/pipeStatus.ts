import type { PipeRegistry } from './pipeRegistry.js'
import { readRegistry } from './pipeRegistry.js'

export async function formatPipeRegistryStatus(): Promise<string> {
  return formatPipeRegistry(await readRegistry())
}

export function formatPipeRegistry(registry: PipeRegistry): string {
  const lines = [
    `Pipe registry: ${registry.main ? 1 : 0} main, ${registry.subs.length} sub(s)`,
  ]
  if (registry.mainMachineId) {
    lines.push(`  main_machine=${registry.mainMachineId.slice(0, 8)}...`)
  }
  if (registry.main) {
    lines.push(
      `  [main] ${registry.main.pipeName} pid=${registry.main.pid} host=${registry.main.hostname} tcp=${registry.main.tcpPort ?? 'none'}`,
    )
  }
  for (const sub of registry.subs.slice(0, 10)) {
    lines.push(
      `  [sub-${sub.subIndex}] ${sub.pipeName} pid=${sub.pid} host=${sub.hostname} bound=${sub.boundToMain ?? 'none'} tcp=${sub.tcpPort ?? 'none'}`,
    )
  }
  if (!registry.main && registry.subs.length === 0) {
    lines.push('  none')
  }
  if (registry.subs.length > 10) {
    lines.push(`  ... ${registry.subs.length - 10} more sub pipe(s)`)
  }
  return lines.join('\n')
}
