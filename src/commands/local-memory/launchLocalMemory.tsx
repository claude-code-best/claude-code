import React from 'react';
import { Box, Dialog, Text, useInput } from '@anthropic/ink';
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js';
import {
  listStores,
  createStore,
  setEntry,
  getEntry,
  listEntries,
  archiveStore,
  isValidStoreName,
} from '../../services/SessionMemory/multiStore.js';
import { isValidKey } from '../../utils/localValidate.js';
import TextInput from '../../components/TextInput.js';
import { LocalMemoryView } from './LocalMemoryView.js';
import { parseLocalMemoryArgs } from './parseArgs.js';
import { launchCommand } from '../_shared/launchCommand.js';

const USAGE =
  'Usage: /local-memory list | create STORE | store STORE KEY VALUE | fetch STORE KEY | entries STORE | archive STORE';

type LocalMemoryViewProps = React.ComponentProps<typeof LocalMemoryView>;

type LocalMemoryAction = {
  label: string;
  description: string;
  run: () => void;
};

const ACTION_LABEL_COLUMN_WIDTH = 26;

function formatStoreList(stores: string[]): string {
  if (stores.length === 0) {
    return 'No memory stores found.';
  }
  return ['Local Memory Stores', ...stores.map(store => `- ${store}`)].join('\n');
}

function formatEntryList(store: string, keys: string[]): string {
  if (keys.length === 0) {
    return `No entries in "${store}".`;
  }
  return [`Entries in "${store}"`, ...keys.map(key => `- ${key}`)].join('\n');
}

// ── Interactive multi-step panel ───────────────────────────────────────────
// State machine:
//   menu                 — pick an action
//   collect-store        — input STORE_NAME (Create/Store/Fetch/Entries/Archive)
//   collect-key          — input KEY (Store/Fetch)
//   collect-value        — input VALUE (Store)
//   confirm-archive      — Y/N confirmation (Archive)
//   confirm-overwrite    — Y/N confirmation (Store when key exists)
// Each step has inline validation; Esc cancels back to menu (or closes from menu).

type ActionKind = 'list' | 'create' | 'store' | 'fetch' | 'entries' | 'archive' | 'about';

type Step =
  | { kind: 'menu' }
  | { kind: 'collect-store'; action: ActionKind }
  | { kind: 'collect-key'; action: ActionKind; store: string }
  | { kind: 'collect-value'; action: ActionKind; store: string; key: string }
  | {
      kind: 'confirm-archive';
      store: string;
    }
  | {
      kind: 'confirm-overwrite';
      store: string;
      key: string;
      value: string;
    };

const MENU: Array<{
  kind: ActionKind;
  label: string;
  description: string;
}> = [
  { kind: 'list', label: 'List', description: 'Show all stores' },
  {
    kind: 'create',
    label: 'Create',
    description: 'Create a new memory store',
  },
  {
    kind: 'store',
    label: 'Store',
    description: 'Write an entry: store name + key + value',
  },
  {
    kind: 'fetch',
    label: 'Fetch',
    description: 'Read an entry by store name + key',
  },
  {
    kind: 'entries',
    label: 'Entries',
    description: 'List entry keys in a store',
  },
  {
    kind: 'archive',
    label: 'Archive',
    description: 'Archive a store (rename to *.archived)',
  },
  {
    kind: 'about',
    label: 'About',
    description: 'Show command syntax',
  },
];

