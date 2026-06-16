import * as React from 'react';
import { useCallback, useState } from 'react';
import { Box, Text, Tabs, Tab, useInput } from '@anthropic/ink';
import { useExitOnCtrlCDWithKeybindings } from '../../hooks/useExitOnCtrlCDWithKeybindings.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { useIsInsideModal } from '../../context/modalContext.js';
import { getSettings_DEPRECATED, updateSettingsForSource } from '../../utils/settings/settings.js';
import type { LocalJSXCommandCall, LocalJSXCommandContext } from '../../types/command.js';

// ── Types ──────────────────────────────────────────────────────────────────

type SearchAdapterKey = 'tavily' | 'api' | 'bing' | 'brave' | 'exa';
type FetchAdapterKey = 'tavily' | 'http';

interface AdapterMeta {
  key: SearchAdapterKey | FetchAdapterKey;
  label: string;
  description: string;
  hasConfig: boolean;
}

type SettingsJson = Record<string, unknown> & {
  webSearchAdapter?: 'api' | 'bing' | 'brave' | 'exa' | 'tavily';
  webFetchAdapter?: 'tavily' | 'http';
  tavilyEndpointUrl?: string;
  braveApiKey?: string;
  webFetchHttpTimeoutMs?: number;
  exaApiKey?: string;
  exaEndpointUrl?: string;
};

type ViewState = { kind: 'main' } | { kind: 'config'; adapter: AdapterMeta };

// ── Data ───────────────────────────────────────────────────────────────────

const SEARCH_ADAPTERS: AdapterMeta[] = [
  { key: 'tavily', label: 'Tavily', description: 'Tavily Search API (default)', hasConfig: true },
  { key: 'api', label: 'Anthropic API', description: 'Anthropic server-side web search', hasConfig: false },
  { key: 'bing', label: 'Bing', description: 'Scrape Bing HTML results', hasConfig: false },
  { key: 'brave', label: 'Brave', description: 'Brave Search API (needs API key)', hasConfig: true },
  { key: 'exa', label: 'Exa', description: 'Exa AI search (MCP endpoint)', hasConfig: true },
];

const FETCH_ADAPTERS: AdapterMeta[] = [
  { key: 'tavily', label: 'Tavily Extract', description: 'Use Tavily /extract (default)', hasConfig: true },
  { key: 'http', label: 'HTTP Direct', description: 'Fetch URL directly via HTTP', hasConfig: true },
];

// ── Config field definitions ───────────────────────────────────────────────

type ConfigField = {
  key: string;
  label: string;
  placeholder: string;
  maskInput: boolean;
  getValue: (s: SettingsJson) => string;
  setValue: (s: SettingsJson, v: string) => SettingsJson;
};

// ── Main View ──────────────────────────────────────────────────────────────

