export interface TerminalSize {
  cols: number
  rows: number
}

export interface TerminalResizeScheduler {
  schedule(size: TerminalSize): void
  reset(): void
  getCoalescedCount(): number
  dispose(): void
}

export function createTerminalResizeScheduler(
  send: (size: TerminalSize) => void,
): TerminalResizeScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: TerminalSize | null = null
  let lastSent: TerminalSize | null = null
  let coalescedCount = 0

  const flush = () => {
    timer = null
    const next = pending
    pending = null
    if (!next) return
    if (lastSent?.cols === next.cols && lastSent.rows === next.rows) return
    lastSent = next
    send(next)
  }

  return {
    schedule(size) {
      pending = size
      if (timer) {
        clearTimeout(timer)
        coalescedCount += 1
      }
      const isOneColumnJitter =
        !!lastSent &&
        lastSent.rows === size.rows &&
        Math.abs(lastSent.cols - size.cols) <= 1
      timer = setTimeout(flush, isOneColumnJitter ? 500 : 150)
    },
    getCoalescedCount() {
      return coalescedCount
    },
    reset() {
      if (timer) clearTimeout(timer)
      timer = null
      pending = null
      lastSent = null
    },
    dispose() {
      if (timer) clearTimeout(timer)
      timer = null
      pending = null
    },
  }
}