function LocalMemoryPanel({ onDone }: { onDone: LocalJSXCommandOnDone }): React.ReactNode {
  const [step, setStep] = React.useState<Step>({ kind: 'menu' });
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [textValue, setTextValue] = React.useState('');
  const [cursorOffset, setCursorOffset] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  // Reset text/error when step transitions
  const transition = React.useCallback((next: Step) => {
    setStep(next);
    setTextValue('');
    setCursorOffset(0);
    setError(null);
  }, []);

  const closeWith = React.useCallback((msg: string) => onDone(msg, { display: 'system' }), [onDone]);

  // Run an action when it has all required inputs.
  const runAction = React.useCallback(
    (
      action: ActionKind,
      store: string | undefined,
      key: string | undefined,
      value: string | undefined,
      opts: { confirmedOverwrite?: boolean } = {},
    ) => {
      try {
        if (action === 'list') {
          closeWith(formatStoreList(listStores()));
          return;
        }
        if (action === 'about') {
          closeWith(USAGE);
          return;
        }
        if (!store) {
          setError('Internal: missing store');
          return;
        }
        if (action === 'create') {
          createStore(store);
          closeWith(`Store created: ${store}`);
          return;
        }
        if (action === 'entries') {
          const keys = listEntries(store);
          closeWith(formatEntryList(store, keys));
          return;
        }
        if (action === 'archive') {
          archiveStore(store);
          closeWith(`Archived store: ${store}`);
          return;
        }
        if (action === 'fetch') {
          if (!key) {
            setError('Internal: missing key');
            return;
          }
          const v = getEntry(store, key);
          if (v === null) {
            closeWith(`Entry not found: ${store}/${key}`);
            return;
          }
          closeWith(`Entry fetched: ${store}/${key}\n\n${v}`);
          return;
        }
        if (action === 'store') {
          if (!key || value === undefined) {
            setError('Internal: missing key or value');
            return;
          }
          // Confirm overwrite if key already exists (safety prompt)
          if (!opts.confirmedOverwrite && getEntry(store, key) !== null) {
            transition({
              kind: 'confirm-overwrite',
              store,
              key,
              value,
            });
            return;
          }
          setEntry(store, key, value);
          closeWith(`Stored ${store}/${key} (${value.length} chars)`);
          return;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [closeWith, transition],
  );

  // ── Menu step ──────────────────────────────────────────────────────────
  useInput(
    (input, key) => {
      if (step.kind !== 'menu') return;
      if (key.upArrow) {
        setSelectedIndex(idx => Math.max(0, idx - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex(idx => Math.min(MENU.length - 1, idx + 1));
        return;
      }
      if (key.return) {
        const choice = MENU[selectedIndex];
        if (!choice) return;
        if (choice.kind === 'list' || choice.kind === 'about') {
          runAction(choice.kind, undefined, undefined, undefined);
          return;
        }
        // Everything else needs a store
        transition({ kind: 'collect-store', action: choice.kind });
        return;
      }
      // Quick-key shortcuts: 1..7
      const n = Number(input);
      if (Number.isInteger(n) && n >= 1 && n <= MENU.length) {
        setSelectedIndex(n - 1);
      }
    },
    { isActive: step.kind === 'menu' },
  );

  // ── confirm-archive / confirm-overwrite Y/N handling ───────────────────
  useInput(
    (input, key) => {
      if (step.kind !== 'confirm-archive' && step.kind !== 'confirm-overwrite') {
        return;
      }
      if (key.escape) {
        transition({ kind: 'menu' });
        return;
      }
      const ch = input.toLowerCase();
      if (ch === 'y' || key.return) {
        if (step.kind === 'confirm-archive') {
          runAction('archive', step.store, undefined, undefined);
        } else {
          runAction('store', step.store, step.key, step.value, {
            confirmedOverwrite: true,
          });
        }
      } else if (ch === 'n') {
        transition({ kind: 'menu' });
      }
    },
    {
      isActive: step.kind === 'confirm-archive' || step.kind === 'confirm-overwrite',
    },
  );

  // Esc to back-step in collect-* steps
  useInput(
    (_input, key) => {
      if (step.kind !== 'collect-store' && step.kind !== 'collect-key' && step.kind !== 'collect-value') {
        return;
      }
      if (key.escape) {
        // Walk back one step
        if (step.kind === 'collect-value') {
          transition({
            kind: 'collect-key',
            action: step.action,
            store: step.store,
          });
          return;
        }
        if (step.kind === 'collect-key') {
          transition({ kind: 'collect-store', action: step.action });
          return;
        }
        // collect-store → menu
        transition({ kind: 'menu' });
      }
    },
    {
      isActive: step.kind === 'collect-store' || step.kind === 'collect-key' || step.kind === 'collect-value',
    },
  );

  // ── Render ──────────────────────────────────────────────────────────────
  if (step.kind === 'menu') {
    return (
      <Dialog
        title="Local Memory"
        subtitle={`${MENU.length} actions`}
        onCancel={() => closeWith('Local memory panel dismissed')}
        color="background"
        hideInputGuide
      >
        <Box flexDirection="column">
          {MENU.map((m, i) => (
            <Box key={m.kind} flexDirection="row">
              <Text>{`${i === selectedIndex ? '›' : ' '} ${m.label}`.padEnd(ACTION_LABEL_COLUMN_WIDTH)}</Text>
              <Text dimColor>{m.description}</Text>
            </Box>
          ))}
          <Box marginTop={1}>
            <Text dimColor>↑/↓ or 1-7 select · Enter run · Esc close</Text>
          </Box>
        </Box>
      </Dialog>
    );
  }

  // Confirmation prompts
  if (step.kind === 'confirm-archive') {
    return (
      <Dialog title="Confirm Archive" onCancel={() => transition({ kind: 'menu' })} color="warning" hideInputGuide>
        <Box flexDirection="column">
          <Text>Archive store "{step.store}"? This renames it to *.archived.</Text>
          <Box marginTop={1}>
            <Text dimColor>y/Enter = archive · n/Esc = cancel</Text>
          </Box>
        </Box>
      </Dialog>
    );
  }
  if (step.kind === 'confirm-overwrite') {
    return (
      <Dialog title="Confirm Overwrite" onCancel={() => transition({ kind: 'menu' })} color="warning" hideInputGuide>
        <Box flexDirection="column">
          <Text>
            Entry "{step.store}/{step.key}" already exists. Overwrite with new value ({step.value.length} chars)?
          </Text>
          <Box marginTop={1}>
            <Text dimColor>y/Enter = overwrite · n/Esc = cancel</Text>
          </Box>
        </Box>
      </Dialog>
    );
  }

  // collect-* steps share the same TextInput render
  const fieldLabel = step.kind === 'collect-store' ? 'STORE NAME' : step.kind === 'collect-key' ? 'KEY NAME' : 'VALUE';
  const placeholder =
    step.kind === 'collect-store'
      ? 'e.g. my-notes'
      : step.kind === 'collect-key'
        ? 'e.g. todo-2026-05-08'
        : 'free text';
  const validateAndAdvance = (raw: string) => {
    const trimmed = raw.trim();
    if (step.kind === 'collect-store') {
      if (!trimmed) {
        setError('Store name required');
        return;
      }
      if (!isValidStoreName(trimmed)) {
        setError('Invalid store name (no /, \\, :, null byte, or leading dot; max 255 chars)');
        return;
      }
      // Action-specific completion
      if (step.action === 'create' || step.action === 'entries' || step.action === 'archive') {
        if (step.action === 'archive') {
          transition({ kind: 'confirm-archive', store: trimmed });
        } else {
          runAction(step.action, trimmed, undefined, undefined);
        }
      } else {
        // Store / Fetch — need key next
        transition({
          kind: 'collect-key',
          action: step.action,
          store: trimmed,
        });
      }
      return;
    }
    if (step.kind === 'collect-key') {
      if (!trimmed) {
        setError('Key required');
        return;
      }
      if (!isValidKey(trimmed)) {
        setError('Invalid key (allowed: letters/digits/._- only; no leading dot; not a Windows reserved name)');
        return;
      }
      if (step.action === 'fetch') {
        runAction('fetch', step.store, trimmed, undefined);
      } else {
        // store action — collect value next
        transition({
          kind: 'collect-value',
          action: 'store',
          store: step.store,
          key: trimmed,
        });
      }
      return;
    }
    if (step.kind === 'collect-value') {
      // Value can be empty (allowed). Just submit.
      runAction('store', step.store, step.key, raw);
    }
  };

  return (
    <Dialog
      title={`Local Memory · ${step.kind.replace('collect-', '').toUpperCase()}`}
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
            onSubmit={validateAndAdvance}
            placeholder={placeholder}
            columns={70}
            showCursor
          />
        </Box>
        {error !== null && (
          <Box marginTop={0}>
            <Text color="warning">✗ {error}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>Enter = next · Esc = back</Text>
        </Box>
      </Box>
    </Dialog>
  );
}

async function dispatchLocalMemory(
  parsed: ReturnType<typeof parseLocalMemoryArgs>,
  onDone: LocalJSXCommandOnDone,
): Promise<LocalMemoryViewProps | null> {
  if (parsed.action === 'list') {
    const stores = listStores();
    onDone(formatStoreList(stores), { display: 'system' });
    return null;
  }

  if (parsed.action === 'create') {
    const { store } = parsed;
    createStore(store);
    onDone(`Store created: ${store}`, { display: 'system' });
    return null;
  }

  if (parsed.action === 'store') {
    const { store, key, value } = parsed;
    setEntry(store, key, value);
    onDone(`Stored entry "${key}" in store "${store}".`, { display: 'system' });
    return null;
  }

  if (parsed.action === 'fetch') {
    const { store, key } = parsed;
    const value = getEntry(store, key);
    if (value === null) {
      onDone(`Entry not found: ${store}/${key}`, { display: 'system' });
      return null;
    }
    onDone(`Entry fetched: ${store}/${key}\n${value}`, { display: 'system' });
    return null;
  }

  if (parsed.action === 'entries') {
    const { store } = parsed;
    const keys = listEntries(store);
    onDone(formatEntryList(store, keys), { display: 'system' });
    return null;
  }

  if (parsed.action === 'archive') {
    const { store } = parsed;
    archiveStore(store);
    onDone(`Archived store: ${store}`, { display: 'system' });
    return null;
  }

  // Exhaustive guard
  onDone(USAGE, { display: 'system' });
  return null;
}

const callLocalMemoryDirect: LocalJSXCommandCall = launchCommand<
  ReturnType<typeof parseLocalMemoryArgs>,
  LocalMemoryViewProps
>({
  commandName: 'local-memory',
  parseArgs: (raw: string) => {
    const result = parseLocalMemoryArgs(raw);
    if (result.action === 'invalid') {
      return { action: 'invalid' as const, reason: `${USAGE}\n${result.reason}` };
    }
    return result;
  },
  dispatch: dispatchLocalMemory,
  View: LocalMemoryView,
  errorView: (msg: string) => React.createElement(LocalMemoryView, { mode: 'error', message: msg }),
});

export const callLocalMemory: LocalJSXCommandCall = async (onDone, context, args) => {
  if ((args ?? '').trim() === '') {
    return <LocalMemoryPanel onDone={onDone} />;
  }
  return callLocalMemoryDirect(onDone, context, args);
};
