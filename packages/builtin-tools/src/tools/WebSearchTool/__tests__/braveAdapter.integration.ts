/**
 * Integration test for BraveSearchAdapter — hits Brave's LLM context API.
 *
 * Usage:
 *   BRAVE_SEARCH_API_KEY=... bun run src/tools/WebSearchTool/__tests__/braveAdapter.integration.ts
 *
 * Optional env vars:
 *   BRAVE_QUERY  — search query (default: "Claude AI Anthropic")
 *   BRAVE_API_KEY — fallback key env var
 */

if (!globalThis.MACRO) {
  globalThis.MACRO = { VERSION: '0.0.0-test', BUILD_TIME: '0' } as any
}

import { BraveSearchAdapter } from '../adapters/braveAdapter'

const query = process.env.BRAVE_QUERY || 'Claude AI Anthropic'

async function main() {
  if (!process.env.BRAVE_SEARCH_API_KEY && !process.env.BRAVE_API_KEY) {
    console.error(
      '❌ Missing Brave API key. Set BRAVE_SEARCH_API_KEY or BRAVE_API_KEY.',
    )
    process.exit(1)
  }

  console.log(`\n🔍 Searching Brave for: "${query}"\n`)

  const adapter = new BraveSearchAdapter()
  const startTime = Date.now()

  const results = await adapter.search(query, {
    onProgress: p => {
      if (p.type === 'query_update') {
        console.log(`  → Query sent: ${p.query}`)
      }
      if (p.type === 'search_results_received') {
        console.log(`  → Received ${p.resultCount} results`)
      }
    },
  })

  const elapsed = Date.now() - startTime
  console.log(`\n✅ Done in ${elapsed}ms — ${results.length} result(s)\n`)

  if (results.length === 0) {
    console.log('⚠️  No results returned. Possible causes:')
    console.log('   - Brave returned no grounding data for the query')
    console.log('   - Network/firewall issue')
    console.log('   - Invalid or rate-limited Brave API key\n')
    process.exit(1)
  }

  for (const [i, r] of results.entries()) {
    console.log(`  ${i + 1}. ${r.title}`)
    console.log(`     ${r.url}`)
    if (r.snippet) {
      const snippet = r.snippet.replace(/\n/g, ' ')
      console.log(
        `     ${snippet.slice(0, 150)}${snippet.length > 150 ? '…' : ''}`,
      )
    }
    console.log()
  }

  let passed = true
  for (const [i, r] of results.entries()) {
    if (!r.title || typeof r.title !== 'string') {
      console.error(`❌ Result ${i + 1}: missing or non-string title`, r)
      passed = false
    }
    if (!r.url || !r.url.startsWith('http')) {
      console.error(`❌ Result ${i + 1}: missing or non-http url`, r)
      passed = false
    }
  }

  if (passed) {
    console.log('✅ All results have valid structure.\n')
  } else {
    process.exit(1)
  }
}

if (import.meta.main) {
  main().catch(e => {
    console.error('❌ Fatal error:', e)
    process.exit(1)
  })
}
