import React from 'react';
import { Box, Dialog, Text, useInput } from '@anthropic/ink';
import type { LocalJSXCommandCall } from '../../types/command.js';
import { setSecret, getSecret, deleteSecret, listKeys, maskSecret } from '../../services/localVault/store.js';
import { isValidKey } from '../../utils/localValidate.js';
import TextInput from '../../components/TextInput.js';
import { LocalVaultView } from './LocalVaultView.js';
import { parseLocalVaultArgs } from './parseArgs.js';
import { launchCommand } from '../_shared/launchCommand.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';

const USAGE = 'Usage: /local-vault list | set KEY VALUE | get KEY [--reveal] | delete KEY';

type LocalVaultViewProps = React.ComponentProps<typeof LocalVaultView>;

type LocalVaultAction = {
  label: string;
  description: string;
  run: () => void;
};

const ACTION_LABEL_COLUMN_WIDTH = 26;

function formatKeyList(keys: string[]): string {
  if (keys.length === 0) {
    return 'No secrets stored.';
  }
  return ['Local Vault Keys', ...keys.map(key => `- ${key}`)].join('\n');
}

// ── Interactive multi-step panel ───────────────────────────────────────────
// Vault state machine:
//   menu               — pick action
//   collect-key        — KEY name (Set/Get/Delete)
//   collect-value      — secret VALUE (Set only; masked input)
//   confirm-overwrite  — Y/N when key exists (Set)
//   confirm-delete     — Y/N (Delete)

type VaultActionKind = 'list' | 'set' | 'get' | 'delete' | 'about';

type VaultStep =
  | { kind: 'menu' }
  | { kind: 'collect-key'; action: VaultActionKind }
  | { kind: 'collect-value'; key: string }
  | { kind: 'confirm-overwrite'; key: string; value: string }
  | { kind: 'confirm-delete'; key: string };

const VAULT_MENU: Array<{
  kind: VaultActionKind;
  label: string;
  description: string;
}> = [
  { kind: 'list', label: 'List', description: 'Show stored secret keys' },
  {
    kind: 'set',
    label: 'Set',
    description: 'Store a secret: KEY + VALUE (input is masked)',
  },
  {
    kind: 'get',
    label: 'Get',
    description: 'Look up a secret (returns masked preview)',
  },
  {
    kind: 'delete',
    label: 'Delete',
    description: 'Delete a stored secret by KEY',
  },
  {
    kind: 'about',
    label: 'About',
    description: 'Show command syntax',
  },
];

