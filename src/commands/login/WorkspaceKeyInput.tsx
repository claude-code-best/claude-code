/**
 * WorkspaceKeyInput — Ink form component for entering a workspace API key.
 *
 * Security properties:
 * - Input is masked: displayed as sk-ant-api03-****...****
 * - Enter is disabled until the key has the correct prefix and minimum length
 * - Prefix validation shown inline as the user types — no submit required
 * - Raw key value never appears in rendered output
 *
 * UX:
 * - Press Enter to save (calls onSave with the validated key)
 * - Press Esc to cancel (calls onCancel)
 */

import * as React from 'react';
import { Box, Text, useInput } from '@anthropic/ink';
import { saveWorkspaceKey } from '../../services/auth/saveWorkspaceKey.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PREFIX = 'sk-ant-api03-';
const MIN_KEY_LENGTH = 20;
const MAX_KEY_LENGTH = 256;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a masked display string for the current input.
 * Never exposes raw key characters beyond the prefix.
 *
 * Examples:
 *   ''                        → ''
 *   'sk-ant-api03-'           → 'sk-ant-api03-'
 *   'sk-ant-api03-ABCDE...'   → 'sk-ant-api03-****...****'
 */
function maskKeyInput(value: string): string {
  if (value.length === 0) return '';
  if (!value.startsWith(PREFIX)) {
    // Show first 4 chars only
    return value.slice(0, 4) + (value.length > 4 ? '...' : '');
  }
  const suffix = value.slice(PREFIX.length);
  if (suffix.length === 0) return PREFIX;
  // Show last 4 suffix chars masked; hide the rest
  const stars = '****';
  return `${PREFIX}${stars}...${suffix.slice(-Math.min(4, suffix.length)).replace(/./g, '*')}`;
}

/**
 * Validates the current input value.
 * Returns an inline error string, or null when valid.
 */
function validateKey(value: string): string | null {
  if (value.length === 0) return null; // no input yet — no error shown
  if (!value.startsWith(PREFIX)) {
    return `Key must start with "${PREFIX}"`;
  }
  if (value.length < MIN_KEY_LENGTH) {
    return `Key too short (${value.length}/${MIN_KEY_LENGTH} chars minimum)`;
  }
  if (value.length > MAX_KEY_LENGTH) {
    return `Key too long (${value.length}/${MAX_KEY_LENGTH} chars maximum)`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceKeyInputProps {
  /** Called with the validated key after the user presses Enter */
  onSave: (key: string) => void;
  /** Called when the user presses Esc */
  onCancel: () => void;
  /** If true, the save operation is in progress */
  saving?: boolean;
  /** Error from the save operation itself (fs write errors, etc.) */
  saveError?: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkspaceKeyInput({
  onSave,
  onCancel,
  saving = false,
  saveError = null,
}: WorkspaceKeyInputProps): React.ReactNode {
  const [value, setValue] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const inlineError = validateKey(value);
  const canSubmit = !saving && value.length >= MIN_KEY_LENGTH && inlineError === null;

  useInput(
    (input: string, key: { escape: boolean; return: boolean; backspace: boolean; delete: boolean }) => {
      if (key.escape) {
        onCancel();
        return;
      }

      if (key.return) {
        if (!canSubmit) return;
        // Clear any previous error and delegate to parent
        setError(null);
        onSave(value);
        return;
      }

      if (key.backspace || key.delete) {
        setValue(prev => prev.slice(0, -1));
        return;
      }

      // Append printable characters (ignore control chars)
      if (input && input.length > 0) {
        const char = input;
        // Only accept printable ASCII (32–126) — avoid pasting escape sequences
        if (char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126) {
          setValue(prev => {
            const next = prev + char;
            // Silently cap at MAX_KEY_LENGTH — user sees error if already over
            return next.length <= MAX_KEY_LENGTH ? next : prev;
          });
        }
      }
    },
    { isActive: !saving },
  );

  const masked = maskKeyInput(value);
  const displayError = error ?? saveError ?? inlineError;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={0}>
        <Text bold>Enter workspace API key (sk-ant-api03-*):</Text>
      </Box>

      <Box marginTop={0} marginBottom={0}>
        <Text dimColor>{'  Obtain from: https://console.anthropic.com/settings/keys'}</Text>
      </Box>

      <Box marginTop={1} marginBottom={0}>
        <Text>{'  > '}</Text>
        {value.length > 0 ? <Text>{masked}</Text> : <Text dimColor>{'[paste key here]'}</Text>}
      </Box>

      {displayError !== null && (
        <Box marginTop={0}>
          <Text color="warning">
            {'  ✗ '}
            {displayError}
          </Text>
        </Box>
      )}

      {saving && (
        <Box marginTop={0}>
          <Text dimColor>{'  Saving...'}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          {canSubmit
            ? 'Press Enter to save · Esc to cancel'
            : 'Esc to cancel' + (value.length === 0 ? ' · start typing your key' : '')}
        </Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Container with async save logic
// ---------------------------------------------------------------------------

export interface WorkspaceKeyInputContainerProps {
  /** Called after the key is successfully saved */
  onSaved: () => void;
  /** Called when the user cancels */
  onCancel: () => void;
}

export function WorkspaceKeyInputContainer({ onSaved, onCancel }: WorkspaceKeyInputContainerProps): React.ReactNode {
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const handleSave = React.useCallback(
    async (key: string) => {
      setSaving(true);
      setSaveError(null);
      try {
        await saveWorkspaceKey(key);
        onSaved();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to save key — unknown error';
        setSaveError(msg);
        setSaving(false);
      }
    },
    [onSaved],
  );

  return (
    <WorkspaceKeyInput
      onSave={key => {
        void handleSave(key);
      }}
      onCancel={onCancel}
      saving={saving}
      saveError={saveError}
    />
  );
}
