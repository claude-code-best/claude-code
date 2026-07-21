# Bridge Reconnect Stability Design

## Problem

The self-hosted bridge frequently prints `Reconnected after ...` even though
the Code CCR v2 stream is healthy. The bridge debug log shows two concrete
causes:

1. `/work/poll` is an eight-second server long poll behind a ten-second Axios
   timeout. Under synchronous SQLite/event traffic, the request sometimes
   crosses ten seconds and is reported as a disconnect.
2. A late or duplicate environment-command completion returns 409
   `environment command is already complete`. The bridge treats that terminal,
   idempotent outcome as a poll-loop failure and enters reconnect UI state.

The current RCS long poll also queries SQLite every 500 ms, multiplying work
when several sessions are active and making the timing problem more likely.
The same debug log shows a second transport issue: idle legacy Chat
WebSockets are closed with code 1000 after the server sees no client data.
Remote-mode clients currently disable their application `keep_alive`, so the
server's client-activity clock never advances while the session is idle.

## Chosen Design

Use four compatible changes rather than hiding all reconnects:

- Increase the bridge poll HTTP timeout to 30 seconds. The RCS default remains
  an eight-second long poll, leaving 22 seconds for event-loop scheduling and
  local load.
- Make environment-command completion first-writer-wins and idempotent. A
  duplicate or late completion returns the stored terminal command instead of
  409. The bridge client also accepts the old server's exact `already complete`
  409 response so mixed-version deployments remain stable.
- Surface reconnect UI only after two consecutive poll-loop failures. The first
  transient failure stays in verbose/debug logs. Once reconnect state is shown,
  the next successful poll emits one recovery line.
- Replace the RCS 500 ms SQLite scan loop with an environment-scoped wake
  signal. Poll performs one immediate work lookup, waits for a generation
  change or deadline, then looks up again. Work/session creation and command
  requeue notify the signal. Generation counters prevent a notification race
  between lookup and waiter registration.
- Send a 20-second application `keep_alive` on remote legacy WebSockets. CCR
  v2 Code sessions use SSE and are unaffected; non-remote WebSockets retain
  their existing 120-second interval.

## Boundaries

- Code CCR v2 SSE delivery and worker heartbeat behavior are unchanged.
- Server WebSocket close-code policy is unchanged; the legacy client now
  satisfies its existing client-activity contract while idle.
- Database schema is unchanged.
- Existing configured `RCS_POLL_TIMEOUT` remains supported.

## Failure Handling

- A truly unreachable server still enters reconnect state after the second
  failed poll and retains existing exponential backoff/give-up behavior.
- Poll abort still exits without a reconnect message.
- Duplicate command completion does not overwrite the first stored result or
  error.
- Work notifications are advisory: every wake is followed by an authoritative
  store/database read, and the long-poll deadline still guarantees completion.

## Verification

- Bridge API test asserts the 30-second poll timeout and old-server 409
  compatibility.
- Work-dispatch test proves a pending long poll wakes promptly when work is
  created and proves empty polls still time out.
- Route/service test proves duplicate completion returns 200 and preserves the
  first result.
- Bridge reconnect policy test proves one failure is hidden, two failures are
  surfaced, and recovery is emitted only after visible reconnect state.
- WebSocket keepalive policy test proves remote legacy sessions send data more
  frequently than the RCS 60-second inactivity window.
- Run focused tests, typecheck, lint, diff check, and build.
