import * as React from 'react';
import { Slider, type SliderItem } from '../../components/Slider.js';
import { logEvent } from '../../services/analytics/index.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { getInitialSettings, updateSettingsForSource } from '../../utils/settings/settings.js';
import {
  SCROLL_SPEED_DEFAULT,
  SCROLL_SPEED_MAX,
  SCROLL_SPEED_VALUES,
  parseScrollSpeed,
  resolveScrollSpeedBase,
} from '../../utils/scrollSpeed.js';

/**
 * /scroll-speed — official 2.1.330 alignment: a slider showing every value,
 * Home/End jump to the ends, Enter confirms, Esc cancels.
 *
 * The adjustable point is the wheel-acceleration *base* — rows scrolled per
 * wheel event before acceleration ramps (see
 * src/components/ScrollKeybindingHandler.tsx). The value persists to the
 * `scrollSpeed` settings key and applies live (the handler re-syncs the
 * base on every wheel event). The CLAUDE_CODE_SCROLL_SPEED env var still
 * wins as an override, like CLAUDE_CODE_EFFORT_LEVEL does for /effort.
 */

const COMMON_HELP_ARGS = ['help', '-h', '--help'];

type ScrollSpeedCommandResult = {
  message: string;
};

/** Env override: wins at resolve time, so flag it when it conflicts. */
function getScrollSpeedEnvOverride(): number | undefined {
  return parseScrollSpeed(process.env.CLAUDE_CODE_SCROLL_SPEED);
}

function describeScrollSpeed(speed: number): string {
  return speed === 1
    ? '1 row per wheel event (default — correct for terminals that pre-multiply, e.g. Ghostty, iTerm2)'
    : `${speed} rows per wheel event — for terminals that send 1 event per notch (e.g. VS Code terminal)`;
}

function setScrollSpeed(speed: number): ScrollSpeedCommandResult {
  const result = updateSettingsForSource('userSettings', { scrollSpeed: speed });
  if (result.error) {
    return { message: `Failed to set scroll speed: ${result.error.message}` };
  }

  logEvent('tengu_scroll_speed_command', { speed });

  // Env var wins at readScrollSpeedBase() time — only flag it when it
  // actually conflicts (asking for X while env pins Y).
  const envOverride = getScrollSpeedEnvOverride();
  if (envOverride !== undefined && envOverride !== speed) {
    return {
      message: `Scroll speed saved as ${speed}, but CLAUDE_CODE_SCROLL_SPEED=${process.env.CLAUDE_CODE_SCROLL_SPEED} overrides it — clear the env var and ${speed} takes over`,
    };
  }

  return { message: `Scroll speed set to ${speed} — ${describeScrollSpeed(speed)}` };
}

function unsetScrollSpeed(): ScrollSpeedCommandResult {
  const result = updateSettingsForSource('userSettings', { scrollSpeed: undefined });
  if (result.error) {
    return { message: `Failed to reset scroll speed: ${result.error.message}` };
  }

  logEvent('tengu_scroll_speed_command', { speed: SCROLL_SPEED_DEFAULT });

  const envOverride = getScrollSpeedEnvOverride();
  if (envOverride !== undefined && envOverride !== SCROLL_SPEED_DEFAULT) {
    return {
      message: `Scroll speed reset to default (${SCROLL_SPEED_DEFAULT}), but CLAUDE_CODE_SCROLL_SPEED=${process.env.CLAUDE_CODE_SCROLL_SPEED} still controls this session`,
    };
  }
  return { message: `Scroll speed reset to default (${SCROLL_SPEED_DEFAULT} row per wheel event)` };
}

export function showCurrentScrollSpeed(): ScrollSpeedCommandResult {
  const effective = resolveScrollSpeedBase(process.env.CLAUDE_CODE_SCROLL_SPEED, getInitialSettings().scrollSpeed);
  const envOverride = getScrollSpeedEnvOverride();
  const suffix =
    envOverride !== undefined && envOverride !== getInitialSettings().scrollSpeed
      ? ` (CLAUDE_CODE_SCROLL_SPEED=${process.env.CLAUDE_CODE_SCROLL_SPEED} overrides this session)`
      : '';
  return { message: `Current scroll speed: ${effective} — ${describeScrollSpeed(effective)}${suffix}` };
}

export function executeScrollSpeed(args: string): ScrollSpeedCommandResult {
  const normalized = args.trim().toLowerCase();

  if (normalized === 'status' || normalized === 'current') {
    return showCurrentScrollSpeed();
  }

  if (COMMON_HELP_ARGS.includes(normalized)) {
    return {
      message: [
        'Usage: /scroll-speed [1-20|default|status]',
        '',
        'With no arguments, opens a slider over the common speeds (1-10).',
        'Higher = more rows per wheel event. Terminals that pre-multiply wheel',
        'events (Ghostty, iTerm2 "faster scroll") are correct at 1; terminals',
        'that send 1 event per notch (VS Code terminal, plain xterm) feel',
        'right at 2-3.',
        '',
        `Values are clamped to 1-${SCROLL_SPEED_MAX}. Env override: CLAUDE_CODE_SCROLL_SPEED.`,
      ].join('\n'),
    };
  }

  if (normalized === 'default' || normalized === 'unset' || normalized === 'reset') {
    return unsetScrollSpeed();
  }

  const value = parseScrollSpeed(normalized);
  if (value === undefined) {
    return {
      message: `Invalid argument: ${args}. Valid options are: 1-${SCROLL_SPEED_MAX}, default, status`,
    };
  }

  return setScrollSpeed(value);
}

function ScrollSpeedSlider({ onDone }: { onDone: LocalJSXCommandOnDone }): React.ReactNode {
  const settingsSpeed = getInitialSettings().scrollSpeed;
  const effective = resolveScrollSpeedBase(process.env.CLAUDE_CODE_SCROLL_SPEED, settingsSpeed);
  const envOverride = getScrollSpeedEnvOverride();

  const items: SliderItem[] = SCROLL_SPEED_VALUES.map(speed => ({
    value: String(speed),
    label: String(speed),
    description: describeScrollSpeed(speed),
  }));

  return (
    <Slider
      items={items}
      // Cursor starts on the effective speed; env override still wins at
      // runtime, so surface it as a note instead of moving the cursor.
      currentValue={String(effective)}
      heading="Scroll speed"
      note={
        envOverride !== undefined
          ? `CLAUDE_CODE_SCROLL_SPEED=${process.env.CLAUDE_CODE_SCROLL_SPEED} overrides this session`
          : settingsSpeed === undefined
            ? 'Default: 1 row per wheel event'
            : undefined
      }
      onConfirm={value => {
        onDone(setScrollSpeed(Number(value)).message);
      }}
      onCancel={() => onDone('Scroll speed unchanged.')}
    />
  );
}

export async function call(onDone: LocalJSXCommandOnDone, _context: unknown, args?: string): Promise<React.ReactNode> {
  const trimmed = args?.trim() ?? '';

  // No args → open the interactive slider
  if (trimmed === '') {
    return <ScrollSpeedSlider onDone={onDone} />;
  }

  onDone(executeScrollSpeed(trimmed).message);
}
