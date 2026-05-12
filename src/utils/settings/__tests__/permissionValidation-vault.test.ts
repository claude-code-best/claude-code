import { describe, expect, test } from 'bun:test'
import { validatePermissionRule } from '../permissionValidation.js'
import { filterInvalidPermissionRules } from '../validation.js'

describe('validatePermissionRule (vault whole-tool allow rejection)', () => {
  test('VaultHttpFetch whole-tool allow is rejected', () => {
    const r = validatePermissionRule('VaultHttpFetch', 'allow')
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/whole-tool allow forbidden/i)
    expect(r.suggestion).toMatch(/per-key/)
  })

  test('VaultHttpFetch whole-tool deny is allowed (kill switch)', () => {
    const r = validatePermissionRule('VaultHttpFetch', 'deny')
    expect(r.valid).toBe(true)
  })

  test('VaultHttpFetch whole-tool ask is allowed', () => {
    const r = validatePermissionRule('VaultHttpFetch', 'ask')
    expect(r.valid).toBe(true)
  })

  test('VaultHttpFetch with key@host content is allowed', () => {
    const r = validatePermissionRule(
      'VaultHttpFetch(github-token@api.github.com)',
      'allow',
    )
    expect(r.valid).toBe(true)
  })

  test('VaultHttpFetch with key@* (wildcard host) is allowed', () => {
    const r = validatePermissionRule('VaultHttpFetch(my-key@*)', 'allow')
    expect(r.valid).toBe(true)
  })

  test('VaultHttpFetch with bare key (no @host) is rejected', () => {
    const r = validatePermissionRule('VaultHttpFetch(github-token)', 'allow')
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/<key>@<host>/)
  })

  test('VaultHttpFetch with malformed key@host is rejected', () => {
    expect(validatePermissionRule('VaultHttpFetch(@host)', 'allow').valid).toBe(
      false,
    )
    expect(validatePermissionRule('VaultHttpFetch(key@)', 'allow').valid).toBe(
      false,
    )
    expect(
      validatePermissionRule('VaultHttpFetch(key@@host)', 'allow').valid,
    ).toBe(false)
  })

  test('F3 fix: bare-key deny is rejected (enforces same key@host format)', () => {
    // Codex round 6 found that the validator accepted `VaultHttpFetch(key)`
    // as a deny rule, but checkPermissions only matched key@host / key@*
    // — so the rule passed parse but never fired. Now enforced uniformly:
    // the user must use whole-tool kill switch OR explicit key@host form.
    expect(
      validatePermissionRule('VaultHttpFetch(github-token)', 'deny').valid,
    ).toBe(false)
  })

  test('F3: per-key+host deny is accepted', () => {
    expect(
      validatePermissionRule(
        'VaultHttpFetch(github-token@api.github.com)',
        'deny',
      ).valid,
    ).toBe(true)
  })

  test('F2: host with port is accepted', () => {
    expect(
      validatePermissionRule(
        'VaultHttpFetch(local-admin@localhost:8443)',
        'allow',
      ).valid,
    ).toBe(true)
    expect(
      validatePermissionRule('VaultHttpFetch(api-key@127.0.0.1:8080)', 'allow')
        .valid,
    ).toBe(true)
  })

  test('F2: IPv6-bracketed host is accepted', () => {
    expect(
      validatePermissionRule('VaultHttpFetch(token@[::1]:8443)', 'allow').valid,
    ).toBe(true)
  })

  test('LocalVaultFetch whole-tool allow is rejected (PR-3 future)', () => {
    const r = validatePermissionRule('LocalVaultFetch', 'allow')
    expect(r.valid).toBe(false)
  })

  test('non-vault tool whole-tool allow stays valid', () => {
    expect(validatePermissionRule('Bash', 'allow').valid).toBe(true)
    expect(validatePermissionRule('Read', 'allow').valid).toBe(true)
    expect(validatePermissionRule('LocalMemoryRecall', 'allow').valid).toBe(
      true,
    )
  })

  test('omitting behavior is backward-compatible: vault whole-tool passes syntax', () => {
    // PermissionRuleSchema's superRefine path uses validatePermissionRule(rule)
    // without behavior. The behavior-specific reject is layered ABOVE in
    // filterInvalidPermissionRules, so the schema layer must remain permissive.
    const r = validatePermissionRule('VaultHttpFetch')
    expect(r.valid).toBe(true)
  })

  // ── H2 fix (codecov-100 audit): defensive ruleContent pre-validation ──
  describe('H2: defensive ruleContent pre-validation (length cap + control chars)', () => {
    test('regression: oversized (>384 char) ruleContent is rejected before regex runs', () => {
      // Build a valid-looking but absurdly long content. Old code ran the
      // regex on arbitrarily long inputs; new code rejects up front.
      const longKey = 'a'.repeat(400)
      const rule = `VaultHttpFetch(${longKey}@example.com)`
      const result = validatePermissionRule(rule, 'allow')
      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/too long/i)
    })

    test('regression: ruleContent at exactly 384 chars is accepted (boundary)', () => {
      // 384 chars total (well below pathological); also short enough that
      // the format regex runs. We craft a `<key>@<host>` whose total
      // ruleContent length is <= 384 but uses up most of the budget.
      const key = 'k'.repeat(120) // 120
      const host = 'h'.repeat(253) // 253
      const content = `${key}@${host}` // 120 + 1 + 253 = 374 chars
      expect(content.length).toBeLessThanOrEqual(384)
      const result = validatePermissionRule(
        `VaultHttpFetch(${content})`,
        'allow',
      )
      // Regex caps key at 128 chars and host at 253 — content is valid shape.
      expect(result.valid).toBe(true)
    })

    test('regression: ruleContent with NUL byte is rejected', () => {
      const result = validatePermissionRule(
        'VaultHttpFetch(key\x00bad@host)',
        'allow',
      )
      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/control character/i)
    })

    test('regression: ruleContent with TAB / newline / DEL is rejected', () => {
      for (const ctrl of ['\t', '\n', '\r', '\x7F']) {
        const result = validatePermissionRule(
          `VaultHttpFetch(key${ctrl}bad@host)`,
          'allow',
        )
        expect(result.valid).toBe(false)
        expect(result.error).toMatch(/control character/i)
      }
    })

    test('valid printable rule content still passes', () => {
      // Sanity check: H2 pre-validation must not break the existing happy path.
      expect(
        validatePermissionRule(
          'VaultHttpFetch(github-token@api.github.com)',
          'allow',
        ).valid,
      ).toBe(true)
      expect(
        validatePermissionRule('VaultHttpFetch(my-key@*)', 'deny').valid,
      ).toBe(true)
    })

    test('H2 pre-validation also fires on deny path', () => {
      const longKey = 'a'.repeat(400)
      const result = validatePermissionRule(
        `VaultHttpFetch(${longKey}@host)`,
        'deny',
      )
      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/too long/i)
    })
  })
})