function MainView({
  tab,
  adapters,
  current,
  fieldLabel,
  onConfigure,
  onSwitchTab,
  onSelectAdapter,
  onClose,
  contentHeight,
}: {
  tab: 'search' | 'fetch';
  adapters: AdapterMeta[];
  current: string;
  fieldLabel: string;
  onConfigure: (adapter: AdapterMeta) => void;
  onSwitchTab: (tab: 'search' | 'fetch') => void;
  onSelectAdapter: (key: string) => void;
  onClose: () => void;
  contentHeight: number;
}): React.ReactNode {
  const [cursor, setCursor] = useState(
    Math.max(
      0,
      adapters.findIndex(a => a.key === current),
    ),
  );

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor(c => Math.max(0, c - 1));
    } else if (key.downArrow) {
      setCursor(c => Math.min(c + 1, adapters.length - 1));
    } else if (key.tab && tab === 'search') {
      onSwitchTab('fetch');
      setCursor(0);
    } else if (key.tab && tab === 'fetch') {
      onSwitchTab('search');
      setCursor(0);
    } else if (key.escape) {
      onClose();
    } else if (key.return) {
      const adapter = adapters[cursor];
      if (adapter) {
        onConfigure(adapter);
      }
    }
    // Space toggles selection without entering config
    else if (input === ' ') {
      const adapter = adapters[cursor];
      if (adapter) {
        onSelectAdapter(adapter.key);
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>{fieldLabel}</Text>
      <Box flexDirection="column" marginTop={1}>
        {adapters.map((adapter, idx) => {
          const isSelected = adapter.key === current;
          const isCursor = idx === cursor;
          const highlight = isCursor || isSelected;

          return (
            <Box key={adapter.key} flexDirection="row">
              <Text color={isSelected ? 'success' : undefined}>
                {isCursor ? '›' : ' '}
                <Text color={isSelected ? 'success' : undefined}> {isSelected ? '\u25CF' : '\u25CB'} </Text>
              </Text>
              <Text
                bold={isSelected}
                backgroundColor={highlight ? 'suggestion' : undefined}
                color={highlight ? 'inverseText' : undefined}
              >
                {adapter.label}
              </Text>
              <Text> </Text>
              <Text dimColor={!isSelected}>{adapter.description}</Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1} flexDirection="row" gap={2}>
        <Text dimColor>{'\u2191\u2193'} navigate · Space select · Enter config · Esc close</Text>
        <Text dimColor>Tab switch tab</Text>
      </Box>
    </Box>
  );
}

// ── Config View ────────────────────────────────────────────────────────────

function getConfigFields(adapter: AdapterMeta): ConfigField[] {
  const fields: ConfigField[] = [];
  switch (adapter.key) {
    case 'tavily':
      fields.push({
        key: 'tavilyEndpointUrl',
        label: 'Endpoint URL',
        placeholder: 'https://tavily.claude-code-best.win',
        maskInput: false,
        getValue: s => s.tavilyEndpointUrl ?? 'https://tavily.claude-code-best.win',
        setValue: (s, v) => ({ ...s, tavilyEndpointUrl: v || undefined }),
      });
      break;
    case 'brave':
      fields.push({
        key: 'braveApiKey',
        label: 'API Key',
        placeholder: 'BSA...',
        maskInput: true,
        getValue: s => s.braveApiKey ?? '',
        setValue: (s, v) => ({ ...s, braveApiKey: v || undefined }),
      });
      break;
    case 'exa':
      fields.push({
        key: 'exaApiKey',
        label: 'API Key',
        placeholder: 'exa-...',
        maskInput: true,
        getValue: s => s.exaApiKey ?? '',
        setValue: (s, v) => ({ ...s, exaApiKey: v || undefined }),
      });
      fields.push({
        key: 'exaEndpointUrl',
        label: 'Endpoint URL',
        placeholder: 'https://mcp.exa.ai/mcp',
        maskInput: false,
        getValue: s => s.exaEndpointUrl ?? 'https://mcp.exa.ai/mcp',
        setValue: (s, v) => ({ ...s, exaEndpointUrl: v || undefined }),
      });
      break;
    case 'http':
      fields.push({
        key: 'webFetchHttpTimeoutMs',
        label: 'Timeout (ms)',
        placeholder: '60000',
        maskInput: false,
        getValue: s => String(s.webFetchHttpTimeoutMs ?? 60000),
        setValue: (s, v) => ({ ...s, webFetchHttpTimeoutMs: v ? Number(v) || undefined : undefined }),
      });
      break;
    default:
      break;
  }
  return fields;
}

function ConfigView({
  adapter,
  onBack,
  onSave,
  onSelect,
}: {
  adapter: AdapterMeta;
  onBack: () => void;
  onSave: (msg: string) => void;
  onSelect: (msg: string) => void;
}): React.ReactNode {
  const fields = getConfigFields(adapter);
  const settings = getSettings_DEPRECATED() as unknown as SettingsJson;

  if (fields.length === 0) {
    return <NoConfigView adapter={adapter} onBack={onBack} onSelect={onSelect} />;
  }

  return <ConfigFieldsEditor fields={fields} adapter={adapter} onBack={onBack} onSave={onSave} settings={settings} />;
}

function NoConfigView({
  adapter,
  onBack,
  onSelect,
}: {
  adapter: AdapterMeta;
  onBack: () => void;
  onSelect: (msg: string) => void;
}): React.ReactNode {
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (key.upArrow || key.downArrow) {
      setCursor(c => (c === 0 ? 1 : 0));
    } else if (key.escape) {
      onBack();
    } else if (key.return) {
      if (cursor === 0) {
        onSelect(`Selected ${adapter.label}.`);
      } else {
        onBack();
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>{adapter.label}</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text>{adapter.description}</Text>
        <Box marginTop={1}>
          <Text dimColor>No additional configuration needed.</Text>
        </Box>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text>{cursor === 0 ? '\u203A' : ' '} </Text>
          <Text
            backgroundColor={cursor === 0 ? 'suggestion' : undefined}
            color={cursor === 0 ? 'inverseText' : undefined}
            bold
          >
            [ Select & Close ]
          </Text>
        </Box>
        <Box>
          <Text>{cursor === 1 ? '\u203A' : ' '} </Text>
          <Text
            backgroundColor={cursor === 1 ? 'suggestion' : undefined}
            color={cursor === 1 ? 'inverseText' : undefined}
          >
            [ Back ]
          </Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'\u2191\u2193'} navigate · Enter confirm · Esc back</Text>
      </Box>
    </Box>
  );
}

function ConfigFieldsEditor({
  fields,
  adapter,
  onBack,
  onSave,
  settings,
}: {
  fields: ConfigField[];
  adapter: AdapterMeta;
  onBack: () => void;
  onSave: (msg: string) => void;
  settings: SettingsJson;
}): React.ReactNode {
  const [cursor, setCursor] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [editCursor, setEditCursor] = useState(0);

  // Reset edit state when field cursor changes
  const resetEdit = useCallback(() => {
    setEditing(false);
    setEditValue('');
    setEditCursor(0);
  }, []);

  // Row count: fields + "Save" button + "Back" button
  const fieldRowStart = 0;
  const fieldRowEnd = fields.length - 1;
  const saveRow = fields.length;
  const backRow = fields.length + 1;

  const handleSave = useCallback(() => {
    let updated: SettingsJson = { ...settings } as SettingsJson;
    for (const f of fields) {
      const currentVal = f.getValue(settings);
      updated = f.setValue(updated, currentVal);
    }
    updateSettingsForSource('userSettings', updated as Record<string, unknown> & SettingsJson);
    onSave(`Configuration saved for ${adapter.label}.`);
  }, [fields, settings, adapter.label, onSave]);

  const handleFieldEdit = useCallback(() => {
    const field = fields[cursor];
    if (!field) return;
    const currentVal = field.getValue(settings);
    setEditValue(currentVal);
    setEditCursor(currentVal.length);
    setEditing(true);
  }, [cursor, fields, settings]);

  const handleEditSubmit = useCallback(() => {
    const field = fields[cursor];
    if (!field) return;
    const updated = field.setValue({ ...settings } as SettingsJson, editValue);
    // Store locally for preview, actual save on "Save"
    Object.assign(settings, updated);
    setEditing(false);
  }, [cursor, fields, settings, editValue]);

  useInput((input, key) => {
    if (editing) {
      // In edit mode, all typing goes to the field value
      if (key.escape) {
        resetEdit();
      } else if (key.return) {
        handleEditSubmit();
      } else if (key.backspace || key.delete) {
        setEditValue((v: string) => {
          const pos = editCursor;
          if (pos > 0) {
            setEditCursor(pos - 1);
            return v.slice(0, pos - 1) + v.slice(pos);
          }
          return v;
        });
      } else if (key.leftArrow) {
        setEditCursor(c => Math.max(0, c - 1));
      } else if (key.rightArrow) {
        setEditCursor(c => Math.min(editValue.length, c + 1));
      } else if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setEditValue((v: string) => {
          const pos = editCursor;
          setEditCursor(pos + 1);
          return v.slice(0, pos) + input + v.slice(pos);
        });
      }
    } else {
      // Not editing — navigate fields
      if (key.upArrow) {
        setCursor(c => Math.max(0, c - 1));
      } else if (key.downArrow) {
        setCursor(c => Math.min(backRow, c + 1));
      } else if (key.escape) {
        onBack();
      } else if (key.return) {
        if (cursor === saveRow) {
          handleSave();
        } else if (cursor === backRow) {
          onBack();
        } else {
          handleFieldEdit();
        }
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>{adapter.label} Configuration</Text>
      <Box flexDirection="column" marginTop={1}>
        {fields.map((field, idx) => {
          const isCursor = idx === cursor && !editing;
          const val = field.getValue(settings);
          const displayVal =
            editing && idx === cursor
              ? field.maskInput
                ? '\u2022'.repeat(editValue.length)
                : editValue
              : field.maskInput && val
                ? '\u2022'.repeat(Math.min(val.length, 16))
                : val;

          return (
            <Box key={field.key} flexDirection="row">
              <Text>{isCursor ? '›' : ' '} </Text>
              <Text dimColor>{field.label}: </Text>
              <Text
                backgroundColor={isCursor ? 'suggestion' : undefined}
                color={editing && idx === cursor ? 'success' : isCursor ? 'inverseText' : undefined}
              >
                {displayVal || <Text dimColor>(empty)</Text>}
              </Text>
              {editing && idx === cursor && (
                <Text dimColor>
                  {' |'} pos {editCursor}/{editValue.length}
                </Text>
              )}
            </Box>
          );
        })}
        <Box marginTop={1}>
          <Text>{cursor === saveRow ? '›' : ' '} </Text>
          <Text
            backgroundColor={cursor === saveRow ? 'suggestion' : undefined}
            color={cursor === saveRow ? 'inverseText' : undefined}
            bold
          >
            [ Save ]
          </Text>
        </Box>
        <Box>
          <Text>{cursor === backRow ? '›' : ' '} </Text>
          <Text
            backgroundColor={cursor === backRow ? 'suggestion' : undefined}
            color={cursor === backRow ? 'inverseText' : undefined}
          >
            [ Back ]
          </Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          {editing
            ? '\u2190\u2192 move cursor · Type to edit · Enter confirm · Esc cancel edit'
            : '\u2191\u2193 navigate · Enter edit field · Esc go back'}
        </Text>
      </Box>
    </Box>
  );
}

// ── Top-level panel ────────────────────────────────────────────────────────

function WebToolsPanel({
  onClose,
  _context: __context,
}: {
  onClose: (result?: string) => void;
  _context: LocalJSXCommandContext;
}): React.ReactNode {
  const [currentTab, setCurrentTab] = useState<'search' | 'fetch'>('search');
  const [view, setView] = useState<ViewState>({ kind: 'main' });

  const settings = getSettings_DEPRECATED() as unknown as SettingsJson;
  const currentSearch = settings.webSearchAdapter ?? 'tavily';
  const currentFetch = settings.webFetchAdapter ?? 'tavily';

  const insideModal = useIsInsideModal();
  const { rows } = useTerminalSize();
  const contentHeight = insideModal ? rows + 1 : Math.max(14, Math.min(Math.floor(rows * 0.7), 24));

  useExitOnCtrlCDWithKeybindings();

  const handleSelectAdapter = useCallback(
    (key: string) => {
      const t = currentTab;
      const field = t === 'search' ? 'webSearchAdapter' : ('webFetchAdapter' as keyof SettingsJson);
      updateSettingsForSource('userSettings', { [field]: key } as SettingsJson);
      const adapters = t === 'search' ? SEARCH_ADAPTERS : FETCH_ADAPTERS;
      const label = adapters.find(a => a.key === key)?.label ?? key;
      onClose(`${t === 'search' ? 'Web search' : 'Web fetch'} backend set to ${label}.`);
    },
    [currentTab, onClose],
  );

  const handleConfigure = useCallback((adapter: AdapterMeta) => {
    setView({ kind: 'config', adapter });
  }, []);

  const handleBackFromConfig = useCallback(() => {
    setView({ kind: 'main' });
  }, []);

  const handleSaveConfig = useCallback(
    (msg: string) => {
      onClose(msg);
    },
    [onClose],
  );

  const handleSelectFromConfig = useCallback(
    (msg: string) => {
      // Also save the adapter selection when coming from config detail
      const adapter = (view as Extract<ViewState, { kind: 'config' }>).adapter;
      const tab =
        view.kind === 'config' ? (SEARCH_ADAPTERS.some(a => a.key === adapter.key) ? 'search' : 'fetch') : currentTab;
      const field = tab === 'search' ? ('webSearchAdapter' as const) : ('webFetchAdapter' as const);
      updateSettingsForSource('userSettings', { [field]: adapter.key } as SettingsJson);
      onClose(msg);
    },
    [onClose, view, currentTab],
  );

  if (view.kind === 'config') {
    return (
      <ConfigView
        adapter={view.adapter}
        onBack={handleBackFromConfig}
        onSave={handleSaveConfig}
        onSelect={handleSelectFromConfig}
      />
    );
  }

  // Main view with tabs
  const adapters = currentTab === 'search' ? SEARCH_ADAPTERS : FETCH_ADAPTERS;
  const current = currentTab === 'search' ? currentSearch : currentFetch;

  return (
    <Tabs title="Web Tools" contentHeight={contentHeight}>
      <Tab key="search" title="Search">
        <MainView
          tab={currentTab}
          adapters={SEARCH_ADAPTERS}
          current={currentSearch}
          fieldLabel="Choose a web search backend:"
          onConfigure={handleConfigure}
          onSwitchTab={setCurrentTab}
          onSelectAdapter={handleSelectAdapter}
          onClose={() => onClose('Web tools panel dismissed')}
          contentHeight={contentHeight}
        />
      </Tab>
      <Tab key="fetch" title="Fetch">
        <MainView
          tab={currentTab}
          adapters={FETCH_ADAPTERS}
          current={currentFetch}
          fieldLabel="Choose a web fetch backend:"
          onConfigure={handleConfigure}
          onSwitchTab={setCurrentTab}
          onSelectAdapter={handleSelectAdapter}
          onClose={() => onClose('Web tools panel dismissed')}
          contentHeight={contentHeight}
        />
      </Tab>
    </Tabs>
  );
}

export const call: LocalJSXCommandCall = async (onDone, context) => {
  return <WebToolsPanel onClose={onDone} _context={context} />;
};
