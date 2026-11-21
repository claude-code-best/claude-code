/**
 * Zod schema for keybindings.json configuration.
 * Used for validation and JSON schema generation.
 */

import { z } from 'zod/v4'
import { lazySchema } from '../utils/lazySchema.js'

/**
 * Valid context names where keybindings can be applied.
 */
export const KEYBINDING_CONTEXTS = [
  'Global',
  'Chat',
  'Autocomplete',
  'Confirmation',
  'Help',
  'Transcript',
  'HistorySearch',
  'Task',
  'ThemePicker',
  'Settings',
  'Tabs',
  // New contexts for keybindings migration
  'Attachments',
  'Footer',
  'MessageSelector',
  'DiffDialog',
  'ModelPicker',
  'Select',
  'Plugin',
  'EffortPanel',
  'Slider',
  'Agents',
] as const

/**
 * Human-readable descriptions for each keybinding context.
 */
export const KEYBINDING_CONTEXT_DESCRIPTIONS: Record<
  (typeof KEYBINDING_CONTEXTS)[number],
  string
> = {
  Global: 'Active everywhere, regardless of focus',
  Chat: 'When the chat input is focused',
  Autocomplete: 'When autocomplete menu is visible',
  Confirmation: 'When a confirmation/permission dialog is shown',
  Help: 'When the help overlay is open',
  Transcript: 'When viewing the transcript',
  HistorySearch: 'When searching command history (ctrl+r)',
  Task: 'When a task/agent is running in the foreground',
  ThemePicker: 'When the theme picker is open',
  Settings: 'When the settings menu is open',
  Tabs: 'When tab navigation is active',
  Attachments: 'When navigating image attachments in a select dialog',
  Footer: 'When footer indicators are focused',
  MessageSelector: 'When the message selector (rewind) is open',
  DiffDialog: 'When the diff dialog is open',
  ModelPicker: 'When the model picker is open',
  Select: 'When a select/list component is focused',
  Plugin: 'When the plugin dialog is open',
  EffortPanel: 'When the effort panel (/effort) is open',
  Slider: 'When a value slider (/autocompact, /scroll-speed) is open',
  Agents: 'When the agents view (`claude agents`) is open',
}

/**
 * All valid keybinding action identifiers.
 */