function LocalVaultPanel({ onDone }: { onDone: LocalJSXCommandOnDone }): React.ReactNode {
  const [step, setStep] = React.useState<VaultStep>({ kind: 'menu' });
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [textValue, setTextValue] = React.useState('');
  const [cursorOffset, setCursorOffset] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [inFlight, setInFlight] = React.useState(false);

  const transition = React.useCallback((next: VaultStep) => {
    setStep(next);
    setTextValue('');
    setCursorOffset(0);
    setError(null);
  }, []);

  const closeWith = React.useCallback((msg: string) => onDone(msg, { display: 'system' }), [onDone]);

  // ── Menu navigation ────────────────────────────────────────────────────
  useInput(
    (input, key) => {
      if (step.kind !== 'menu' || inFlight) return;
      if (key.upArrow) {
        setSelectedIndex(idx => Math.max(0, idx - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex(idx => Math.min(VAULT_MENU.length - 1, idx + 1));
        return;
      }
      if (key.return) {
        const choice = VAULT_MENU[selectedIndex];
        if (!choice) return;
        if (choice.kind === 'about') {
          closeWith(USAGE);
          return;
        }
        if (choice.kind === 'list') {
          setInFlight(true);
          void listKeys().then(keys => {
            closeWith(formatKeyList(keys));
          });
          return;
        }
        // Set / Get / Delete — collect key first
        transition({ kind: 'collect-key', action: choice.kind });
        return;
      }
      const n = Number(input);
      if (Number.isInteger(n) && n >= 1 && n <= VAULT_MENU.length) {
        setSelectedIndex(n - 1);
      }
    },
    { isActive: step.kind === 'menu' && !inFlight },
  );

  // ── Confirmations (overwrite / delete) ─────────────────────────────────
  useInput(
    (input, key) => {
      if (step.kind !== 'confirm-overwrite' && step.kind !== 'confirm-delete') {
        return;
      }
      if (key.escape) {
        transition({ kind: 'menu' });
        return;
      }
      const ch = input.toLowerCase();
      if (ch === 'y' || key.return) {
        if (step.kind === 'confirm-delete') {
          setInFlight(true);
          const key = step.key;
          void deleteSecret(key).then(removed => {
            closeWith(removed ? `Deleted: ${key}` : `Key not found: ${key}`);
          });
        } else {
          // confirm-overwrite — proceed with setSecret
          setInFlight(true);
          const k = step.key;
          const v = step.value;
          void setSecret(k, v)
            .then(() => closeWith(`Secret stored: ${k} = [REDACTED]`))
            .catch(e => closeWith(`Failed to store ${k}: ${e instanceof Error ? e.message : String(e)}`));
        }
      } else if (ch === 'n') {
        transition({ kind: 'menu' });
      }
    },
    {
      isActive: (step.kind === 'confirm-overwrite' || step.kind === 'confirm-delete') && !inFlight,
    },
  );

  // Esc back-step in collect-* steps
  useInput(
    (_input, key) => {
      if (step.kind !== 'collect-key' && step.kind !== 'collect-value') return;
      if (key.escape) {
        if (step.kind === 'collect-value') {
          transition({ kind: 'collect-key', action: 'set' });
          return;
        }
        transition({ kind: 'menu' });
      }
    },
    {
      isActive: (step.kind === 'collect-key' || step.kind === 'collect-value') && !inFlight,
    },
  );

  // ── Action handlers ─────────────────────────────────────────────────────
  const handleKeySubmit = (raw: string) => {
    const key = raw.trim();
    if (!key) {
      setError('Key required');
      return;
    }
    if (!isValidKey(key)) {
      setError('Invalid key (allowed: letters/digits/._- only; no leading dot; not a Windows reserved name)');
      return;
    }
    if (step.kind !== 'collect-key') return;
    if (step.action === 'get') {
      setInFlight(true);
      void getSecret(key).then(v => {
        if (v === null) {
          closeWith(`Key not found: ${key}`);
        } else {
          closeWith(`Key found: ${key} = ${maskSecret(v)}`);
        }
      });
      return;
    }
    if (step.action === 'delete') {
      transition({ kind: 'confirm-delete', key });
      return;
    }
    if (step.action === 'set') {
      transition({ kind: 'collect-value', key });
      return;
    }
  };

  const handleValueSubmit = (rawValue: string) => {
    if (step.kind !== 'collect-value') return;
    if (rawValue.length === 0) {
      setError('Secret value cannot be empty');
      return;
    }
    const k = step.key;
    // Check overwrite
    setInFlight(true);
    void getSecret(k)
      .then(existing => {
        if (existing !== null) {
          // Need confirmation
          setInFlight(false);
          transition({
            kind: 'confirm-overwrite',
            key: k,
            value: rawValue,
          });
          return;
        }
        return setSecret(k, rawValue).then(() => closeWith(`Secret stored: ${k} = [REDACTED]`));
      })
      .catch(e => closeWith(`Failed to store ${k}: ${e instanceof Error ? e.message : String(e)}`));
  };

  // ── Render ──────────────────────────────────────────────────────────────
  if (step.kind === 'menu') {
    return (
      <Dialog
        title="Local Vault"
        subtitle={`${VAULT_MENU.length} actions`}
        onCancel={() => closeWith('Local vault panel dismissed')}
        color="background"
        hideInputGuide
      >
        <Box flexDirection="column">
          {VAULT_MENU.map((m, i) => (
            <Box key={m.kind} flexDirection="row">
              <Text>{`${i === selectedIndex ? '›' : ' '} ${m.label}`.padEnd(ACTION_LABEL_COLUMN_WIDTH)}</Text>
              <Text dimColor>{m.description}</Text>
            </Box>
          ))}
          {inFlight && (
            <Box marginTop={1}>
              <Text dimColor>Working...</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text dimColor>↑/↓ or 1-5 select · Enter run · Esc close</Text>
          </Box>
        </Box>
      </Dialog>
    );
  }

  if (step.kind === 'confirm-delete') {
    return (
      <Dialog title="Confirm Delete" onCancel={() => transition({ kind: 'menu' })} color="warning" hideInputGuide>
        <Box flexDirection="column">
          <Text>Delete secret "{step.key}"? This cannot be undone.</Text>
          <Box marginTop={1}>
            <Text dimColor>y/Enter = delete · n/Esc = cancel</Text>
          </Box>
          {inFlight && <Text dimColor>Deleting...</Text>}
        </Box>
      </Dialog>
    );
  }

  if (step.kind === 'confirm-overwrite') {
    return (
      <Dialog title="Confirm Overwrite" onCancel={() => transition({ kind: 'menu' })} color="warning" hideInputGuide>
        <Box flexDirection="column">
          <Text>Secret "{step.key}" already exists. Overwrite? Old value is lost.</Text>
          <Box marginTop={1}>
            <Text dimColor>y/Enter = overwrite · n/Esc = cancel</Text>
          </Box>
          {inFlight && <Text dimColor>Storing...</Text>}
        </Box>
      </Dialog>
    );
  }

  // collect-key / collect-value
  const fieldLabel = step.kind === 'collect-key' ? 'KEY NAME' : 'SECRET VALUE';
  const placeholder = step.kind === 'collect-key' ? 'e.g. github-token' : '(masked input — value never displayed)';
  const onSubmit = step.kind === 'collect-key' ? handleKeySubmit : handleValueSubmit;
  const isMasked = step.kind === 'collect-value';
  return (
    <Dialog
      title={`Local Vault · ${step.kind === 'collect-key' ? 'KEY' : 'VALUE'}`}
      onCancel={() => transition({ kind: 'menu' })}
      color="background"
      hideInputGuide
    >
      <Box flexDirection="column">
        <Box>
          <Text dimColor>{fieldLabel}</Text>
        </Box>
        <Box>
          <Text>{'> '}</Text>
          <TextInput
            value={textValue}
            onChange={v => {
              setTextValue(v);
              setError(null);
            }}
            cursorOffset={cursorOffset}
            onChangeCursorOffset={setCursorOffset}
            onSubmit={onSubmit}
            placeholder={placeholder}
            columns={70}
            showCursor
            mask={isMasked ? '*' : undefined}
          />
        </Box>
        {error !== null && (
          <Box marginTop={0}>
            <Text color="warning">✗ {error}</Text>
          </Box>
        )}
        {inFlight && (
          <Box marginTop={0}>
            <Text dimColor>Working...</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>Enter = next · Esc = back</Text>
        </Box>
      </Box>
    </Dialog>
  );
}

async function dispatchLocalVault(
  parsed: ReturnType<typeof parseLocalVaultArgs>,
  onDone: LocalJSXCommandOnDone,
): Promise<LocalVaultViewProps | null> {
  if (parsed.action === 'list') {
    const keys = await listKeys();
    onDone(formatKeyList(keys), { display: 'system' });
    return null;
  }

  if (parsed.action === 'set') {
    const { key, value } = parsed;
    await setSecret(key, value);
    // Never echo the value in onDone — security invariant
    onDone(`Secret stored: ${key} = [REDACTED]`, { display: 'system' });
    return null;
  }

  if (parsed.action === 'get') {
    const { key, reveal } = parsed;
    const value = await getSecret(key);
    if (value === null) {
      onDone(`Key not found: ${key}`, { display: 'system' });
      return null;
    }
    if (reveal) {
      // Security invariant: only --reveal shows plaintext; warn user
      onDone([`Secret revealed for: ${key}`, 'Warning: secret revealed in terminal.', `${key} = ${value}`].join('\n'), {
        display: 'system',
      });
      return null;
    }
    // Default: mask display
    const masked = maskSecret(value);
    onDone(`Key found: ${key} = ${masked}`, { display: 'system' });
    return null;
  }

  if (parsed.action === 'delete') {
    const { key } = parsed;
    const deleted = await deleteSecret(key);
    if (!deleted) {
      onDone(`Key not found: ${key}`, { display: 'system' });
      return null;
    }
    onDone(`Deleted: ${key}`, { display: 'system' });
    return null;
  }

  // Exhaustive guard — should not be reached for valid parsed actions
  onDone(USAGE, { display: 'system' });
  return null;
}

const callLocalVaultDirect: LocalJSXCommandCall = launchCommand<
  ReturnType<typeof parseLocalVaultArgs>,
  LocalVaultViewProps
>({
  commandName: 'local-vault',
  parseArgs: (raw: string) => {
    const result = parseLocalVaultArgs(raw);
    if (result.action === 'invalid') {
      return { action: 'invalid' as const, reason: `${USAGE}\n${result.reason}` };
    }
    return result;
  },
  dispatch: dispatchLocalVault,
  View: LocalVaultView,
  errorView: (msg: string) => React.createElement(LocalVaultView, { mode: 'error', message: msg }),
});

export const callLocalVault: LocalJSXCommandCall = async (onDone, context, args) => {
  if ((args ?? '').trim() === '') {
    return <LocalVaultPanel onDone={onDone} />;
  }
  return callLocalVaultDirect(onDone, context, args);
};