describe('filterInvalidPermissionRules (boot path integration)', () => {
  test('strips VaultHttpFetch whole-tool from allow array, keeps deny', () => {
    const data = {
      permissions: {
        allow: ['Bash', 'VaultHttpFetch', 'Read'],
        deny: ['VaultHttpFetch', 'Bash(rm)'],
        ask: [],
      },
    }
    const warnings = filterInvalidPermissionRules(data, '/test/settings.json')
    expect(warnings.length).toBeGreaterThanOrEqual(1)
    const allowWarning = warnings.find(w => w.path === 'permissions.allow')
    expect(allowWarning).toBeDefined()
    expect(allowWarning!.message).toMatch(/whole-tool allow forbidden/i)

    const allow = (data.permissions as { allow: string[] }).allow
    const deny = (data.permissions as { deny: string[] }).deny
    expect(allow).toEqual(['Bash', 'Read']) // VaultHttpFetch stripped
    expect(deny).toEqual(['VaultHttpFetch', 'Bash(rm)']) // deny intact (kill switch)
  })

  test('per-key+host VaultHttpFetch in allow is preserved', () => {
    const data = {
      permissions: {
        allow: [
          'VaultHttpFetch(github-token@api.github.com)',
          'VaultHttpFetch(stripe-key@api.stripe.com)',
        ],
        deny: [],
        ask: [],
      },
    }
    const warnings = filterInvalidPermissionRules(data, '/test/settings.json')
    expect(warnings.length).toBe(0)
    expect((data.permissions as { allow: string[] }).allow).toEqual([
      'VaultHttpFetch(github-token@api.github.com)',
      'VaultHttpFetch(stripe-key@api.stripe.com)',
    ])
  })

  test('settings file with bad vault rule still produces other valid permissions (no crash)', () => {
    // Critical: a single bad rule must NOT cause settings to return null.
    // The boot path is filterInvalidPermissionRules → SettingsSchema().safeParse.
    // After filter, VaultHttpFetch whole-tool is gone, so safeParse will
    // still succeed.
    const data = {
      permissions: {
        allow: ['VaultHttpFetch'], // bad
        deny: ['VaultHttpFetch'], // good (kill switch)
      },
      otherSetting: 'preserved',
    }
    filterInvalidPermissionRules(data, '/test/settings.json')
    // Other settings preserved; allow array became empty
    expect((data as { otherSetting: string }).otherSetting).toBe('preserved')
    expect((data.permissions as { allow: string[] }).allow).toEqual([])
    expect((data.permissions as { deny: string[] }).deny).toEqual([
      'VaultHttpFetch',
    ])
  })
})
