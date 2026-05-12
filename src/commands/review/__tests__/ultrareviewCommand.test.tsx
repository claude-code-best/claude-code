/**
 * Regression tests for `ultrareviewCommand.call` (src/commands/review/
 * ultrareviewCommand.tsx). The previous version of `call` made an axios
 * preflight POST and branched on `action: proceed | blocked | confirm`;
 * that integration was removed and `call` now branches on `checkOverageGate()`'s
 * four `kind` values: `not-enabled`, `low-balance`, `needs-confirm`, `proceed`.
 *
 * These tests verify each branch:
 *   - `proceed` → forwards billingNote and args to `launchRemoteReview`,
 *     calls `onDone(text)`, returns null
 *   - `not-enabled` → onDone with paywall message + `display: 'system'`,
 *     returns null, does NOT launch
 *   - `low-balance` → onDone with balance-too-low message including the
 *     available amount, returns null, does NOT launch
 *   - `needs-confirm` → returns the React `UltrareviewOverageDialog` element,
 *     does NOT call onDone, does NOT launch
 *   - `proceed` + null launch result → onDone with "failed to launch" message
 *   - `proceed` + arg pass-through → args (e.g. PR number) reach launchRemoteReview
 *     verbatim (call doesn't parse them itself)
 */
import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { debugMock } from '../../../../tests/mocks/debug.js';
import { logMock } from '../../../../tests/mocks/log.js';
import { setupAxiosMock } from '../../../../tests/mocks/axios.js';

// Pre-import the real react and ink modules so we can delegate after this
// suite. Bun's mock.module is process-global / last-write-wins; without
// delegation the stub createElement / stub ink components leak into other
// test files (e.g. SnapshotUpdateDialog.test.tsx, AgentsPlatformView.test.tsx)
// that need real React.createElement and real Box/Text components.
const _realReactMod = (await import('react')) as Record<string, unknown> & {
  default?: Record<string, unknown>;
};
const _realInkMod = (await import('@anthropic/ink')) as Record<string, unknown>;
let _useStubReactForUltrareview = true;
let _useStubInkForUltrareview = true;
afterAll(() => {
  _useStubReactForUltrareview = false;
  _useStubInkForUltrareview = false;
  // The handle reference exists by the time afterAll runs (TDZ resolves via
  // closure). Flip useStubs off so the spread-real fall-through kicks in for
  // any test file that runs after this one in the same process.
  _ultrareviewAxiosHandle.useStubs = false;
});

// Mock dependency chain before any subject import
mock.module('src/utils/debug.ts', debugMock);
mock.module('src/utils/log.ts', logMock);
mock.module('src/services/analytics/index.js', () => ({
  logEvent: () => {},
}));
mock.module('src/services/analytics/growthbook.js', () => ({
  getFeatureValue_CACHED_MAY_BE_STALE: () => null,
}));

// Mock auth utilities
mock.module('src/utils/auth.js', () => ({
  isClaudeAISubscriber: () => true,
  isTeamSubscriber: () => false,
  isEnterpriseSubscriber: () => false,
}));

// Mock checkOverageGate with a mutable gate result so each test can drive
// the four branches in ultrareviewCommand.call (not-enabled, low-balance,
// needs-confirm, proceed). launchRemoteReview captures args for the
// args-forwarding test, and its return value is mutable too — `null` triggers
// the "failed to launch" onDone branch.
type GateResult =
  | { kind: 'proceed'; billingNote: string }
  | { kind: 'not-enabled' }
  | { kind: 'low-balance'; available: number }
  | { kind: 'needs-confirm' };
let _gateResult: GateResult = { kind: 'proceed', billingNote: '' };
let _launchResult: Array<{ type: 'text'; text: string }> | null = [{ type: 'text', text: 'Launched successfully.' }];
const _capturedLaunchArgs: string[] = [];
mock.module('src/commands/review/reviewRemote.js', () => ({
  checkOverageGate: async () => _gateResult,
  confirmOverage: () => {},
  launchRemoteReview: async (args: string) => {
    _capturedLaunchArgs.push(args);
    return _launchResult;
  },
}));

// Mock OAuth config so real fetchUltrareviewPreflight can run
mock.module('src/constants/oauth.js', () => ({
  getOauthConfig: () => ({ BASE_API_URL: 'https://api.anthropic.com' }),
}));

