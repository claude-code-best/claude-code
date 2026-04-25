| Hypothesis | Verdict | Evidence |
| --- | --- | --- |
| CSP/nonce blocks webview script | Rejected | `packages/vscode-extension/src/ChatViewProvider.ts:48-52` enables scripts and allows `dist`; `:603-617` creates a nonce and uses the same nonce on `dist/webview.js`. `packages/vscode-extension/dist/webview.js` exists. Seeing "No matching command" also means React mounted. |
| `acquireVsCodeApi` singleton throws | Rejected | `webview/hooks/useVSCodeAPI.ts:10-14` calls it once at module scope; `rg` shows only `useACP.ts:36,260` imports/uses the hook. |
| `isFromExtension` rejects valid messages | Rejected | `webview/lib/protocol.ts:86-92` accepts any object whose string `type` starts with `ext:`; it is not strict-equal to one literal. |
| Wrong prop name into PromptInput | Rejected | `App.tsx:113-119` passes `availableCommands`; `PromptInput.tsx:30-36` destructures it; `:299-303` passes it as `commands` to `CommandMenu`. |
| CommandMenu keydown masks empty list | Rejected | `CommandMenu.tsx:41-61` listens only to `keydown` and only when visible plus non-empty filtered results; it cannot block `window.message`. |
| `makeClient()` returns stale clients | Rejected | `ACPClient.ts:184` creates one `ClientSideConnection`; SDK `acp.js:467-538` calls `toClient(this)` once and stores that `client`. |
| `ndJsonStream` direction flipped | Rejected | SDK `stream.d.ts:20-24` wants writable output then readable input. `ACPClient.ts:180-182` passes child stdin writable, then child stdout readable. Names are confusing; order is correct. |

Final root cause: the real break is a readiness race where extension-host messages can be dropped because the webview HTML is assigned before the host receive listener is registered, and extension-to-webview sends are fire-and-forget with no ready queue.

Evidence: `ChatViewProvider.ts:46-55` sets `webview.html` before `onDidReceiveMessage`; the webview posts `ext:webview_ready` immediately after adding its own listener in `useACP.ts:279-299`. Command replay only starts if that ready message reaches `handleWebviewMessage` (`ChatViewProvider.ts:170-207`, `:585-599`). Meanwhile direct command pushes are one-shot (`:489-498`) and `postToWebview` ignores the returned thenable/ready state (`:576-577`). If `ext:webview_ready` or the one-shot `available_commands_update` lands during that gap, the reducer never sees commands, leaving `CommandMenu` with `commands.length === 0` (`CommandMenu.tsx:22-26`, `:70-80`).

Minimal patch suggestion: register `webview.onDidReceiveMessage` before assigning `webview.html`, add `private webviewReady = false`, set it true on `ext:webview_ready`, and make `postToWebview` queue `ext:available_commands`/state replay messages until ready, flushing on ready. Also await/log `webview.postMessage(...)` false results.
