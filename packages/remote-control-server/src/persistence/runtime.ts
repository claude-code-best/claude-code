import { RcsDatabase } from './database'

let persistence = new RcsDatabase(':memory:')

export function initializePersistence(path: string): void {
  const next = new RcsDatabase(path)
  const previous = persistence
  persistence = next
  previous.close()
}

export function getPersistence(): RcsDatabase {
  return persistence
}

export function closePersistence(): void {
  persistence.close()
}

export function resetPersistenceForTests(): void {
  const previous = persistence
  persistence = new RcsDatabase(':memory:')
  previous.close()
}
