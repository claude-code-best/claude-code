import React, { useCallback, useRef, useState } from 'react';
import { Box, Dialog, Text } from '@anthropic/ink';
import { Select } from '../../components/CustomSelect/select.js';

type Props = {
  billingNote: string | null;
  onConfirm: (signal: AbortSignal) => Promise<void>;
  onCancel: () => void;
};

/**
 * Dialog shown when /v1/ultrareview/preflight returns action='confirm'.
 * Displays the server-provided billing_note (or a generic fallback) and
 * gives the user a Proceed / Cancel choice.
 */
export function UltrareviewPreflightDialog({ billingNote, onConfirm, onCancel }: Props): React.ReactNode {
  const [isLaunching, setIsLaunching] = useState(false);
  const abortControllerRef = useRef(new AbortController());

  const handleSelect = useCallback(
    (value: string) => {
      if (value === 'proceed') {
        setIsLaunching(true);
        void onConfirm(abortControllerRef.current.signal).catch(() => setIsLaunching(false));
      } else {
        onCancel();
      }
    },
    [onConfirm, onCancel],
  );

  const handleCancel = useCallback(() => {
    abortControllerRef.current.abort();
    onCancel();
  }, [onCancel]);

  const options = [
    { label: 'Proceed', value: 'proceed' },
    { label: 'Cancel', value: 'cancel' },
  ];

  const displayNote = billingNote ?? 'This run may incur additional cost.';

  return (
    <Dialog title="Ultrareview — additional cost" onCancel={handleCancel} color="background">
      <Box flexDirection="column" gap={1}>
        <Text>{displayNote}</Text>
        {isLaunching ? (
          <Text color="background">Launching…</Text>
        ) : (
          <Select options={options} onChange={handleSelect} onCancel={handleCancel} />
        )}
      </Box>
    </Dialog>
  );
}
