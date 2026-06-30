/**
 * ACP Agent module — public entrypoint (barrel) re-exporting from the
 * `./agent/` sub-modules.
 *
 * The AcpAgent class is split across multiple sub-files for line-budget
 * reasons:
 *  - `./agent/AcpAgent.js` — class shell + lightweight protocol handlers
 *    (initialize / authenticate / newSession / resumeSession / loadSession /
 *    listSessions / forkSession / closeSession / cancel / setSessionMode /
 *    setSessionModel) + small private helpers.
 *  - `./agent/createSessionMethod.js` — createSession (prototype-attached).
 *  - `./agent/sessionLifecycle.js` — getOrCreateSession / teardownSession /
 *    replaySessionHistory / applySessionMode / updateConfigOption
 *    (prototype-attached).
 *  - `./agent/promptFlow.js` — prompt / setSessionConfigOption
 *    (prototype-attached).
 *  - `./agent/sessionTypes.js` / `./agent/permissionMode.js` /
 *    `./agent/configOptions.js` / `./agent/promptQueue.js` /
 *    `./agent/internalAccessors.js` — pure helpers and types.
 *
 * The side-effect imports below populate AcpAgent.prototype with the heavy
 * session-lifecycle and prompt-flow methods. They MUST run before any
 * AcpAgent instance is constructed. Importing this barrel is the single
 * entry point that guarantees that ordering.
 *
 * Tests import AcpAgent via '../agent.js'; external consumers (entry.ts)
 * import via './agent.js'. Both resolve to this file.
 */
import './agent/createSessionMethod.js'
import './agent/sessionLifecycle.js'
import './agent/promptFlow.js'

export { AcpAgent } from './agent/AcpAgent.js'
