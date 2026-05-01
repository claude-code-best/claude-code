/**
 * MCP tool schemas for the computer-use server. Mirrors
 * claude-for-chrome-mcp/src/browserTools.ts in shape (plain `Tool`-shaped
 * object literals, no zod).
 *
 * Coordinate descriptions are baked in at tool-list build time from the
 * `chicago_coordinate_mode` gate. The model sees exactly ONE coordinate
 * convention in the param descriptions and never learns the other exists.
 * The host (`serverDef.ts`) reads the same frozen gate value for
 * `scaleCoord` — both must agree or clicks land in the wrong space.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js'

import type { CoordinateMode } from './types.js'

// See packages/desktop/computer-use-mcp/COORDINATES.md before touching any
// model-facing coordinate text. Chrome's browserTools.ts:143 is the reference
// phrasing — "pixels from the left edge", no geometry, no number to do math with.
const COORD_DESC: Record<CoordinateMode, { x: string; y: string }> = {
  pixels: {
    x: 'Horizontal pixel position read directly from the most recent screenshot image, measured from the left edge. The server handles all scaling.',
    y: 'Vertical pixel position read directly from the most recent screenshot image, measured from the top edge. The server handles all scaling.',
  },
  normalized_0_100: {
    x: 'Horizontal position as a percentage of screen width, 0.0–100.0 (0 = left edge, 100 = right edge).',
    y: 'Vertical position as a percentage of screen height, 0.0–100.0 (0 = top edge, 100 = bottom edge).',
  },
}

const FRONTMOST_GATE_DESC =
  'The frontmost application must be in the session allowlist at the time of this call, or this tool returns an error and does nothing.'

/**
 * Item schema for the `actions` array in `computer_batch`, `teach_step`, and
 * `teach_batch`. All three dispatch through the same `dispatchAction` path
 * with the same validation — keep this enum in sync with `BATCHABLE_ACTIONS`
 * in toolCalls.ts.
 */
const BATCH_ACTION_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: [
        'key',
        'type',
        'mouse_move',
        'left_click',
        'left_click_drag',
        'right_click',
        'middle_click',
        'double_click',
        'triple_click',
        'scroll',
        'hold_key',
        'screenshot',
        'cursor_position',
        'left_mouse_down',
        'left_mouse_up',
        'wait',
      ],
      description: 'The action to perform.',
    },
    coordinate: {
      type: 'array',
      items: { type: 'number' },
      minItems: 2,
      maxItems: 2,
      description:
        '(x, y) for click/mouse_move/scroll/left_click_drag end point.',
    },
    start_coordinate: {
      type: 'array',
      items: { type: 'number' },
      minItems: 2,
      maxItems: 2,
      description:
        '(x, y) drag start — left_click_drag only. Omit to drag from current cursor.',
    },
    text: {
      type: 'string',
      description:
        'For type: the text. For key/hold_key: the chord string. For click/scroll: modifier keys to hold.',
    },
    scroll_direction: {
      type: 'string',
      enum: ['up', 'down', 'left', 'right'],
    },
    scroll_amount: { type: 'integer', minimum: 0, maximum: 100 },
    duration: {
      type: 'number',
      description: 'Seconds (0–100). For hold_key/wait.',
    },
    repeat: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      description: 'For key: repeat count.',
    },
  },
  required: ['action'],
}

/**
 * Build the tool list. Parameterized by capabilities and coordinate mode so
 * descriptions are honest and unambiguous (plan §1 — "Unfiltered + honest").
 *
 * `coordinateMode` MUST match what the host passes to `scaleCoord` at tool-
 * -call time. Both should read the same frozen-at-load gate constant.
 *
 * `installedAppNames` — optional pre-sanitized list of app display names to
 * enumerate in the `request_access` description. The caller is responsible
 * for sanitization (length cap, character allowlist, sort, count cap) —
 * this function just splices the list into the description verbatim. Omit
 * to fall back to the generic "display names or bundle IDs" wording.
 */
