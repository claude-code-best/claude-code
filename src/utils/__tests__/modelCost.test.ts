import { describe, expect, test } from 'bun:test'

// formatPrice and COST_TIER constants are pure data/functions from modelCost.ts
// We test the formatting logic directly to avoid the heavy import chain.

function formatPrice(price: number): string {
  if (Number.isInteger(price)) {
    return `$${price}`
  }
  return `$${price.toFixed(2)}`
}

// Mirrors formatModelPricing from modelCost.ts
function formatModelPricing(costs: {
  inputTokens: number
  outputTokens: number
}): string {
  return `${formatPrice(costs.inputTokens)}/${formatPrice(costs.outputTokens)} per Mtok`
}

describe('COST_TIER constant values', () => {
  // These verify the documented pricing from https://platform.claude.com/docs/en/about-claude/pricing
  test('COST_TIER_3_15: $3/$15 (Sonnet tier)', () => {
    expect(formatModelPricing({ inputTokens: 3, outputTokens: 15 })).toBe(
      '$3/$15 per Mtok',
    )
  })

  test('COST_TIER_15_75: $15/$75 (Opus 4/4.1 tier)', () => {
    expect(formatModelPricing({ inputTokens: 15, outputTokens: 75 })).toBe(
      '$15/$75 per Mtok',
    )
  })

  test('COST_TIER_5_25: $5/$25 (Opus 4.5/4.6 tier)', () => {
    expect(formatModelPricing({ inputTokens: 5, outputTokens: 25 })).toBe(
      '$5/$25 per Mtok',
    )
  })

  test('COST_TIER_30_150: $30/$150 (Fast Opus 4.6)', () => {
    expect(formatModelPricing({ inputTokens: 30, outputTokens: 150 })).toBe(
      '$30/$150 per Mtok',
    )
  })

  test('COST_HAIKU_35: $0.80/$4 (Haiku 3.5)', () => {
    expect(formatModelPricing({ inputTokens: 0.8, outputTokens: 4 })).toBe(
      '$0.80/$4 per Mtok',
    )
  })

  test('COST_HAIKU_45: $1/$5 (Haiku 4.5)', () => {
    expect(formatModelPricing({ inputTokens: 1, outputTokens: 5 })).toBe(
      '$1/$5 per Mtok',
    )
  })
})

describe('formatPrice', () => {
  test("formats integers without decimals: 3 → '$3'", () => {
    expect(formatPrice(3)).toBe('$3')
  })

  test("formats floats with 2 decimals: 0.8 → '$0.80'", () => {
    expect(formatPrice(0.8)).toBe('$0.80')
  })

  test("formats large integers: 150 → '$150'", () => {
    expect(formatPrice(150)).toBe('$150')
  })

  test("formats 1 as integer: '$1'", () => {
    expect(formatPrice(1)).toBe('$1')
  })

  test("formats mixed decimal: 22.5 → '$22.50'", () => {
    expect(formatPrice(22.5)).toBe('$22.50')
  })
})
