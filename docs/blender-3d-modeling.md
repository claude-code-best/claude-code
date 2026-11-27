# Blender 3D modeling (CLI)

Drive a running Blender session from the CLI: inspect the scene, select objects,
capture the viewport, export GLB/FBX, and run a staged, reviewable bpy edit.

## What ships

| Layer | Path |
|---|---|
| TCP bridge + lock state | `src/services/blender/index.ts` |
| `blender` + `edit_blender_selection` tools | `packages/builtin-tools/src/tools/BlenderTool/` |
| Bundled skill | `src/skills/bundled/blenderModeling.ts` |

The Blender side is the **OpenCC Blender Bridge** add-on (BSD-3-Clause,
<https://github.com/sixtysevenlf/dsh-blender-plugin>). It is not bundled here;
install it in Blender (>= 4.2) and start its server from the 3D viewport sidebar
(`N` → OpenCC Blender Bridge → Connect to OpenCC). It listens on
`127.0.0.1:9876`, protocol 11. The server refuses `bpy.app.background`, so run
Blender with a GUI (a virtual display is fine).

## Enable

The tools are on by default. Opt out with:

```sh
export AUTOAGENT_BLENDER=0
```

Optional configuration:

| Variable | Default | Meaning |
|---|---|---|
| `AUTOAGENT_BLENDER_HOST` | `127.0.0.1` | bridge host (loopback only in practice) |
| `AUTOAGENT_BLENDER_PORT` | `9876` | add-on port |
| `AUTOAGENT_BLENDER_TIMEOUT` | `30000` | request timeout, ms |
| `AUTOAGENT_BLENDER_STATE` | per-process runtime file | lock/staged state file |

## Actions

`blender` is one tool with an action switch:

- `status` — connected, add-on/protocol/Blender versions; a closed port is
  `connected: false`, not an error.
- `scene` — scene name/file and object list summary.
- `selection` — current selection, active object and mode.
- `select` — `names: string[]`, optional `mode` (`OBJECT`, `EDIT`, `VERTEX`,
  `EDGE`, `FACE`).
- `screenshot` — optional `maxSize` and `path`; returns the image file written
  on the Blender host.
- `export` — `path`, `format` (`glb`/`fbx`), optional `objectNames`,
  `selectionOnly`.
- `exec` — trusted bpy escape hatch (120 s). Not a shortcut around the lock.
- `begin_edit` — lock the current Blender selection, write `locked`, return
  `lockId`, selected names and a prompt.
- `apply_staged` — execute the staged script exactly once and clear the lock.
- `cancel_edit` — drop the active lock (optional `lockId` must match).

`edit_blender_selection` is the only path for a model-invented edit. It
validates the script against the locked object names (balanced syntax, no
imports, no filesystem/network/process APIs, only literal names from the lock),
writes `staged`, and **never executes**.

## CLI closed loop

```text
blender action=select names=["Cube"]
blender action=begin_edit
  -> { lockId, selectionIds: ["Cube"], prompt }
edit_blender_selection { lockId, script, summary }
  -> staged
blender action=apply_staged      # execute + clear lock
# or
blender action=cancel_edit       # drop lock
```

The lock expires after **10 minutes**. A state file owned by another session is
never written. A rejected script leaves the lock intact; a failed
`apply_staged` aborts the lock and rethrows.

## Whole-scene creation

With nothing selected, `begin_edit` creates a `scope: "scene"` lock instead of
refusing. The script may then create objects or geometry anywhere in the scene;
imports, filesystem/network access and the other dangerous operations are still
rejected. A scene patch is applied without a reselect step; a selection patch
still reselects its locked objects first.

## What was tested

Real Blender **5.2.3 LTS** under a headless X server: `status`, `scene`,
`selection`, `select`, `execute_code`, full-scene and selection-only GLB export,
PNG viewport screenshot, and the CLI loop above (Cube moved from `x=0` to
`x=1`). Automated tests cover framing, protocol mismatch, timeouts, lock
ownership/staleness/exactly-once apply, and staged-script validation. Real
interactive GUI gestures and Blender 4.2/4.3/4.4 are not claimed.
