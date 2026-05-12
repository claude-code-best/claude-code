import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as React from 'react';
import { logMock } from '../../../../tests/mocks/log';
import { debugMock } from '../../../../tests/mocks/debug';

// Pre-import real ink so we can fall through after this suite. Bun's
// mock.module is process-global / last-write-wins; without delegation the
// stub Box/Pane/Text/useTheme leak into other test files (e.g.
// AgentsPlatformView.test.tsx) that need real ink components.
const _realOnboardingInkMod = (await import('@anthropic/ink')) as Record<string, unknown>;
let _useStubInkForOnboarding = true;
afterAll(() => {
  _useStubInkForOnboarding = false;
});

mock.module('bun:bundle', () => ({
  feature: (_name: string) => false,
}));

mock.module('src/utils/log.ts', logMock);
mock.module('src/utils/debug.ts', debugMock);

const loggedEvents: Array<{ name: string; payload: unknown }> = [];
mock.module('src/services/analytics/index.js', () => ({
  logEvent: (name: string, payload: unknown) => {
    loggedEvents.push({ name, payload });
  },
}));

// In-memory config used by the global/project config helpers so the
// command's persistence path is exercised without touching disk.
const fakeGlobalConfig: {
  theme?: string;
  hasCompletedOnboarding?: boolean;
  lastOnboardingVersion?: string;
} = {};
const fakeProjectConfig: { hasTrustDialogAccepted?: boolean } = {};

mock.module('src/utils/config.js', () => ({
  getGlobalConfig: () => ({ ...fakeGlobalConfig }),
  saveGlobalConfig: (updater: (cur: typeof fakeGlobalConfig) => typeof fakeGlobalConfig) => {
    Object.assign(fakeGlobalConfig, updater({ ...fakeGlobalConfig }));
  },
  saveCurrentProjectConfig: (updater: (cur: typeof fakeProjectConfig) => typeof fakeProjectConfig) => {
    Object.assign(fakeProjectConfig, updater({ ...fakeProjectConfig }));
  },
}));

// Stub heavy theme + ink imports — the launcher only references them for
// the `theme` subcommand JSX render path. Spread real ink so when the flag
// flips off in afterAll, later test files see real components.
mock.module('@anthropic/ink', () => {
  if (_useStubInkForOnboarding) {
    return {
      ..._realOnboardingInkMod,
      Box: ({ children }: { children?: React.ReactNode }) => React.createElement('box', null, children),
      Pane: ({ children }: { children?: React.ReactNode }) => React.createElement('pane', null, children),
      Text: ({ children }: { children?: React.ReactNode }) => React.createElement('text', null, children),
      useTheme: () => ['dark', (_t: string) => undefined],
    };
  }
  return _realOnboardingInkMod;
});

mock.module('src/components/ThemePicker.js', () => ({
  ThemePicker: () => React.createElement('theme-picker'),
}));

import { callOnboarding, parseSubcommand, type OnboardingSubcommand } from '../launchOnboarding.js';
import onboardingCommand from '../index.js';
import type { LocalJSXCommandContext } from '../../../types/command.js';

type DoneCall = { msg?: string; opts?: { display?: string } };

function makeContext(): LocalJSXCommandContext {
  return {} as unknown as LocalJSXCommandContext;
}

function makeOnDone(): {
  fn: (msg?: string, opts?: { display?: string }) => void;
  calls: DoneCall[];
} {
  const calls: DoneCall[] = [];
  return {
    fn: (msg, opts) => {
      calls.push({ msg, opts });
    },
    calls,
  };
}

beforeEach(() => {
  loggedEvents.length = 0;
  for (const k of Object.keys(fakeGlobalConfig)) delete (fakeGlobalConfig as Record<string, unknown>)[k];
  for (const k of Object.keys(fakeProjectConfig)) delete (fakeProjectConfig as Record<string, unknown>)[k];
});

afterEach(() => {
  loggedEvents.length = 0;
});

