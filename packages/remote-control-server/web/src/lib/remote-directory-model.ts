import type { RemoteDirectoryEntry, RemoteDirectoryListing } from '../types'

export interface RemoteDirectoryState {
  pathInput: string
  requestedPath: string
  validatedInputPath: string | null
  canonicalPath: string | null
  entries: RemoteDirectoryEntry[]
  backStack: string[]
  loading: boolean
  error: string | null
}

export function createRemoteDirectoryState(path: string): RemoteDirectoryState {
  const initialPath = path.trim() || '/'
  return {
    pathInput: initialPath,
    requestedPath: initialPath,
    validatedInputPath: null,
    canonicalPath: null,
    entries: [],
    backStack: [],
    loading: true,
    error: null,
  }
}

export function setPathInput(
  state: RemoteDirectoryState,
  pathInput: string,
): RemoteDirectoryState {
  return { ...state, pathInput }
}

function requestPath(
  state: RemoteDirectoryState,
  requestedPath: string,
  pushHistory = true,
): RemoteDirectoryState {
  const path = requestedPath.trim()
  if (!path || path === state.requestedPath) {
    return { ...state, pathInput: path || state.pathInput }
  }
  return {
    ...state,
    pathInput: path,
    requestedPath: path,
    validatedInputPath: null,
    canonicalPath: null,
    entries: [],
    backStack: pushHistory
      ? [...state.backStack, state.requestedPath]
      : state.backStack,
    loading: true,
    error: null,
  }
}

export function requestPathInput(
  state: RemoteDirectoryState,
): RemoteDirectoryState {
  return requestPath(state, state.pathInput)
}

export function enterDirectory(
  state: RemoteDirectoryState,
  entryName: string,
): RemoteDirectoryState {
  const entry = state.entries.find(item => item.name === entryName)
  if (!entry || entry.kind !== 'directory') return state
  return requestPath(state, joinRemotePath(state.requestedPath, entry.name))
}

export function goToParent(state: RemoteDirectoryState): RemoteDirectoryState {
  return requestPath(state, parentRemotePath(state.requestedPath))
}

export function goBack(state: RemoteDirectoryState): RemoteDirectoryState {
  const previous = state.backStack.at(-1)
  if (!previous) return state
  return {
    ...requestPath(state, previous, false),
    backStack: state.backStack.slice(0, -1),
  }
}

export function refreshDirectory(
  state: RemoteDirectoryState,
): RemoteDirectoryState {
  return {
    ...state,
    validatedInputPath: null,
    canonicalPath: null,
    loading: true,
    error: null,
  }
}

export function applyListing(
  state: RemoteDirectoryState,
  listing: RemoteDirectoryListing,
): RemoteDirectoryState {
  return {
    ...state,
    validatedInputPath: state.requestedPath,
    canonicalPath: listing.path,
    entries: [...listing.entries].sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
      return left.name.localeCompare(right.name)
    }),
    loading: false,
    error: null,
  }
}

export function applyDirectoryError(
  state: RemoteDirectoryState,
  error: string,
): RemoteDirectoryState {
  return {
    ...state,
    validatedInputPath: null,
    canonicalPath: null,
    entries: [],
    loading: false,
    error,
  }
}

export function canConfirmWorkspace(state: RemoteDirectoryState): boolean {
  return (
    !state.loading &&
    !state.error &&
    state.validatedInputPath === state.requestedPath &&
    state.canonicalPath !== null
  )
}

function joinRemotePath(base: string, name: string): string {
  const separator = base.includes('\\') && !base.includes('/') ? '\\' : '/'
  const trimmedBase = base.replace(/[\\/]+$/, '')
  if (!trimmedBase) return `${separator}${name}`
  return `${trimmedBase}${separator}${name}`
}

function parentRemotePath(path: string): string {
  const separator = path.includes('\\') && !path.includes('/') ? '\\' : '/'
  const rootMatch = path.match(/^[A-Za-z]:[\\/]?$/)
  if (path === '/' || rootMatch) return path
  const trimmed = path.replace(/[\\/]+$/, '')
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (index < 0) return path
  if (index === 0) return '/'
  if (index === 2 && /^[A-Za-z]:/.test(trimmed))
    return `${trimmed.slice(0, 2)}${separator}`
  return trimmed.slice(0, index)
}
