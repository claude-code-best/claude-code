const FLAG_SHIFT = 0x20000
const FLAG_CONTROL = 0x40000
const FLAG_OPTION = 0x80000
const FLAG_COMMAND = 0x100000

const modifierFlags: Record<string, number> = {
  shift: FLAG_SHIFT,
  control: FLAG_CONTROL,
  option: FLAG_OPTION,
  command: FLAG_COMMAND,
}

// kCGEventSourceStateCombinedSessionState = 0
const kCGEventSourceStateCombinedSessionState = 0

let cgEventSourceFlagsState: ((stateID: number) => number) | null = null
let ffiLoadAttempted = false

// Allows overriding platform for testing without mutating global process.platform
let _platform = process.platform

async function loadFFI(): Promise<void> {
  if (ffiLoadAttempted || _platform !== 'darwin') {
    return
  }
  ffiLoadAttempted = true

  try {
    const ffi = await import('bun:ffi')
    const lib = ffi.dlopen(
      `/System/Library/Frameworks/Carbon.framework/Carbon`,
      {
        CGEventSourceFlagsState: {
          args: [ffi.FFIType.i32],
          returns: ffi.FFIType.u64,
        },
      },
    )
    cgEventSourceFlagsState = (stateID: number): number => {
      return Number(lib.symbols.CGEventSourceFlagsState(stateID))
    }
  } catch {
    cgEventSourceFlagsState = null
  }
}

export async function prewarm(): Promise<void> {
  await loadFFI()
}

export function isModifierPressed(modifier: string): boolean {
  if (_platform !== 'darwin') {
    return false
  }

  if (cgEventSourceFlagsState === null) {
    return false
  }

  const flag = modifierFlags[modifier]
  if (flag === undefined) {
    return false
  }

  const currentFlags = cgEventSourceFlagsState(
    kCGEventSourceStateCombinedSessionState,
  )
  return (currentFlags & flag) !== 0
}

export function __resetForTest(): void {
  ffiLoadAttempted = false
  cgEventSourceFlagsState = null
  _platform = process.platform
}

export function __setPlatformForTest(p: NodeJS.Platform): void {
  _platform = p
}
