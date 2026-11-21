import * as React from 'react';
import { Slider, type SliderItem } from '../../components/Slider.js';
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js';
import { logEvent } from '../../services/analytics/index.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';
import { isEnvTruthy } from '../../utils/envUtils.js';

/**
 * /autocompact — official 2.1.330 alignment: a slider showing every value
 * (off / on), Home/End jump to the ends, Enter confirms, Esc cancels.
 *
 * Scope note: this repo's auto-compact is a boolean toggle (no token-window
 * sizing yet — the official `--autocompact <auto|tokens>` token window is
 * not reverse-engineered into the compaction core). The slider therefore
 * switches the persisted `autoCompactEnabled` flag and *displays* the
 * effective compaction threshold (context window − buffer) without touching
 * compaction logic. Env overrides (DISABLE_COMPACT / DISABLE_AUTO_COMPACT)
 * still win at runtime, like CLAUDE_CODE_EFFORT_LEVEL does for /effort.
 */

const COMMON_HELP_ARGS = ['help', '-h', '--help'];

type AutocompactCommandResult = {
  message: string;
};

/**
 * Env vars that can disable (auto-)compact at runtime, overriding the
 * persisted setting. Mirrors the checks in isAutoCompactEnabled() without
 * importing the compaction core (keeps this module + its tests light).
 */
function getAutoCompactEnvOverride(): string | undefined {
  if (isEnvTruthy(process.env.DISABLE_COMPACT)) return 'DISABLE_COMPACT';
  if (isEnvTruthy(process.env.DISABLE_AUTO_COMPACT)) return 'DISABLE_AUTO_COMPACT';
  return undefined;
}

function setAutoCompactEnabled(enabled: boolean): AutocompactCommandResult {
  saveGlobalConfig(current => ({ ...current, autoCompactEnabled: enabled }));

  logEvent('tengu_autocompact_command', { enabled });

  // Env vars win at isAutoCompactEnabled() time — only flag a conflict
  // (asking for on while an env var forces off).
  const envOverride = getAutoCompactEnvOverride();
  if (enabled && envOverride) {
    return {
      message: `Auto-compact enabled in settings, but ${envOverride} is set and still disables it this session`,
    };
  }

  return {
    message: enabled
      ? 'Auto-compact enabled — the conversation compacts automatically near the context limit'
      : 'Auto-compact disabled — use /compact to free context manually',
  };
}

export function showCurrentAutoCompact(): AutocompactCommandResult {
  const enabled = getGlobalConfig().autoCompactEnabled;
  const envOverride = getAutoCompactEnvOverride();
  if (enabled && envOverride) {
    return {
      message: `Auto-compact: on in settings, but ${envOverride} disables it this session`,
    };
  }
  return { message: `Auto-compact: ${enabled ? 'on' : 'off'}` };
}

export function executeAutocompact(args: string): AutocompactCommandResult {
  const normalized = args.trim().toLowerCase();

  if (normalized === '' || normalized === 'status' || normalized === 'current') {
    return showCurrentAutoCompact();
  }

  if (COMMON_HELP_ARGS.includes(normalized)) {
    return {
      message: [
        'Usage: /autocompact [on|off|status]',
        '',
        'With no arguments, opens a slider to toggle auto-compact.',
        '- on: compact the conversation automatically near the context limit',
        '- off: never auto-compact; run /compact manually instead',
        '- status: show whether auto-compact is currently active',
        '',
        'Env overrides (win at runtime): DISABLE_COMPACT, DISABLE_AUTO_COMPACT',
      ].join('\n'),
    };
  }

  if (normalized === 'on' || normalized === 'true' || normalized === 'enable') {
    return setAutoCompactEnabled(true);
  }

  if (normalized === 'off' || normalized === 'false' || normalized === 'disable') {
    return setAutoCompactEnabled(false);
  }

  return {
    message: `Invalid argument: ${args}. Valid options are: on, off, status`,
  };
}

function formatTokenWindow(tokens: number): string {
  return `${Math.round(tokens / 1000)}k`;
}

function AutocompactSlider({ onDone }: { onDone: LocalJSXCommandOnDone }): React.ReactNode {
  const model = useMainLoopModel();
  // Threshold display only — compaction logic itself is never touched here.
  // autoCompact.ts pulls in the query/API dependency graph, so it is loaded
  // lazily only when the slider actually renders.
  const [onDescription, setOnDescription] = React.useState(
    'Compacts the conversation automatically near the context limit',
  );

  React.useEffect(() => {
    let cancelled = false;
    void import('../../services/compact/autoCompact.js').then(module => {
      if (cancelled) return;
      const threshold = module.getAutoCompactThreshold(model);
      const contextWindow = module.getEffectiveContextWindowSize(model);
      setOnDescription(
        `Compacts automatically at ~${formatTokenWindow(threshold)} tokens ` +
          `(context window ${formatTokenWindow(contextWindow)} minus the output buffer)`,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [model]);

  const envOverride = getAutoCompactEnvOverride();

  const items: SliderItem[] = [
    {
      value: 'off',
      label: 'off',
      description: 'Never auto-compacts — run /compact manually to free context',
    },
    {
      value: 'on',
      label: 'on',
      description: onDescription,
    },
  ];

  return (
    <Slider
      items={items}
      currentValue={getGlobalConfig().autoCompactEnabled ? 'on' : 'off'}
      heading="Auto-compact"
      note={
        envOverride ? `${envOverride} is set — the environment still disables auto-compact this session` : undefined
      }
      onConfirm={value => {
        onDone(setAutoCompactEnabled(value === 'on').message);
      }}
      onCancel={() => onDone('Auto-compact unchanged.')}
    />
  );
}

export async function call(onDone: LocalJSXCommandOnDone, _context: unknown, args?: string): Promise<React.ReactNode> {
  const trimmed = args?.trim() ?? '';

  // No args → open the interactive slider
  if (trimmed === '') {
    return <AutocompactSlider onDone={onDone} />;
  }

  onDone(executeAutocompact(trimmed).message);
}
