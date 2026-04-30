/**
 * Integration test for BingSearchAdapter — hits the real Bing search.
 *
 * Usage:
 *   bun run src/tools/WebSearchTool/__tests__/bingAdapter.integration.ts
 *
 * Optional env vars:
 *   BING_QUERY  — search query (default: "Claude AI Anthropic")
 */

// Provide MACRO globals needed by the codebase when running outside dev mode
if (!globalThis.MACRO) {
  globalThis.MACRO = { VERSION: '0.0.0-test', BUILD_TIME: '0' } as any
}

import { BingSearchAdapter, extractBingResults } from '../adapters/bingAdapter'

const query = process.env.BING_QUERY || 'Claude AI Anthropic'

async function main() {
  console.log(`\n🔍 Searching Bing for: "${query}"\n`)

  const adapter = new BingSearchAdapter()
  const startTime = Date.now()

  const results = await adapter.search(query, {
    onProgress: (p) => {
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
    console.log('   - Bing returned a CAPTCHA or rate-limited the request')
    console.log('   - Network/firewall issue')
    console.log('   - Bing HTML structure changed')
    console.log('   - Anti-bot detection triggered\n')
    process.exit(1)
  }

  for (const [i, r] of results.entries()) {
    console.log(`  ${i + 1}. ${r.title}`)
    console.log(`     ${r.url}`)
    if (r.snippet) {
      const snippet = r.snippet.replace(/\n/g, ' ')
      console.log(`     ${snippet.slice(0, 150)}${snippet.length > 150 ? '…' : ''}`)
    }
    console.log()
  }

  // Validate result structure
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

main().catch((e) => {
  console.error('❌ Fatal error:', e)
  process.exit(1)
})