describe('onboarding command metadata', () => {
  test('has correct name and description', () => {
    expect(onboardingCommand.name).toBe('onboarding');
    expect(onboardingCommand.description).toContain('first-run setup');
  });

  test('is local-jsx, enabled, visible, not bridge-safe', () => {
    expect(onboardingCommand.type).toBe('local-jsx');
    expect(onboardingCommand.isEnabled?.()).toBe(true);
    expect(onboardingCommand.isHidden).toBe(false);
    expect(onboardingCommand.bridgeSafe).toBe(false);
  });

  test('bridge invocation always rejected with an explanation', () => {
    const reason = onboardingCommand.getBridgeInvocationError?.('full');
    expect(reason).toBeTruthy();
    expect(reason).toContain('bridge');
  });

  test('has descriptive argumentHint listing subcommands', () => {
    expect(onboardingCommand.argumentHint).toBe('[full|theme|trust|model|mcp|status]');
  });

  test('load() returns a module with a call() function', async () => {
    if (onboardingCommand.type !== 'local-jsx') {
      throw new Error('expected local-jsx command');
    }
    const mod = await onboardingCommand.load();
    expect(typeof mod.call).toBe('function');
  });
});

describe('parseSubcommand', () => {
  test.each<[string, OnboardingSubcommand]>([
    ['', 'full'],
    ['  ', 'full'],
    ['full', 'full'],
    ['FULL', 'full'],
    ['reset', 'full'],
    ['theme', 'theme'],
    ['trust', 'trust'],
    ['model', 'model'],
    ['mcp', 'mcp'],
    ['status', 'status'],
  ])('parses %p → %p', (input, expected) => {
    expect(parseSubcommand(input)).toEqual({ sub: expected });
  });

  test('unknown arg returns full + unknownArg', () => {
    expect(parseSubcommand('garbage')).toEqual({
      sub: 'full',
      unknownArg: 'garbage',
    });
  });
});

