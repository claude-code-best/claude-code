import type { Command } from '../../commands.js'

// Side-effect: registers fireCompanionObserver on globalThis so REPL.tsx
// can call it as a bare global without import changes.
import '../../buddy/observer.js'

const buddy = {
  type: 'local',
  name: 'buddy',
  description: 'View and manage your companion buddy',
  supportsNonInteractive: false,
  load: () => import('./buddy.js'),
} satisfies Command

export default buddy
