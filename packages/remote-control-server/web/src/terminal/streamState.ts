export interface TerminalStreamCursor {
  streamId: string | null
  lastOutputSeq: number
  buffer: string
}

export interface TerminalTransportState {
  ready: boolean
  generation: string | null
}

export function applyTerminalTransportState(
  current: TerminalTransportState,
  ready: boolean,
  generation: string | null,
): { state: TerminalTransportState; shouldSync: boolean } {
  const nextGeneration = ready ? generation : null
  return {
    state: { ready, generation: nextGeneration },
    shouldSync:
      ready && (!current.ready || current.generation !== nextGeneration),
  }
}

export type TerminalStreamFrame =
  | {
      type: 'terminal_output'
      streamId: string
      outputSeq: number
      data: string
    }
  | {
      type: 'terminal_snapshot'
      streamId: string
      throughOutputSeq: number
      data: string
    }

export interface TerminalStreamUpdate {
  cursor: TerminalStreamCursor
  action: 'append' | 'reset' | 'ignore'
  data: string
}

export function applyTerminalStreamFrame(
  cursor: TerminalStreamCursor,
  frame: TerminalStreamFrame,
): TerminalStreamUpdate {
  if (frame.type === 'terminal_snapshot') {
    if (
      cursor.streamId === frame.streamId &&
      frame.throughOutputSeq <= cursor.lastOutputSeq
    ) {
      return { cursor, action: 'ignore', data: '' }
    }
    return {
      cursor: {
        streamId: frame.streamId,
        lastOutputSeq: frame.throughOutputSeq,
        buffer: frame.data,
      },
      action: 'reset',
      data: frame.data,
    }
  }

  const streamChanged = cursor.streamId !== frame.streamId
  if (!streamChanged && frame.outputSeq <= cursor.lastOutputSeq) {
    return { cursor, action: 'ignore', data: '' }
  }
  const previous = streamChanged ? '' : cursor.buffer
  const buffer = (previous + frame.data).slice(-256 * 1024)
  return {
    cursor: {
      streamId: frame.streamId,
      lastOutputSeq: frame.outputSeq,
      buffer,
    },
    action: streamChanged ? 'reset' : 'append',
    data: frame.data,
  }
}