export function buildComputerUseTools(
  caps: {
    screenshotFiltering: 'native' | 'none'
    platform: 'darwin' | 'win32' | 'linux'
    /** Include request_teach_access + teach_step. Read once at server construction. */
    teachMode?: boolean
  },
  coordinateMode: CoordinateMode,
  installedAppNames?: string[],
): Tool[] {
  const coord = COORD_DESC[coordinateMode]

  // Shared hint suffix for BOTH request_access and request_teach_access —
  // they use the same resolveRequestedApps path, so the model should get
  // the same enumeration for both.
  const installedAppsHint =
    installedAppNames && installedAppNames.length > 0
      ? ` Available applications on this machine: ${installedAppNames.join(', ')}.`
      : ''

  // [x, y]` tuple — param shape for all
  // click/move/scroll tools.
  const coordinateTuple = {
    type: 'array',
    items: { type: 'number' },
    minItems: 2,
    maxItems: 2,
    description: `(x, y): ${coord.x}`,
  }
  // Modifier hold during click. Shared across all 5 click variants.
  const clickModifierText = {
    type: 'string',
    description:
      'Modifier keys to hold during the click (e.g. "shift", "ctrl+shift"). Supports the same syntax as the key tool.',
  }

  const screenshotDesc =
    caps.screenshotFiltering === 'native'
      ? 'Take a screenshot of the primary display. Applications not in the session allowlist are excluded at the compositor level — only granted apps and the desktop are visible.'
      : 'Take a screenshot of the primary display. On this platform, screenshots are NOT filtered — all open windows are visible. Input actions targeting apps not in the session allowlist are rejected.'

  return [
    {
      name: 'request_access',
      description:
        'Request user permission to control a set of applications for this session. Must be called before any other tool in this server. ' +
        'The user sees a single dialog listing all requested apps and either allows the whole set or denies it. ' +
        'Call this again mid-session to add more apps; previously granted apps remain granted. ' +
        'Returns the granted apps, denied apps, and screenshot filtering capability.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          apps: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Application display names (e.g. "Slack", "Calendar") or bundle identifiers (e.g. "com.tinyspeck.slackmacgap"). Display names are resolved case-insensitively against installed apps.' +
              installedAppsHint,
          },
          reason: {
            type: 'string',
            description:
              'One-sentence explanation shown to the user in the approval dialog. Explain the task, not the mechanism.',
          },
          clipboardRead: {
            type: 'boolean',
            description:
              "Also request permission to read the user's clipboard (separate checkbox in the dialog).",
          },
          clipboardWrite: {
            type: 'boolean',
            description:
              "Also request permission to write the user's clipboard. When granted, multi-line `type` calls use the clipboard fast path.",
          },
          systemKeyCombos: {
            type: 'boolean',
            description:
              'Also request permission to send system-level key combos (quit app, switch app, lock screen). Without this, those specific combos are blocked.',
          },
        },
        required: ['apps', 'reason'],
      },
    },

    {
      name: 'screenshot',
      description:
        screenshotDesc +
        ' Returns an error if the allowlist is empty. The returned image is what subsequent click coordinates are relative to.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          save_to_disk: {
            type: 'boolean',
            description:
              "Save the image to disk so it can be attached to a message for the user. Returns the saved path in the tool result. Only set this when you intend to share the image — screenshots you're just looking at don't need saving.",
          },
        },
        required: [],
      },
    },

    {
      name: 'zoom',
      description:
        'Take a higher-resolution screenshot of a specific region of the last full-screen screenshot. Use this liberally to inspect small text, button labels, or fine UI details that are hard to read in the downsampled full-screen image. ' +
        'IMPORTANT: Coordinates in subsequent click calls always refer to the full-screen screenshot, never the zoomed image. This tool is read-only for inspecting detail.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          region: {
            type: 'array',
            items: { type: 'integer' },
            minItems: 4,
            maxItems: 4,
            description:
              '(x0, y0, x1, y1): Rectangle to zoom into, in the coordinate space of the most recent full-screen screenshot. x0,y0 = top-left, x1,y1 = bottom-right.',
          },
          save_to_disk: {
            type: 'boolean',
            description:
              'Save the image to disk so it can be attached to a message for the user. Returns the saved path in the tool result. Only set this when you intend to share the image.',
          },
        },
        required: ['region'],
      },
    },

    {
      name: 'left_click',
      description: `Left-click at the given coordinates. ${FRONTMOST_GATE_DESC}`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          coordinate: coordinateTuple,
          text: clickModifierText,
        },
        required: ['coordinate'],
      },
    },

    {
      name: 'double_click',
      description: `Double-click at the given coordinates. Selects a word in most text editors. ${FRONTMOST_GATE_DESC}`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          coordinate: coordinateTuple,
          text: clickModifierText,
        },
        required: ['coordinate'],
      },
    },

    {
      name: 'triple_click',
      description: `Triple-click at the given coordinates. Selects a line in most text editors. ${FRONTMOST_GATE_DESC}`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          coordinate: coordinateTuple,
          text: clickModifierText,
        },
        required: ['coordinate'],
      },
    },

    {
      name: 'right_click',
      description: `Right-click at the given coordinates. Opens a context menu in most applications. ${FRONTMOST_GATE_DESC}`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          coordinate: coordinateTuple,
          text: clickModifierText,
        },
        required: ['coordinate'],
      },
    },

    {
      name: 'middle_click',
      description: `Middle-click (scroll-wheel click) at the given coordinates. ${FRONTMOST_GATE_DESC}`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          coordinate: coordinateTuple,
          text: clickModifierText,
        },
        required: ['coordinate'],
      },
    },

    {
      name: 'type',
      description: `Type text into whatever currently has keyboard focus. ${FRONTMOST_GATE_DESC} Newlines are supported. For keyboard shortcuts use \`key\` instead.`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          text: { type: 'string', description: 'Text to type.' },
        },
        required: ['text'],
      },
    },

    {
      name: 'key',
      description:
        `Press a key or key combination (e.g. "return", "escape", "cmd+a", "ctrl+shift+tab"). ${FRONTMOST_GATE_DESC} ` +
        'System-level combos (quit app, switch app, lock screen) require the `systemKeyCombos` grant — without it they return an error. All other combos work.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          text: {
            type: 'string',
            description: 'Modifiers joined with "+", e.g. "cmd+shift+a".',
          },
          repeat: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            description:
              'Number of times to repeat the key press. Default is 1.',
          },
        },
        required: ['text'],
      },
    },

    {
      name: 'scroll',
      description: `Scroll at the given coordinates. ${FRONTMOST_GATE_DESC}`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          coordinate: coordinateTuple,
          scroll_direction: {
            type: 'string',
            enum: ['up', 'down', 'left', 'right'],
            description: 'Direction to scroll.',
          },
          scroll_amount: {
            type: 'integer',
            minimum: 0,
            maximum: 100,
            description: 'Number of scroll ticks.',
          },
        },
        required: ['coordinate', 'scroll_direction', 'scroll_amount'],
      },
    },

    {
      name: 'left_click_drag',
      description: `Press, move to target, and release. ${FRONTMOST_GATE_DESC}`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          coordinate: {
            ...coordinateTuple,
            description: `(x, y) end point: ${coord.x}`,
          },
          start_coordinate: {
            ...coordinateTuple,
            description: `(x, y) start point. If omitted, drags from the current cursor position. ${coord.x}`,
          },
        },
        required: ['coordinate'],
      },
    },

    {
      name: 'mouse_move',
      description: `Move the mouse cursor without clicking. Useful for triggering hover states. ${FRONTMOST_GATE_DESC}`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          coordinate: coordinateTuple,
        },
        required: ['coordinate'],
      },
    },

    {
      name: 'open_application',
      description:
        'Bring an application to the front, launching it if necessary. The target application must already be in the session allowlist — call request_access first.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          app: {
            type: 'string',
            description:
              'Display name (e.g. "Slack") or bundle identifier (e.g. "com.tinyspeck.slackmacgap").',
          },
        },
        required: ['app'],
      },
    },

    // Window management — Win32 API targeted at bound HWND, no global shortcuts.
    // Only available on Windows when a window is bound via open_application.
    ...(caps.platform === 'win32'
      ? [
          {
            name: 'window_management',
            description:
              'Manage the bound application window via Win32 API calls (ShowWindow, SetWindowPos, SendMessage). ' +
              'All operations target the bound HWND directly — NO global shortcuts (Win+Down, Alt+F4, etc.). ' +
              'The window must have been opened via open_application first. ' +
              'Actions: minimize (hide to taskbar), maximize (fill screen), restore (undo min/max), ' +
              'close (graceful WM_CLOSE), focus (bring to front), move_offscreen (move to -32000,-32000 for background operation). ' +
              'Use move_resize to reposition or resize the window to specific coordinates.',
            inputSchema: {
              type: 'object' as const,
              properties: {
                action: {
                  type: 'string',
                  enum: [
                    'minimize',
                    'maximize',
                    'restore',
                    'close',
                    'focus',
                    'move_offscreen',
                    'move_resize',
                    'get_rect',
                  ],
                  description:
                    'minimize: ShowWindow(SW_MINIMIZE). ' +
                    'maximize: ShowWindow(SW_MAXIMIZE). ' +
                    'restore: ShowWindow(SW_RESTORE) — undo minimize or maximize. ' +
                    'close: SendMessage(WM_CLOSE) — graceful close. ' +
                    'focus: SetForegroundWindow + BringWindowToTop. ' +
                    'move_offscreen: SetWindowPos(-32000,-32000) — keeps window usable by SendMessage/PrintWindow but invisible. ' +
                    'move_resize: SetWindowPos to specific x,y,width,height. ' +
                    'get_rect: GetWindowRect — returns current position and size.',
                },
                x: {
                  type: 'integer',
                  description: 'X position for move_resize.',
                },
                y: {
                  type: 'integer',
                  description: 'Y position for move_resize.',
                },
                width: {
                  type: 'integer',
                  description: 'Width for move_resize.',
                },
                height: {
                  type: 'integer',
                  description: 'Height for move_resize.',
                },
              },
              required: ['action'],
            },
          } as Tool,
          {
            name: 'click_element',
            description:
              'Click a GUI element by its accessible name, role, or automationId — no pixel coordinates needed. ' +
              'Uses Windows UI Automation to find the element and InvokePattern to click it. ' +
              'Prefer this over left_click when the element name is visible in the accessibility snapshot. ' +
              'Falls back to BoundingRect center-click if InvokePattern is not supported.',
            inputSchema: {
              type: 'object' as const,
              properties: {
                name: {
                  type: 'string',
                  description:
                    'Accessible name of the element (e.g. "Save", "File", "Search..."). Case-insensitive partial match.',
                },
                role: {
                  type: 'string',
                  description:
                    'Control type (e.g. "Button", "MenuItem", "Edit", "Link"). Optional — narrows the search.',
                },
                automationId: {
                  type: 'string',
                  description:
                    'Exact automationId from the accessibility snapshot. Most precise selector.',
                },
              },
              required: [],
            },
          } as Tool,
          {
            name: 'type_into_element',
            description:
              'Type text into a named GUI element using Windows UI Automation ValuePattern. ' +
              'Finds the element by name/role/automationId, then sets its value directly — ' +
              'no need to click first or use pixel coordinates. Works on Edit, ComboBox, and other value-holding controls.',
            inputSchema: {
              type: 'object' as const,
              properties: {
                name: {
                  type: 'string',
                  description: 'Accessible name of the target element.',
                },
                role: {
                  type: 'string',
                  description: 'Control type (optional, e.g. "Edit").',
                },
                automationId: {
                  type: 'string',
                  description: 'Exact automationId.',
                },
                text: {
                  type: 'string',
                  description: 'Text to type/set into the element.',
                },
              },
              required: ['text'],
            },
          } as Tool,
          {
            name: 'open_terminal',
            description:
              'Open a new terminal window and launch an AI agent CLI. ' +
              'This is a workflow tool that automates: open terminal → type startup command → press Enter → wait → verify. ' +
              "Supported agents: claude (runs 'claude'), codex (runs 'codex'), gemini (runs 'gemini'), " +
              'or any custom command. After launching, the tool binds to the new terminal window ' +
              'and takes a screenshot to verify the agent started successfully. ' +
              "Use this when the user says: 'open Claude Code', 'start a Codex terminal', 'launch Gemini', etc.",
            inputSchema: {
              type: 'object' as const,
              properties: {
                agent: {
                  type: 'string',
                  enum: ['claude', 'codex', 'gemini', 'custom'],
                  description:
                    'Which agent to launch. ' +
                    "claude: runs 'claude' command. " +
                    "codex: runs 'codex' command. " +
                    "gemini: runs 'gemini' command. " +
                    "custom: runs the command specified in 'command' parameter.",
                },
                command: {
                  type: 'string',
                  description:
                    "Custom command to run in the terminal. Only used when agent='custom'. Example: 'python app.py'",
                },
                terminal: {
                  type: 'string',
                  enum: ['wt', 'powershell', 'cmd'],
                  description:
                    "Which terminal to open. Default: 'wt' (Windows Terminal). 'powershell' for PowerShell window, 'cmd' for Command Prompt.",
                },
                working_directory: {
                  type: 'string',
                  description:
                    'Working directory for the terminal. If omitted, uses current directory.',
                },
              },
              required: ['agent'],
            },
          } as Tool,
          {
            name: 'bind_window',
            description:
              'Bind to a specific window for all subsequent operations (screenshot, click, type, etc.). ' +
              'Once bound, screenshots capture only that window via PrintWindow, and all input goes through SendMessageW — ' +
              "no cursor movement, no focus steal, no interference with the user's desktop. " +
              'Actions: bind (by title, hwnd, or pid), unbind (release binding), status (show current binding), list (show all visible windows). ' +
              "Use 'list' first to see available windows, then 'bind' with a title or hwnd. " +
              'open_application auto-binds the launched window, but use this tool to bind to already-running windows or switch between windows.',
            inputSchema: {
              type: 'object' as const,
              properties: {
                action: {
                  type: 'string',
                  enum: ['bind', 'unbind', 'status', 'list'],
                  description:
                    'bind: Bind to a window (specify title, hwnd, or pid). ' +
                    'unbind: Release the current binding, return to full-screen mode. ' +
                    'status: Show the currently bound window (hwnd, title, rect). ' +
                    'list: List all visible windows with hwnd, pid, and title.',
                },
                title: {
                  type: 'string',
                  description:
                    "Window title to search for (partial match, case-insensitive). For 'bind' action.",
                },
                hwnd: {
                  type: 'string',
                  description:
                    "Exact window handle from 'list' output. For 'bind' action.",
                },
                pid: {
                  type: 'integer',
                  description:
                    "Process ID to find window for. For 'bind' action.",
                },
              },
              required: ['action'],
            },
          } as Tool,
          {
            name: 'activate_window',
            description:
              'Activate the bound window: bring it to foreground, click to ensure keyboard focus, ' +
              'and optionally send an initial key sequence. Use this before any input operations to guarantee ' +
              'the window is ready to receive keyboard/mouse events. ' +
              'Combines SetForegroundWindow + BringWindowToTop + SendMessage(WM_LBUTTONDOWN) in one call.',
            inputSchema: {
              type: 'object' as const,
              properties: {
                click_x: {
                  type: 'integer',
                  description:
                    'X coordinate to click after activation (client-area). If omitted, clicks center of window.',
                },
                click_y: {
                  type: 'integer',
                  description:
                    'Y coordinate to click after activation (client-area). If omitted, clicks center of window.',
                },
              },
              required: [],
            },
          } as Tool,
          {
            name: 'prompt_respond',
            description:
              'Handle interactive CLI/terminal prompts (Yes/No, selection menus, confirmations). ' +
              'Sends a sequence of key events to the bound window to navigate and confirm a prompt. ' +
              'This is a convenience wrapper around bound-window keyboard input for common prompt flows. ' +
              'Typical flows: ' +
              "1) Yes/No prompt → send 'y' or 'n' + Enter. " +
              '2) Arrow-key selection menu → send arrow_down/arrow_up N times + Enter. ' +
              '3) Text input prompt → type the response + Enter. ' +
              'After responding, take a screenshot to verify the result.',
            inputSchema: {
              type: 'object' as const,
              properties: {
                response_type: {
                  type: 'string',
                  enum: ['yes', 'no', 'enter', 'escape', 'select', 'type'],
                  description:
                    "yes: send 'y' + Enter. " +
                    "no: send 'n' + Enter. " +
                    'enter: send Enter only. ' +
                    'escape: send Escape (cancel). ' +
                    "select: use arrow keys to navigate to an option, then Enter. Requires 'arrow_count'. " +
                    "type: type custom text then Enter. Requires 'text'.",
                },
                arrow_direction: {
                  type: 'string',
                  enum: ['up', 'down'],
                  description:
                    "Arrow key direction for 'select' type. Default: 'down'.",
                },
                arrow_count: {
                  type: 'integer',
                  description:
                    "Number of arrow key presses for 'select' type. Default: 1.",
                  minimum: 0,
                  maximum: 50,
                },
                text: {
                  type: 'string',
                  description: "Text to type for 'type' response_type.",
                },
              },
              required: ['response_type'],
            },
          } as Tool,
          {
            name: 'status_indicator',
            description:
              'Control the visual status indicator overlay on the bound window. ' +
              'The indicator is a small floating label at the bottom of the window that shows what Computer Use is doing. ' +
              'It auto-shows during click/type/key/scroll operations, but you can also send custom messages. ' +
              'Actions: show (display a custom message), hide (dismiss), status (check if active).',
            inputSchema: {
              type: 'object' as const,
              properties: {
                action: {
                  type: 'string',
                  enum: ['show', 'hide', 'status'],
                  description:
                    'show: display a custom message on the indicator. hide: dismiss the indicator. status: check if indicator is active.',
                },
                message: {
                  type: 'string',
                  description:
                    "Custom message to display (for 'show' action). Supports emoji. Auto-fades after 2 seconds.",
                },
              },
              required: ['action'],
            },
          } as Tool,
          {
            name: 'virtual_keyboard',
            description:
              'Send keyboard input directly to the bound window via SendMessageW — independent of the physical keyboard. ' +
              'The user can keep typing on their own keyboard without interference. ' +
              'Supports: single keys, key combinations (Ctrl+S, Alt+F4), text input, and hold-key operations. ' +
              'All input targets the bound HWND only — no global keyboard events.',
            inputSchema: {
              type: 'object' as const,
              properties: {
                action: {
                  type: 'string',
                  enum: ['type', 'combo', 'press', 'release', 'hold'],
                  description:
                    'type: Send text string via WM_CHAR (Unicode, supports Chinese/emoji). ' +
                    'combo: Send a key combination like ctrl+s, alt+f4, ctrl+shift+a (press all, release in reverse). ' +
                    "press: Press a key down and hold it (pair with 'release'). " +
                    'release: Release a previously pressed key. ' +
                    'hold: Press key(s) for a duration then release.',
                },
                text: {
                  type: 'string',
                  description:
                    "For 'type': the text to input. For 'combo': key combination string (e.g. 'ctrl+s', 'alt+tab', 'ctrl+shift+a'). For 'press'/'release': single key name (e.g. 'shift', 'ctrl', 'a').",
                },
                duration: {
                  type: 'number',
                  description:
                    "For 'hold': seconds to hold the key(s) before releasing. Default: 1.",
                },
                repeat: {
                  type: 'integer',
                  description:
                    'Number of times to repeat the action. Default: 1.',
                  minimum: 1,
                  maximum: 100,
                },
              },
              required: ['action', 'text'],
            },
          } as Tool,
          {
            name: 'virtual_mouse',
            description:
              'Control a virtual mouse on the bound window via SendMessageW — independent of the physical mouse. ' +
              "The user's real cursor stays free. All operations target the bound HWND only.",
            inputSchema: {
              type: 'object' as const,
              properties: {
                action: {
                  type: 'string',
                  enum: [
                    'click',
                    'double_click',
                    'right_click',
                    'move',
                    'drag',
                    'down',
                    'up',
                  ],
                  description:
                    'click: left-click at coordinate. ' +
                    'double_click: double left-click. ' +
                    'right_click: right-click. ' +
                    'move: move virtual cursor (visual only, no click). ' +
                    'drag: press at start, move to end, release. Requires coordinate (end) and start_coordinate. ' +
                    'down: press left button at coordinate (hold). ' +
                    'up: release left button at coordinate.',
                },
                coordinate: {
                  type: 'array',
                  items: { type: 'number' },
                  minItems: 2,
                  maxItems: 2,
                  description:
                    '(x, y) client-area coordinate on the bound window.',
                },
                start_coordinate: {
                  type: 'array',
                  items: { type: 'number' },
                  minItems: 2,
                  maxItems: 2,
                  description:
                    '(x, y) start point for drag. If omitted, drags from current virtual cursor position.',
                },
              },
              required: ['action', 'coordinate'],
            },
          } as Tool,
          {
            name: 'mouse_wheel',
            description:
              'Scroll inside the bound window using mouse wheel (WM_MOUSEWHEEL / WM_MOUSEHWHEEL). ' +
              "Unlike the generic 'scroll' tool which uses WM_VSCROLL (only works on scrollbar controls), " +
              'mouse_wheel simulates the physical mouse wheel and works on Excel spreadsheets, web pages, ' +
              'code editors, PDF viewers, and any modern UI. ' +
              'Specify the click point within the window where the scroll should occur — ' +
              'this determines which panel/pane/element receives the scroll.',
            inputSchema: {
              type: 'object' as const,
              properties: {
                coordinate: {
                  type: 'array',
                  items: { type: 'number' },
                  minItems: 2,
                  maxItems: 2,
                  description:
                    '(x, y) client-area coordinate where the scroll should occur. Determines which element receives the scroll.',
                },
                delta: {
                  type: 'integer',
                  description:
                    "Scroll amount in 'clicks'. Positive = scroll up, negative = scroll down. Each click = 3 lines typically. Use -3 to -5 for page-like scrolling.",
                },
                direction: {
                  type: 'string',
                  enum: ['vertical', 'horizontal'],
                  description:
                    "Scroll direction. Default: 'vertical'. Use 'horizontal' for side-scrolling (e.g. wide Excel sheets, timeline views).",
                },
              },
              required: ['coordinate', 'delta'],
            },
          } as Tool,
        ]
      : []),

    {
      name: 'switch_display',
      description:
        'Switch which monitor subsequent screenshots capture. Use this when the ' +
        'application you need is on a different monitor than the one shown. ' +
        'The screenshot tool tells you which monitor it captured and lists ' +
        'other attached monitors by name — pass one of those names here. ' +
        'After switching, call screenshot to see the new monitor. ' +
        'Pass "auto" to return to automatic monitor selection.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          display: {
            type: 'string',
            description:
              'Monitor name from the screenshot note (e.g. "Built-in Retina Display", ' +
              '"LG UltraFine"), or "auto" to re-enable automatic selection.',
          },
        },
        required: ['display'],
      },
    },

    {
      name: 'list_granted_applications',
      description:
        'List the applications currently in the session allowlist, plus the active grant flags and coordinate mode. No side effects.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },

    {
      name: 'read_clipboard',
      description:
        'Read the current clipboard contents as text. Requires the `clipboardRead` grant.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },

    {
      name: 'write_clipboard',
      description:
        'Write text to the clipboard. Requires the `clipboardWrite` grant.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          text: { type: 'string' },
        },
        required: ['text'],
      },
    },

    {
      name: 'wait',
      description: 'Wait for a specified duration.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          duration: {
            type: 'number',
            description: 'Duration in seconds (0–100).',
          },
        },
        required: ['duration'],
      },
    },

    {
      name: 'cursor_position',
      description:
        'Get the current mouse cursor position. Returns image-pixel coordinates relative to the most recent screenshot, or logical points if no screenshot has been taken.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },

    {
      name: 'hold_key',
      description:
        `Press and hold a key or key combination for the specified duration, then release. ${FRONTMOST_GATE_DESC} ` +
        'System-level combos require the `systemKeyCombos` grant.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          text: {
            type: 'string',
            description: 'Key or chord to hold, e.g. "space", "shift+down".',
          },
          duration: {
            type: 'number',
            description: 'Duration in seconds (0–100).',
          },
        },
        required: ['text', 'duration'],
      },
    },

    {
      name: 'left_mouse_down',
      description:
        `Press the left mouse button at the current cursor position and leave it held. ${FRONTMOST_GATE_DESC} ` +
        'Use mouse_move first to position the cursor. Call left_mouse_up to release. Errors if the button is already held.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },

    {
      name: 'left_mouse_up',
      description:
        `Release the left mouse button at the current cursor position. ${FRONTMOST_GATE_DESC} ` +
        'Pairs with left_mouse_down. Safe to call even if the button is not currently held.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },

    {
      name: 'computer_batch',
      description:
        'Execute a sequence of actions in ONE tool call. Each individual tool call requires a model→API round trip (seconds); ' +
        'batching a predictable sequence eliminates all but one. Use this whenever you can predict the outcome of several actions ahead — ' +
        'e.g. click a field, type into it, press Return. Actions execute sequentially and stop on the first error. ' +
        `${FRONTMOST_GATE_DESC} The frontmost check runs before EACH action inside the batch — if an action opens a non-allowed app, the next action's gate fires and the batch stops there. ` +
        'Mid-batch screenshot actions are allowed for inspection but coordinates in subsequent clicks always refer to the PRE-BATCH full-screen screenshot.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          actions: {
            type: 'array',
            minItems: 1,
            items: BATCH_ACTION_ITEM_SCHEMA,
            description:
              'List of actions. Example: [{"action":"left_click","coordinate":[100,200]},{"action":"type","text":"hello"},{"action":"key","text":"Return"}]',
          },
        },
        required: ['actions'],
      },
    },

    ...(caps.teachMode ? buildTeachTools(coord, installedAppsHint) : []),
  ]
}