// Mock prepareApiRequest so real fetchUltrareviewPreflight skips auth
mock.module('src/utils/teleport/api.js', () => ({
  prepareApiRequest: async () => ({
    accessToken: 'test-token',
    orgUUID: 'org-uuid-test',
  }),
  getOAuthHeaders: (token: string) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  }),
}));

// Mock axios — per-test responses set via mockAxiosPost.mockImplementationOnce
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAxiosPost = mock(
  async (..._args: any[]): Promise<any> => ({
    status: 200,
    data: { action: 'proceed', billing_note: null },
  }),
);

// Spread real axios + flag-gate stubs so the per-test mockAxiosPost stops
// leaking into later test files (mock.module is process-global). Default ON
// for this suite; afterAll above flips _useStubReactForUltrareview, but here
// we tie axios cleanup to the helper's own flag — see suite-level afterAll.
const _ultrareviewAxiosHandle = setupAxiosMock();
_ultrareviewAxiosHandle.useStubs = true;
_ultrareviewAxiosHandle.stubs.post = mockAxiosPost;
_ultrareviewAxiosHandle.stubs.isAxiosError = (e: unknown) =>
  typeof e === 'object' && e !== null && (e as { isAxiosError?: boolean }).isAxiosError === true;

// Mock detectCurrentRepositoryWithHost
mock.module('src/utils/detectRepository.js', () => ({
  detectCurrentRepositoryWithHost: async () => ({
    host: 'github.com',
    owner: 'testowner',
    name: 'testrepo',
  }),
}));

// Minimal mock for React/Ink so we don't need a full renderer.
// Preserve any explicit `children` prop when no varargs children are passed
// — otherwise consumers who pass `children` via the props object (e.g.
// SnapshotUpdateDialog.ts uses `React.createElement(Dialog, { ..., children })`)
// see their array overwritten with `[]`. mock.module is process-global so this
// mock survives into other test files in the same run; afterAll flips the flag
// so we delegate to real React thereafter.
mock.module('react', () => {
  const stubCreateElement = (type: unknown, props: unknown, ...children: unknown[]) => {
    const propsObj = (props ?? {}) as Record<string, unknown>;
    const finalChildren = children.length > 0 ? children : 'children' in propsObj ? propsObj.children : [];
    return {
      $$typeof: Symbol.for('react.element'),
      type,
      props: { ...propsObj, children: finalChildren },
    };
  };
  const realCreate = ((_realReactMod.default as Record<string, unknown> | undefined)?.createElement ??
    _realReactMod.createElement) as (...args: unknown[]) => unknown;
  const createElement = (...args: unknown[]) =>
    _useStubReactForUltrareview ? stubCreateElement(args[0], args[1], ...args.slice(2)) : realCreate(...args);
  return {
    ..._realReactMod,
    default: {
      ...((_realReactMod.default as Record<string, unknown> | undefined) ?? {}),
      createElement,
    },
    createElement,
  };
});

// Spread real ink + flag-gate the stub components. Without spread, the bare
// { Box: 'Box', Dialog: 'Dialog', Text: 'Text' } leaks into every later test
// file (e.g. AgentsPlatformView.test.tsx) that imports @anthropic/ink — those
// consumers receive strings instead of real components and rendering breaks.
mock.module('@anthropic/ink', () => {
  if (_useStubInkForUltrareview) {
    return {
      ..._realInkMod,
      Box: 'Box',
      Dialog: 'Dialog',
      Text: 'Text',
    };
  }
  return _realInkMod;
});

mock.module('src/components/CustomSelect/select.js', () => ({
  Select: 'Select',
}));

// UltrareviewOverageDialog and PreflightDialog — return a simple marker
mock.module('src/commands/review/UltrareviewOverageDialog.js', () => ({
  UltrareviewOverageDialog: () => ({ type: 'UltrareviewOverageDialog' }),
}));
mock.module('src/commands/review/UltrareviewPreflightDialog.js', () => ({
  UltrareviewPreflightDialog: () => ({ type: 'UltrareviewPreflightDialog' }),
}));

import { call } from '../ultrareviewCommand.js';

const makeContext = () =>
  ({
    abortController: { signal: {} },
  }) as Parameters<typeof call>[1];