export const KEYBINDING_ACTIONS = [
  // App-level actions (Global context)
  'app:interrupt',
  'app:exit',
  'app:toggleTodos',
  'app:toggleTranscript',
  'app:toggleBrief',
  'app:toggleTeammatePreview',
  'app:toggleTerminal',
  'app:redraw',
  'app:globalSearch',
  'app:quickOpen',
  // Diff file-list navigation (official 2.1.330: ctrl+up/down, meta+up/down)
  'app:diffFileListUp',
  'app:diffFileListDown',
  // Open the artifact viewer (official: ctrl+])
  'app:openArtifact',
  // Cycle the diff base commit (official DiffPanel: ctrl+x b)
  'app:cycleDiffBase',
  // History navigation
  'history:search',
  'history:previous',
  'history:next',
  // Chat input actions
  'chat:cancel',
  'chat:killAgents',
  'chat:cycleMode',
  'chat:modelPicker',
  'chat:fastMode',
  'chat:thinkingToggle',
  'chat:submit',
  // Explicit submit-or-queue (official 2.1.330: ctrl+x enter). Enter's default
  // chat:submit already falls back to queueing while a query is active;
  // queueSubmit is the separately-bindable explicit form.
  'chat:queueSubmit',
  // Send now: submit immediately, or — with empty input and queued messages —
  // interrupt the current turn so the queue drains now (official: ctrl+enter,
  // ctrl+x ctrl+s; "Press up to edit queued messages, Enter to send them now")
  'chat:sendNow',
  'chat:newline',
  'chat:undo',
  'chat:externalEditor',
  'chat:stash',
  'chat:imagePaste',
  'chat:messageActions',
  // Clear the input box (official: ctrl+l)
  'chat:clearInput',
  // Clear the terminal screen (official: cmd+k)
  'chat:clearScreen',
  // Global effort cycling (official: shift+up / shift+down, ctrl+x = / ctrl+x -)
  'chat:increaseEffort',
  'chat:decreaseEffort',
  // Switch the default model to the newest generation (official: ctrl+y)
  'chat:defaultToNewerModel',
  // Toggle the workflow keyword trigger (official: meta+w)
  'chat:workflowKeywordToggle',
  // Focus view attention navigation + proactivity cycling (official 2.1.330
  // actions; no default bindings, behavior to be aligned later — declared
  // schema-only so custom keybindings.json entries validate)
  'chat:attentionUp',
  'chat:attentionDown',
  'chat:cycleProactivity',
  // Autocomplete menu actions
  'autocomplete:accept',
  'autocomplete:dismiss',
  'autocomplete:previous',
  'autocomplete:next',
  // Confirmation dialog actions
  'confirm:yes',
  'confirm:no',
  'confirm:previous',
  'confirm:next',
  'confirm:nextField',
  'confirm:previousField',
  'confirm:cycleMode',
  'confirm:toggle',
  'confirm:toggleExplanation',
  // Tabs navigation actions
  'tabs:next',
  'tabs:previous',
  // Transcript viewer actions
  'transcript:toggleShowAll',
  'transcript:exit',
  // History search actions
  'historySearch:next',
  'historySearch:accept',
  'historySearch:cancel',
  'historySearch:execute',
  // Task/agent actions
  'task:background',
  // Theme picker actions
  'theme:toggleSyntaxHighlighting',
  // Help menu actions
  'help:dismiss',
  // Attachment navigation (select dialog image attachments)
  'attachments:next',
  'attachments:previous',
  'attachments:remove',
  'attachments:exit',
  // Footer indicator actions
  'footer:up',
  'footer:down',
  'footer:next',
  'footer:previous',
  'footer:openSelected',
  'footer:clearSelection',
  'footer:close',
  // Message selector (rewind) actions
  'messageSelector:up',
  'messageSelector:down',
  'messageSelector:top',
  'messageSelector:bottom',
  'messageSelector:select',
  // Diff dialog actions
  'diff:dismiss',
  'diff:previousSource',
  'diff:nextSource',
  'diff:back',
  'diff:viewDetails',
  'diff:previousFile',
  'diff:nextFile',
  // Scrolling (official 2.1.330 Scroll context + DiffDialog/Transcript/Settings
  // reuse these actions; previously only declared in defaultBindings)
  'scroll:pageUp',
  'scroll:pageDown',
  'scroll:halfPageUp',
  'scroll:halfPageDown',
  'scroll:fullPageUp',
  'scroll:fullPageDown',
  'scroll:lineUp',
  'scroll:lineDown',
  'scroll:top',
  'scroll:bottom',
  // Text selection (official Scroll context: shift+arrows, ctrl+shift+c)
  'selection:copy',
  'selection:extendLeft',
  'selection:extendRight',
  'selection:extendUp',
  'selection:extendDown',
  'selection:extendLineStart',
  'selection:extendLineEnd',
  // Model picker actions (ant-only)
  'modelPicker:decreaseEffort',
  'modelPicker:increaseEffort',
  'modelPicker:toggle1M',
  'modelPicker:thisSessionOnly',
  // Effort panel actions (slash /effort without args)
  'effortPanel:decrease',
  'effortPanel:increase',
  'effortPanel:home',
  'effortPanel:end',
  'effortPanel:confirm',
  'effortPanel:cancel',
  // Shared value slider actions (slash /autocompact & /scroll-speed without
  // args — official 2.1.330 slider)
  'slider:decrease',
  'slider:increase',
  'slider:home',
  'slider:end',
  'slider:confirm',
  'slider:cancel',
  // Select component actions (distinct from confirm: to avoid collisions)
  'select:next',
  'select:previous',
  'select:accept',
  'select:cancel',
  // Paging + jump (official 2.1.330 Select/Settings contexts)
  'select:pageUp',
  'select:pageDown',
  'select:first',
  'select:last',
  // Plugin dialog actions
  'plugin:toggle',
  'plugin:install',
  // Favorite / marketplace cycling (official 2.1.330 Plugin context: f, ctrl+s)
  'plugin:favorite',
  'plugin:cycleMarketplace',
  // Permission dialog actions
  'permission:toggleDebug',
  // Settings config panel actions
  'settings:search',
  'settings:retry',
  'settings:close',
  'select:previousValue',
  'select:nextValue',
  // Voice actions
  'voice:pushToTalk',
  // Agents view actions (official 2.1.330 Agents context, strings L909536).
  // switchView toggles agents/agent (list/detail); togglePin/find/rename and
  // the group navigation are declared + bound so custom keybindings.json
  // entries validate — the view registers no-op handlers for now.
  'agents:switchView',
  'agents:togglePin',
  'agents:find',
  'agents:rename',
  'agents:previousGroup',
  'agents:nextGroup',
] as const

/**
 * Schema for a single keybinding block.
 */
export const KeybindingBlockSchema = lazySchema(() =>
  z
    .object({
      context: z
        .enum(KEYBINDING_CONTEXTS)
        .describe(
          'UI context where these bindings apply. Global bindings work everywhere.',
        ),
      bindings: z
        .record(
          z
            .string()
            .describe('Keystroke pattern (e.g., "ctrl+k", "shift+tab")'),
          z
            .union([
              z.enum(KEYBINDING_ACTIONS),
              z
                .string()
                .regex(/^command:[a-zA-Z0-9:\-_]+$/)
                .describe(
                  'Command binding (e.g., "command:help", "command:compact"). Executes the slash command as if typed.',
                ),
              z.null().describe('Set to null to unbind a default shortcut'),
            ])
            .describe(
              'Action to trigger, command to invoke, or null to unbind',
            ),
        )
        .describe('Map of keystroke patterns to actions'),
    })
    .describe('A block of keybindings for a specific context'),
)

/**
 * Schema for the entire keybindings.json file.
 * Uses object wrapper format with optional $schema and $docs metadata.
 */
export const KeybindingsSchema = lazySchema(() =>
  z
    .object({
      $schema: z
        .string()
        .optional()
        .describe('JSON Schema URL for editor validation'),
      $docs: z.string().optional().describe('Documentation URL'),
      bindings: z
        .array(KeybindingBlockSchema())
        .describe('Array of keybinding blocks by context'),
    })
    .describe(
      'Claude Code keybindings configuration. Customize keyboard shortcuts by context.',
    ),
)

/**
 * TypeScript types derived from the schema.
 */
export type KeybindingsSchemaType = z.infer<
  ReturnType<typeof KeybindingsSchema>
>
