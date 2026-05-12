import { useRef } from 'react'
import { major, minor, patch } from 'semver'

export function getSemverPart(version: string): string {
  return `${major(version, { loose: true })}.${minor(version, { loose: true })}.${patch(version, { loose: true })}`
}

export function shouldShowUpdateNotification(
  updatedVersion: string,
  lastNotifiedSemver: string | null,
): boolean {
  const updatedSemver = getSemverPart(updatedVersion)
  return updatedSemver !== lastNotifiedSemver
}

export function useUpdateNotification(
  updatedVersion: string | null | undefined,
  initialVersion: string = MACRO.VERSION,
): string | null {
  const lastNotifiedRef = useRef<string | null>(getSemverPart(initialVersion))

  const updatedSemver = updatedVersion ? getSemverPart(updatedVersion) : null
  if (!updatedSemver) {
    return null
  }

  if (updatedSemver !== lastNotifiedRef.current) {
    lastNotifiedRef.current = updatedSemver
    return updatedSemver
  }

  return null
}