/**
 * Teach-mode tools. Split out so the spread above stays a single expression;
 * takes `coord` so `teach_step.anchor`'s description uses the same
 * frozen coordinate-mode phrasing as click coords, and `installedAppsHint`
 * so `request_teach_access.apps` gets the same enumeration as
 * `request_access.apps` (same resolution path → same hint).
 */
function buildTeachTools(
  coord: { x: string; y: string },
  installedAppsHint: string,
): Tool[] {
  // Shared between teach_step (top-level) and teach_batch (inside steps[]
  // items). Depends on coord, so it lives inside this factory.
  const teachStepProperties = {
    explanation: {
      type: 'string',
      description:
        'Tooltip body text. Explain what the user is looking at and why it matters. ' +
        'This is the ONLY place the user sees your words — be complete but concise.',
    },
    next_preview: {
      type: 'string',
      description:
        'One line describing exactly what will happen when the user clicks Next. ' +
        'Example: "Next: I\'ll click Create Bucket and type the name." ' +
        'Shown below the explanation in a smaller font.',
    },
    anchor: {
      type: 'array',
      items: { type: 'number' },
      minItems: 2,
      maxItems: 2,
      description:
        `(x, y) — where the tooltip arrow points. ${coord.x} ` +
        'Omit to center the tooltip with no arrow (for general-context steps).',
    },
    actions: {
      type: 'array',
      // Empty allowed — "read this, click Next" steps.
      items: BATCH_ACTION_ITEM_SCHEMA,
      description:
        'Actions to execute when the user clicks Next. Same item schema as computer_batch.actions. ' +
        'Empty array is valid for purely explanatory steps. Actions run sequentially and stop on first error.',
    },
  } as const

  return [
    {
      name: 'request_teach_access',
      description:
        'Request permission to guide the user through a task step-by-step with on-screen tooltips. ' +
        'Use this INSTEAD OF request_access when the user wants to LEARN how to do something ' +
        '(phrases like "teach me", "walk me through", "show me how", "help me learn"). ' +
        'On approval the main Claude window hides and a fullscreen tooltip overlay appears. ' +
        'You then call teach_step repeatedly; each call shows one tooltip and waits for the user to click Next. ' +
        'Same app-allowlist semantics as request_access, but no clipboard/system-key flags. ' +
        'Teach mode ends automatically when your turn ends.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          apps: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Application display names (e.g. "Slack", "Calendar") or bundle identifiers. Resolved case-insensitively against installed apps.' +
              installedAppsHint,
          },
          reason: {
            type: 'string',
            description:
              'What you will be teaching. Shown in the approval dialog as "Claude wants to guide you through {reason}". Keep it short and task-focused.',
          },
        },
        required: ['apps', 'reason'],
      },
    },

    {
      name: 'teach_step',
      description:
        'Show one guided-tour tooltip and wait for the user to click Next. On Next, execute the actions, ' +
        'take a fresh screenshot, and return both — you do NOT need a separate screenshot call between steps. ' +
        'The returned image shows the state after your actions ran; anchor the next teach_step against it. ' +
        'IMPORTANT — the user only sees the tooltip during teach mode. Put ALL narration in `explanation`. ' +
        'Text you emit outside teach_step calls is NOT visible until teach mode ends. ' +
        "Pack as many actions as possible into each step's `actions` array — the user waits through " +
        'the whole round trip between clicks, so one step that fills a form beats five steps that fill one field each. ' +
        'Returns {exited:true} if the user clicks Exit — do not call teach_step again after that. ' +
        'Take an initial screenshot before your FIRST teach_step to anchor it.',
      inputSchema: {
        type: 'object' as const,
        properties: teachStepProperties,
        required: ['explanation', 'next_preview', 'actions'],
      },
    },

    {
      name: 'teach_batch',
      description:
        'Queue multiple teach steps in one tool call. Parallels computer_batch: ' +
        'N steps → one model↔API round trip instead of N. Each step still shows a tooltip ' +
        "and waits for the user's Next click, but YOU aren't waiting for a round trip between steps. " +
        'You can call teach_batch multiple times in one tour — treat each batch as one predictable ' +
        'SEGMENT (typically: all the steps on one page). The returned screenshot shows the state ' +
        "after the batch's final actions; anchor the NEXT teach_batch against it. " +
        'WITHIN a batch, all anchors and click coordinates refer to the PRE-BATCH screenshot ' +
        '(same invariant as computer_batch) — for steps 2+ in a batch, either omit anchor ' +
        "(centered tooltip) or target elements you know won't have moved. " +
        'Good pattern: batch 5 tooltips on page A (last step navigates) → read returned screenshot → ' +
        'batch 3 tooltips on page B → done. ' +
        'Returns {exited:true, stepsCompleted:N} if the user clicks Exit — do NOT call again after that; ' +
        '{stepsCompleted, stepFailed, ...} if an action errors mid-batch; ' +
        'otherwise {stepsCompleted, results:[...]} plus a final screenshot. ' +
        'Fall back to individual teach_step calls when you need to react to each intermediate screenshot.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          steps: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: teachStepProperties,
              required: ['explanation', 'next_preview', 'actions'],
            },
            description:
              'Ordered steps. Validated upfront — a typo in step 5 errors before any tooltip shows.',
          },
        },
        required: ['steps'],
      },
    },
  ]
}
