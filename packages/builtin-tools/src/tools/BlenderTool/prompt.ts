export const DESCRIPTION = [
  'Inspect and drive a running Blender session through the addon bridge:',
  'status, scene, selection, select, viewport screenshot, scene export, a',
  'trusted bpy escape hatch, or a staged edit flow (begin_edit, then',
  'edit_blender_selection, then apply_staged or cancel_edit).',
].join(' ')

export const PROMPT = `Talk to the Blender addon on the configured loopback port.

Use this tool for scene inspection and for the operations the addon exposes as
commands:

- \`status\` — is the addon reachable, and which addon/protocol/Blender version?
  A closed port is reported as \`connected: false\`; it is not an error.
- \`scene\` — scene name/file and the object list summary.
- \`selection\` — the current selection, active object and mode.
- \`select\` with \`names\` and an optional \`mode\` (\`OBJECT\`, \`EDIT\`,
  \`VERTEX\`, \`EDGE\`, \`FACE\`). Everything is deselected first, then the
  named objects are selected and the first becomes active. Missing names are
  reported by the addon.
- \`screenshot\` with an optional \`maxSize\` and \`path\` (the image file is
  written on the machine running Blender).
- \`export\` with \`path\` and \`format\` (\`glb\` or \`fbx\`), plus optional
  \`objectNames\` and \`selectionOnly\`.
- \`exec\` with \`code\` — a trusted bpy escape hatch. It runs on Blender's main
  thread with a longer deadline (120 s) and blocks other addon commands while
  it runs.
- \`begin_edit\` — lock the current Blender selection, write the lock state, and
  return a \`lockId\`, the selected object names and a prompt for
  \`edit_blender_selection\`.
- \`apply_staged\` — execute the staged script exactly once and clear the lock.
- \`cancel_edit\` — drop the active lock (an optional \`lockId\` must match).

## Editing a locked selection

For a CLI-only session, call \`begin_edit\` to lock the current selection, then
call \`edit_blender_selection\` with the returned lock id and a bpy script. That
tool validates the script against the locked object scope and stages it. Call
\`apply_staged\` to execute exactly that script and clear the lock, or
\`cancel_edit\` to drop it.

Do NOT use \`exec\` to change objects the user selected for an AI edit, and do
not run a staged script yourself. When the desktop's blender-modeling mod holds
the lock, it shows the staged script and applies it. The lock can be staged only
once and expires after ten minutes.`

export const EDIT_DESCRIPTION = [
  'Validate and stage a Blender Python patch for the objects the user locked.',
  'The script may only name objects in the lock scope, must be syntactically',
  'balanced, and may not import modules or reach the filesystem, network or',
  'process APIs. The tool never executes the script: the user or the CLI',
  'apply_staged action applies it.',
].join(' ')

export const EDIT_PROMPT = `Stage a bpy patch for the currently locked Blender selection.

The blender-modeling plugin locks a selection before asking you to edit it.
The lock records a \`lockId\` and the exact object names you may modify. This
tool is the only write path for model-invented edits; \`blender\`'s \`exec\`
action is an escape hatch, not a way around the lock.

## Rules

- Pass the \`lockId\` the plugin reported to the user. A missing, expired,
  foreign or mismatched lock is rejected and the state file is left untouched.
- \`selectionIds\` is optional. If you supply it, it must exactly equal the
  lock's object list; it is an echo of the scope, never an expansion of it.
- The script must be Blender Python (bpy). It is validated, then staged; it is
  NOT executed by this tool. The user reads it in the desktop panel, or the CLI
  runs it unchanged via \`blender\` action \`apply_staged\`.
- Address every object by its literal name: \`bpy.data.objects["Name"]\`,
  \`bpy.data.objects.get("Name")\`, \`bpy.context.scene.objects[...]\` or
  \`bpy.context.view_layer.objects[...]\`, with names from the lock's
  \`selectionIds\` only. Do not iterate a registry, and do not rely on the
  current selection or active object.
- Brackets and quotes must balance. Imports, \`open()\`, \`exec()\`, \`eval()\`,
  \`compile()\`, \`subprocess\`, \`socket\`, \`os.\`, \`sys.\`, \`shutil\`,
  \`pathlib\`, \`pickle\`, \`marshal\` and double-underscore names are rejected.
- One staged patch may be at most 64 KiB. A lock can be staged only once;
  wait for the UI to apply or cancel it before staging again.
- A rejection writes nothing. An invalid script, a too-large summary or a
  mistyped lockId keeps the lock: fix the cause and call again with the same
  lockId. An expired lock is released; the user has to start a new edit.`
