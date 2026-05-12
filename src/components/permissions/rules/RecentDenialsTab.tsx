import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- 'r' is a view-specific key, not a global keybinding
import { Box, Text, useInput, useTabHeaderFocus } from '@anthropic/ink';
import { type AutoModeDenial, getAutoModeDenials } from '../../../utils/autoModeDenials.js';
import { Select } from '../../CustomSelect/select.js';
import { StatusIcon } from '@anthropic/ink';

type Props = {
  onHeaderFocusChange?: (focused: boolean) => void;
  /** Called when approved/retry state changes so parent can act on exit */
  onStateChange: (state: { approved: Set<number>; retry: Set<number>; denials: readonly AutoModeDenial[] }) => void;
};

export function RecentDenialsTab({ onHeaderFocusChange, onStateChange }: Props): React.ReactNode {
  const { headerFocused, focusHeader } = useTabHeaderFocus();
  useEffect(() => {
    onHeaderFocusChange?.(headerFocused);
  }, [headerFocused, onHeaderFocusChange]);

  // Snapshot on mount — approved/retry Sets key by index, and the live store
  // prepends. A concurrent denial would shift all indices mid-edit.
  const [denials] = useState(() => getAutoModeDenials());

  const [approved, setApproved] = useState<Set<number>>(() => new Set());
  const [retry, setRetry] = useState<Set<number>>(() => new Set());
  const [focusedIdx, setFocusedIdx] = useState(0);

  useEffect(() => {
    onStateChange({ approved, retry, denials });
  }, [approved, retry, denials, onStateChange]);

  const handleSelect = useCallback((value: string) => {
    const idx = Number(value);
    setApproved(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const handleFocus = useCallback((value: string) => {
    setFocusedIdx(Number(value));
  }, []);

  useInput(
    (input, _key) => {
      if (input === 'r') {
        setRetry(prev => {
          const next = new Set(prev);
          if (next.has(focusedIdx)) next.delete(focusedIdx);
          else next.add(focusedIdx);
          return next;
        });
        // Retry implies approve
        setApproved(prev => {
          if (prev.has(focusedIdx)) return prev;
          const next = new Set(prev);
          next.add(focusedIdx);
          return next;
        });
      }
    },
    { isActive: denials.length > 0 },
  );

  if (denials.length === 0) {
    return <Text dimColor>No recent denials. Commands denied by the auto mode classifier will appear here.</Text>;
  }

  const options = denials.map((d, idx) => {
    const isApproved = approved.has(idx);
    const suffix = retry.has(idx) ? ' (retry)' : '';
    return {
      label: (
        <Text>
          <StatusIcon status={isApproved ? 'success' : 'error'} withSpace />
          {d.display}
          <Text dimColor>{suffix}</Text>
        </Text>
      ),
      value: String(idx),
    };
  });

  return (
    <Box flexDirection="column">
      <Text>Commands recently denied by the auto mode classifier.</Text>
      <Box marginTop={1}>
        <Select
          options={options}
          onChange={handleSelect}
          onFocus={handleFocus}
          visibleOptionCount={Math.min(10, options.length)}
          isDisabled={headerFocused}
          onUpFromFirstItem={focusHeader}
        />
      </Box>
    </Box>
  );
}
