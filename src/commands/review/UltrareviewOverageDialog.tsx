import React, { useCallback, useRef, useState } from 'react';
import { Select } from '../../components/CustomSelect/select.js';
import { Box, Dialog, Text } from '@anthropic/ink';

type Props = {
  onProceed: (signal: AbortSignal) => Promise<void>;
  onCancel: () => void;
};

export function UltrareviewOverageDialog({ onProceed, onCancel }: Props): React.ReactNode {
  const [isLaunching, setIsLaunching] = useState(false);
  const abortControllerRef = useRef(new AbortController());

  const handleSelect = useCallback(
    (value: string) => {
      if (value === 'proceed') {
        setIsLaunching(true);
        // If onProceed rejects (e.g. launchRemoteReview throws), onDone is
        // never called and the dialog stays mounted — restore the Select so
        // the user can retry or cancel instead of staring at "Launching…".
        void onProceed(abortControllerRef.current.signal).catch(() => setIsLaunching(false));
      } else {
        onCancel();
      }
    },
    [onProceed, onCancel],
  );

  // 在启动过程中按下 Escape 键会通过 signal 中止正在执行的 onPr
  // oceed，这样调用方可以跳过副作用（confirmOverage、onDon
  // e）——否则，一个“发射后不管”的启动操作会继续运行并计费，尽管用户已经“取消”。
  const handleCancel = useCallback(() => {
    abortControllerRef.current.abort();
    onCancel();
  }, [onCancel]);

  const options = [
    { label: '继续执行额外用量计费', value: 'proceed' },
    { label: 'Cancel', value: 'cancel' },
  ];

  return (
    <Dialog title="Ultrareview billing" onCancel={handleCancel} color="background">
      <Box flexDirection="column" gap={1}>
        <Text>
          Your free ultrareviews for this organization are used. Further reviews bill as Extra Usage (pay-per-use).
        </Text>
        {isLaunching ? (
          <Text color="background">Launching…</Text>
        ) : (
          <Select options={options} onChange={handleSelect} onCancel={handleCancel} />
        )}
      </Box>
    </Dialog>
  );
}
