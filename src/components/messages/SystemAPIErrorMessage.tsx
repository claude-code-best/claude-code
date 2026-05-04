import * as React from 'react';
import { useState } from 'react';
import { Box, Text } from '@anthropic/ink';
import { formatAPIError } from '@ant/model-provider';
import type { SystemAPIErrorMessage } from 'src/types/message.js';
import { useInterval } from 'usehooks-ts';
import { CtrlOToExpand } from '../CtrlOToExpand.js';
import { MessageResponse } from '../MessageResponse.js';

const MAX_API_ERROR_CHARS = 1000;

type Props = {
  message: SystemAPIErrorMessage;
  verbose: boolean;
};

export function SystemAPIErrorMessage({
  message: { retryAttempt, error, retryInMs, maxRetries },
  verbose,
}: Props): React.ReactNode {
  const _retryAttempt = retryAttempt as number;
  const _retryInMs = retryInMs as number;
  const _maxRetries = maxRetries as number;
  const _error = error as Parameters<typeof formatAPIError>[0];
  // Hidden for early retries on external builds to avoid noise. Compute before
  // useInterval so we never register a timer that just drives a null render.
  const hidden = process.env.USER_TYPE === 'external' && _retryAttempt < 4;

  const [countdownMs, setCountdownMs] = useState(0);
  const done = countdownMs >= _retryInMs;
  useInterval(() => setCountdownMs(ms => ms + 1000), hidden || done ? null : 1000);

  if (hidden) {
    return null;
  }

  const retryInSecondsLive = Math.max(0, Math.round((_retryInMs - countdownMs) / 1000));

  const formatted = formatAPIError(_error);
  const truncated = !verbose && formatted.length > MAX_API_ERROR_CHARS;

  return (
    <MessageResponse>
      <Box flexDirection="column">
        <Text color="error">{truncated ? formatted.slice(0, MAX_API_ERROR_CHARS) + '…' : formatted}</Text>
        {truncated && <CtrlOToExpand />}
        <Text dimColor>
          Retrying in {retryInSecondsLive} {retryInSecondsLive === 1 ? 'second' : 'seconds'}… (attempt {_retryAttempt}/
          {_maxRetries})
          {process.env.API_TIMEOUT_MS ? ` · API_TIMEOUT_MS=${process.env.API_TIMEOUT_MS}ms, try increasing it` : ''}
        </Text>
      </Box>
    </MessageResponse>
  );
}
