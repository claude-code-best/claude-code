import { randomBytes } from 'node:crypto'

export function createAuthToken(): string {
  return randomBytes(24).toString('hex')
}
