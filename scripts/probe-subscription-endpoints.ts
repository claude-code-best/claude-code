#!/usr/bin/env bun
/**
 * Probe what /v1/* endpoints the subscription OAuth bearer can actually reach.
 *
 * Goal: ground-truth the auth-plane question. Some endpoints in the v2.1.123
 * binary's reverse-engineered list might still accept subscription bearer
 * tokens even though the binary itself only invokes them with workspace API
 * keys. The only way to know is to actually call them and read the status.
 *
 * Strategy: send a low-risk GET to each candidate, record status + body
 * preview. Never POST/DELETE/PATCH (could create/destroy real resources).
 *
 * Run: bun --feature AUTOFIX_PR scripts/probe-subscription-endpoints.ts
 */

import { getOauthConfig } from '../src/constants/oauth.ts'
import {
  getOAuthHeaders,
  prepareApiRequest,
} from '../src/utils/teleport/api.ts'
import { enableConfigs } from '../src/utils/config.ts'

// fork's config layer is gated; main entry calls enableConfigs() before any
// reads. We bypass the entry point so we have to flip the gate ourselves.
enableConfigs()

// Endpoints harvested from `grep -aoE "/v1/[a-z_]+(/[a-z_-]+)*" claude.exe`
const CANDIDATES: Array<{ path: string; betas: string[] }> = [
  // Subscription plane (known-good baseline)
  { path: '/v1/code/triggers', betas: ['ccr-triggers-2026-01-30'] },
  { path: '/v1/code/sessions', betas: [] },
  { path: '/v1/code/github/import-token', betas: [] },
  { path: '/v1/sessions', betas: [] },

  // Workspace plane suspects (the user wants ground-truth)
  {
    path: '/v1/agents',
    betas: ['', 'managed-agents-2026-04-01', 'agents-2026-04-01'],
  },
  {
    path: '/v1/vaults',
    betas: ['', 'managed-agents-2026-04-01', 'vaults-2026-04-01'],
  },
  { path: '/v1/memory_stores', betas: ['', 'managed-agents-2026-04-01'] },
  { path: '/v1/mcp_servers', betas: ['', 'managed-agents-2026-04-01'] },
  { path: '/v1/projects', betas: [''] },
  { path: '/v1/environments', betas: [''] },
  { path: '/v1/environment_providers', betas: [''] },
  { path: '/v1/skills', betas: ['', 'skills-2025-10-02'], query: '?beta=true' },

  // Misc
  { path: '/v1/models', betas: [''] },
  { path: '/v1/files', betas: [''] },
  { path: '/v1/oauth/hello', betas: [''] },
  { path: '/v1/messages/count_tokens', betas: [''] },

  // Workspace fact-check
  { path: '/v1/certs', betas: [''] },
  { path: '/v1/logs', betas: [''] },
  { path: '/v1/traces', betas: [''] },
  { path: '/v1/security/advisories/bulk', betas: [''] },
  { path: '/v1/feedback', betas: [''] },
] as Array<{ path: string; betas: string[]; query?: string }>

async function probe(
  baseUrl: string,
  accessToken: string,
  orgUUID: string,
  candidate: { path: string; betas: string[]; query?: string },
): Promise<void> {
  for (const beta of candidate.betas) {
    const headers: Record<string, string> = {
      ...getOAuthHeaders(accessToken),
      'x-organization-uuid': orgUUID,
    }
    if (beta) headers['anthropic-beta'] = beta
    const url = `${baseUrl}${candidate.path}${candidate.query ?? ''}`
    let status = 0
    let body = ''
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(8000),
      })
      status = res.status
      body = (await res.text()).slice(0, 240).replace(/\s+/g, ' ').trim()
    } catch (e: unknown) {
      body = `(network) ${e instanceof Error ? e.message : String(e)}`
    }
    const betaLabel = beta || '<no-beta>'
    const verdict =
      status >= 200 && status < 300
        ? 'OK'
        : status === 401
          ? 'AUTH'
          : status === 403
            ? 'FORBID'
            : status === 404
              ? 'NF'
              : status === 400
                ? 'BAD'
                : status === 0
                  ? 'NET'
                  : `${status}`
    const padded = candidate.path.padEnd(38)
    const betaPad = betaLabel.padEnd(34)
    console.log(
      `  ${verdict.padEnd(6)} ${padded} ${betaPad}  ${body.slice(0, 110)}`,
    )
  }
}

async function main(): Promise<void> {
  console.log(
    '=== Probe subscription OAuth bearer against /v1/* candidates ===\n',
  )
  const { accessToken, orgUUID } = await prepareApiRequest()
  const baseUrl = getOauthConfig().BASE_API_URL
  const { origin: baseOrigin } = new URL(baseUrl)
  console.log(`base:    ${baseOrigin}`)
  console.log(`orgUUID: ${orgUUID.slice(0, 4)}…\n`)
  console.log(
    '  STATUS PATH                                   BETA HEADER                         RESPONSE PREVIEW',
  )
  console.log(
    '  ------ ------------------------------------   ----------------------------------  ---------------------------------------------',
  )
  for (const c of CANDIDATES) {
    await probe(baseUrl, accessToken, orgUUID, c)
  }
  console.log(
    '\nLegend: OK=2xx  AUTH=401  FORBID=403  NF=404  BAD=400  NET=network/timeout  <num>=other',
  )
}

await main()
