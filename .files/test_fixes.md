# Test Isolation Fixes

Two bugs. Two files touched.

---

## 1. `packages/modifiers-napi/src/__tests__/index.test.ts`

**Problem:** `mock.module('bun:ffi', ...)` is declared at module scope with no cleanup.
Bun reuses workers across files in a full suite run, so the mock bleeds into other
files that import anything touching `bun:ffi`. When `index.test.ts` runs _after_
another file has already loaded `bun:ffi` into the module registry, the module-level
mock declaration loses the race and the test gets the wrong module — or nothing at all.

**Fix:** Add `afterAll(() => mock.restore())`.

```typescript
// packages/modifiers-napi/src/__tests__/index.test.ts

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'

let ffiShouldThrow = false
let nativeFlags = 0
let dlopenCalls = 0

mock.module('bun:ffi', () => ({
  FFIType: {
    i32: 0,
    u64: 0,
  },
  dlopen: () => {
    dlopenCalls++
    if (ffiShouldThrow) {
      throw new Error('ffi load failed')
    }
    return {
      symbols: {
        CGEventSourceFlagsState: () => nativeFlags,
      },
    }
  },
}))

// ✅ NEW: restore the bun:ffi mock after this file finishes
// so it doesn't bleed into other files running in the same worker
afterAll(() => {
  mock.restore()
})

beforeEach(() => {
  ffiShouldThrow = false
  nativeFlags = 0
  dlopenCalls = 0
})

// ... rest of file unchanged
```

---

## 2. `src/utils/staticRender.tsx`

**Problem:** `await instance.waitUntilExit()` hangs indefinitely when Ink's reconciler
commit phase doesn't complete. `waitUntilExit()` only resolves when `exit()` is called
inside `useLayoutEffect` — but if `@anthropic/ink`'s `wrappedRender` has stale
process-level state from a previous test file (singleton reconciler, leaked
`process.on('exit')` handlers, a cached fiber root), React never commits, `useLayoutEffect`
never fires, and the whole render silently hangs until the 10s test timeout kills it.

This only surfaces in the full suite because Bun shares workers across files sequentially.
Running the file alone gives it a clean worker with no prior Ink state.

**Fix:** Race `waitUntilExit()` against a 3s safety timeout. On timeout, call
`instance.unmount()` to force Ink cleanup and throw a descriptive error instead of
a silent 10s hang.

Also: explicitly remove the stream `data` listener and destroy the stream after render.
Without this, the PassThrough stream stays open and its listener accumulates garbage
across calls in the same process lifetime.

```typescript
// src/utils/staticRender.tsx

import * as React from 'react';
import { useLayoutEffect } from 'react';
import { PassThrough } from 'stream';
import stripAnsi from 'strip-ansi';
import { wrappedRender as render, useApp } from '@anthropic/ink';

function RenderOnceAndExit({ children }: { children: React.ReactNode }): React.ReactNode {
  const { exit } = useApp();

  useLayoutEffect(() => {
    const timer = setTimeout(exit, 0);
    return () => clearTimeout(timer);
  }, [exit]);

  return <>{children}</>;
}

const SYNC_START = '\x1B[?2026h';
const SYNC_END = '\x1B[?2026l';

function extractFirstFrame(output: string): string {
  const startIndex = output.indexOf(SYNC_START);
  if (startIndex === -1) return output;

  const contentStart = startIndex + SYNC_START.length;
  const endIndex = output.indexOf(SYNC_END, contentStart);
  if (endIndex === -1) return output;

  return output.slice(contentStart, endIndex);
}

export async function renderToAnsiString(node: React.ReactNode, columns?: number): Promise<string> {
  let output = '';

  const stream = new PassThrough();
  if (columns !== undefined) {
    (stream as unknown as { columns: number }).columns = columns;
  }

  // ✅ NEW: named handler so we can remove it after render
  const dataHandler = (chunk: Buffer) => {
    output += chunk.toString();
  };
  stream.on('data', dataHandler);

  const instance = await render(<RenderOnceAndExit>{node}</RenderOnceAndExit>, {
    stdout: stream as unknown as NodeJS.WriteStream,
    patchConsole: false,
  });

  // ✅ NEW: race waitUntilExit against a 3s hard limit.
  // If Ink's reconciler is stuck (stale worker state from a prior test file),
  // this surfaces a real error instead of silently hanging for 10s.
  await Promise.race([
    instance.waitUntilExit(),
    new Promise<void>((_, reject) =>
      setTimeout(() => {
        instance.unmount();
        reject(
          new Error(
            '[staticRender] Ink render did not exit within 3s — wrappedRender may have stale process state from a prior test file',
          ),
        );
      }, 3000),
    ),
  ]);

  // ✅ NEW: clean up the stream so it doesn't accumulate across calls
  stream.off('data', dataHandler);
  stream.destroy();

  return extractFirstFrame(output);
}

export async function renderToString(node: React.ReactNode, columns?: number): Promise<string> {
  const output = await renderToAnsiString(node, columns);
  return stripAnsi(output);
}
```

---

## If AutofixProgress tests still hang after this

The 3s safety net will stop the silent timeout and give you a real error message.
If you're still seeing the hang, the root is inside `wrappedRender` from `@anthropic/ink`.
Look for any of these in that file:

- A module-level singleton (cached app instance, fiber root, reconciler)
- `process.on('exit')` / `process.on('SIGTERM')` handlers added on each `render()` call but never removed
- A global `stdout` patch applied once and assumed fresh on every call

Share that file and the exact line can be pinpointed.

---

## Summary

| File               | Change                                                  | Why                                              |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------ |
| `index.test.ts`    | Add `afterAll(() => mock.restore())`                    | Stops `bun:ffi` mock bleeding into other workers |
| `staticRender.tsx` | Race `waitUntilExit()` with 3s timeout + stream cleanup | Surfaces real errors instead of silent 10s hangs |