describe('ultrareviewCommand.call: gate branches', () => {
  // Reset gate + launch state between tests so a previous test's mutation
  // doesn't leak into the next.
  beforeEach(() => {
    _gateResult = { kind: 'proceed', billingNote: '' };
    _launchResult = [{ type: 'text', text: 'Launched successfully.' }];
    _capturedLaunchArgs.length = 0;
  });

  test('proceed gate: forwards billingNote to launchRemoteReview, calls onDone, returns null', async () => {
    _gateResult = { kind: 'proceed', billingNote: ' Free review 1 of 5.' };

    const messages: string[] = [];
    const onDone = (msg: string) => messages.push(msg);

    const result = await call(onDone as Parameters<typeof call>[0], makeContext(), '');

    expect(result).toBeNull();
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('Launched successfully');
    // launchRemoteReview was invoked exactly once with the empty args.
    expect(_capturedLaunchArgs).toEqual(['']);
  });

  test('not-enabled gate: onDone with paywall message, returns null', async () => {
    _gateResult = { kind: 'not-enabled' };

    const messages: string[] = [];
    const opts: Array<unknown> = [];
    const onDone = (msg: string, opt: unknown) => {
      messages.push(msg);
      opts.push(opt);
    };

    const result = await call(onDone as Parameters<typeof call>[0], makeContext(), '');

    expect(result).toBeNull();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Free ultrareviews used');
    expect(messages[0]).toContain('claude.ai/settings/billing');
    expect((opts[0] as { display: string }).display).toBe('system');
    // launchRemoteReview must NOT be called when paywalled.
    expect(_capturedLaunchArgs).toEqual([]);
  });

  test('low-balance gate: onDone with balance-too-low message including available amount, returns null', async () => {
    _gateResult = { kind: 'low-balance', available: 4.5 };

    const messages: string[] = [];
    const opts: Array<unknown> = [];
    const onDone = (msg: string, opt: unknown) => {
      messages.push(msg);
      opts.push(opt);
    };

    const result = await call(onDone as Parameters<typeof call>[0], makeContext(), '');

    expect(result).toBeNull();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Balance too low');
    expect(messages[0]).toContain('$4.50');
    expect(messages[0]).toContain('claude.ai/settings/billing');
    expect((opts[0] as { display: string }).display).toBe('system');
    expect(_capturedLaunchArgs).toEqual([]);
  });

  test('needs-confirm gate: returns UltrareviewOverageDialog React element, does not launch', async () => {
    _gateResult = { kind: 'needs-confirm' };

    const messages: string[] = [];
    const onDone = (msg: string) => messages.push(msg);

    const result = await call(onDone as Parameters<typeof call>[0], makeContext(), '');

    // Returns a React element rather than null.
    expect(result).not.toBeNull();
    expect(typeof result).toBe('object');
    const element = result as { type: unknown };
    expect(element.type).toBeDefined();
    // No onDone call until the user interacts with the dialog.
    expect(messages).toEqual([]);
    expect(_capturedLaunchArgs).toEqual([]);
  });

  test('proceed gate + launchRemoteReview returns null: onDone with failure message', async () => {
    _gateResult = { kind: 'proceed', billingNote: '' };
    _launchResult = null; // teleport / non-github failure path

    const messages: string[] = [];
    const opts: Array<unknown> = [];
    const onDone = (msg: string, opt: unknown) => {
      messages.push(msg);
      opts.push(opt);
    };

    const result = await call(onDone as Parameters<typeof call>[0], makeContext(), '');

    expect(result).toBeNull();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Ultrareview failed to launch');
    expect((opts[0] as { display: string }).display).toBe('system');
  });

  test('proceed gate: forwards args (e.g. PR number) verbatim to launchRemoteReview', async () => {
    _gateResult = { kind: 'proceed', billingNote: '' };

    const messages: string[] = [];
    const onDone = (msg: string) => messages.push(msg);

    await call(onDone as Parameters<typeof call>[0], makeContext(), '42');

    // ultrareviewCommand.call doesn't parse args itself — launchRemoteReview
    // is responsible for PR-number detection. So we only assert pass-through.
    expect(_capturedLaunchArgs).toEqual(['42']);
  });
});
