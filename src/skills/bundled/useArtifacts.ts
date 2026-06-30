import { registerBundledSkill } from '../bundledSkills.js'

const USE_ARTIFACTS_PROMPT = `# Using Artifacts

Artifacts are public HTML pages you upload to a hosting service. They have stable URLs that you can share with the user or open in a browser. Use them to surface work-in-progress, summaries, and reports.

## When to use artifacts

**Good artifact content:**
- Progress panels / kanbans (task list with status)
- Research reports and analysis (data + findings + recommendations)
- Design docs / decision records (with context and rationale)
- Data visualizations (tables, SVG charts, flow diagrams)
- Final deliverables (the "thing the user asked for" rendered as HTML)

**Do NOT use artifacts for:**
- Code snippets — use files directly
- One-line answers — keep them in chat
- Internal debug logs — keep them in chat
- Large data dumps — link to source files instead

## Cadence — when to upload

- **Task start**: if the task is complex (multi-step, research, deliverable), upload a skeleton artifact first as scaffolding (placeholder sections).
- **Milestones**: when you complete a phase (research done / implementation done / tests pass), update the artifact.
- **User asks**: upload immediately.
- **Task end**: ship the final artifact as the deliverable.

**Do NOT upload:**
- After every tool call (noise)
- Mid-step with no meaningful change (e.g. fixed a typo)

## How to invoke (deferred tool)

\`artifact\` is a deferred tool. The first call requires two steps; subsequent calls one step.

**First upload (creates a new artifact):**
\`\`\`
1. Use the Write tool to write HTML to a local file (location is your choice).
2. SearchExtraTools({ query: "select:artifact" })   // loads the tool schema
3. ExecuteExtraTool({ tool_name: "artifact", params: { file_path: "<absolute-path>.html" } })
4. Save the returned \`id\` from the tool result — this is the hash.
\`\`\`

**Subsequent updates (overwrites in place, URL stays stable):**
\`\`\`
1. Update the local HTML file.
2. ExecuteExtraTool({ tool_name: "artifact", params: { file_path: "<absolute-path>.html", hash: "<id-from-first-call>" } })
\`\`\`

The URL returned on every call is the same when you pass the same \`hash\`. The user can open it at any time to see the latest version.

## Minimal HTML skeleton

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Artifact Title</title>
  <style>
    body { font: 14px/1.5 -apple-system, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    h1, h2 { color: #1a1a1a; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
  </style>
</head>
<body>
  <h1>Artifact Title</h1>
  <!-- content here -->
</body>
</html>
\`\`\`

The hosting service serves the HTML verbatim (including any \`<script>\` you include), so you can use vanilla JS/SVG/CSS as needed. Do not embed secrets.

## Notes

- Artifacts expire (default 7 days; pass \`ttl: 30\` for 30-day retention).
- Anyone with the URL can view the artifact — treat the URL as the secret.
- The \`/artifacts\` slash command (user-invoked) shows all artifacts uploaded in the current session.
`

export function registerUseArtifactsSkill(): void {
  registerBundledSkill({
    name: 'use-artifacts',
    description:
      'Teach the agent when and how to use the artifact tool: what content belongs in artifacts, when to upload/update, and the SearchExtraTools + ExecuteExtraTool invocation flow for the deferred artifact tool.',
    whenToUse:
      'Use this skill at the start of any complex task that would benefit from a living progress document or a deliverable HTML report.',
    userInvocable: true,
    argumentHint: '[optional focus note]',
    async getPromptForCommand(args) {
      let prompt = USE_ARTIFACTS_PROMPT
      if (args && args.trim().length > 0) {
        prompt += `\n\n## Additional Focus\n\n${args.trim()}\n`
      }
      return [{ type: 'text', text: prompt }]
    },
  })
}