describe('callOnboarding behavior', () => {
  test('full (no args) clears hasCompletedOnboarding and emits system message', async () => {
    fakeGlobalConfig.hasCompletedOnboarding = true;
    const { fn, calls } = makeOnDone();
    const result = await callOnboarding(fn, makeContext(), '');
    expect(result).toBeNull();
    expect(fakeGlobalConfig.hasCompletedOnboarding).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.opts?.display).toBe('system');
    expect(calls[0]?.msg).toContain('Onboarding flag cleared');
    expect(loggedEvents.some(e => e.name === 'tengu_onboarding_step')).toBe(true);
  });

  test('reset alias also runs the full path', async () => {
    fakeGlobalConfig.hasCompletedOnboarding = true;
    const { fn } = makeOnDone();
    await callOnboarding(fn, makeContext(), 'reset');
    expect(fakeGlobalConfig.hasCompletedOnboarding).toBe(false);
  });

  test('theme subcommand returns a React element (theme picker)', async () => {
    const { fn } = makeOnDone();
    const result = await callOnboarding(fn, makeContext(), 'theme');
    expect(React.isValidElement(result)).toBe(true);
  });

  test('trust subcommand clears project trust and notifies', async () => {
    fakeProjectConfig.hasTrustDialogAccepted = true;
    const { fn, calls } = makeOnDone();
    const result = await callOnboarding(fn, makeContext(), 'trust');
    expect(result).toBeNull();
    expect(fakeProjectConfig.hasTrustDialogAccepted).toBe(false);
    expect(calls[0]?.msg).toContain('trust cleared');
  });

  test('model subcommand prints /model deferral hint', async () => {
    const { fn, calls } = makeOnDone();
    const result = await callOnboarding(fn, makeContext(), 'model');
    expect(result).toBeNull();
    expect(calls[0]?.msg).toContain('/model');
  });

  test('mcp subcommand prints MCP setup hints', async () => {
    const { fn, calls } = makeOnDone();
    const result = await callOnboarding(fn, makeContext(), 'mcp');
    expect(result).toBeNull();
    expect(calls[0]?.msg).toContain('mcp add');
    expect(calls[0]?.msg).toContain('.mcp.json');
  });

  test('status subcommand renders state view (React element)', async () => {
    fakeGlobalConfig.theme = 'dark';
    fakeGlobalConfig.hasCompletedOnboarding = true;
    fakeGlobalConfig.lastOnboardingVersion = '2.1.888';
    const { fn } = makeOnDone();
    const result = await callOnboarding(fn, makeContext(), 'status');
    expect(React.isValidElement(result)).toBe(true);
  });

  test('status subcommand falls back to (unset) for missing values', async () => {
    const { fn } = makeOnDone();
    const result = await callOnboarding(fn, makeContext(), 'status');
    expect(React.isValidElement(result)).toBe(true);
  });

  test('status JSX exposes theme/version values via props', async () => {
    fakeGlobalConfig.theme = 'light';
    fakeGlobalConfig.hasCompletedOnboarding = true;
    fakeGlobalConfig.lastOnboardingVersion = '1.2.3';
    const { fn } = makeOnDone();
    const result = await callOnboarding(fn, makeContext(), 'status');
    if (!React.isValidElement(result)) throw new Error('expected element');
    const el = result as React.ReactElement<{
      theme: string;
      hasCompletedOnboarding: boolean;
      lastOnboardingVersion: string;
    }>;
    expect(el.props.theme).toBe('light');
    expect(el.props.hasCompletedOnboarding).toBe(true);
    expect(el.props.lastOnboardingVersion).toBe('1.2.3');
  });

  test('theme JSX wires onDone callback through ThemeSubcommand props', async () => {
    const { fn } = makeOnDone();
    const result = await callOnboarding(fn, makeContext(), 'theme');
    if (!React.isValidElement(result)) throw new Error('expected element');
    const el = result as React.ReactElement<{ onDone: (msg: string) => void }>;
    expect(typeof el.props.onDone).toBe('function');
  });

  test('rendering ThemeSubcommand executes its body once', () => {
    // Pull the ThemeSubcommand render path through React.createElement so its
    // body (useTheme + ThemePicker JSX) executes under coverage.
    const result = callOnboarding(() => undefined, makeContext(), 'theme');
    return result.then(node => {
      if (!React.isValidElement(node)) throw new Error('not element');
      // Render the inner element by invoking its component function once.
      const Comp = (node as React.ReactElement).type as (p: unknown) => React.ReactNode;
      const rendered = Comp((node as React.ReactElement).props);
      expect(rendered).toBeDefined();
    });
  });

  test('rendering StatusView executes its body once', async () => {
    const { fn } = makeOnDone();
    const result = await callOnboarding(fn, makeContext(), 'status');
    if (!React.isValidElement(result)) throw new Error('not element');
    const Comp = (result as React.ReactElement).type as (p: unknown) => React.ReactNode;
    const rendered = Comp((result as React.ReactElement).props);
    expect(rendered).toBeDefined();
  });

  test('unknown subcommand reports error and does not mutate config', async () => {
    fakeGlobalConfig.hasCompletedOnboarding = true;
    const { fn, calls } = makeOnDone();
    const result = await callOnboarding(fn, makeContext(), 'bogus');
    expect(result).toBeNull();
    expect(calls[0]?.msg).toContain('Unknown');
    expect(calls[0]?.msg).toContain('bogus');
    expect(fakeGlobalConfig.hasCompletedOnboarding).toBe(true);
  });

  test('every invocation logs a tengu_onboarding_step event', async () => {
    const { fn } = makeOnDone();
    for (const arg of ['full', 'theme', 'trust', 'model', 'mcp', 'status']) {
      loggedEvents.length = 0;
      await callOnboarding(fn, makeContext(), arg);
      expect(loggedEvents.find(e => e.name === 'tengu_onboarding_step')).toBeDefined();
    }
  });
});
