import React, { useEffect, useState } from 'react';
import { Box, Link, Text } from '@anthropic/ink';
import { type AwsAuthStatus, AwsAuthStatusManager } from '../utils/awsAuthStatusManager.js';

const URL_RE = /https?:\/\/\S+/;

export function AwsAuthStatusBox(): React.ReactNode {
  const [status, setStatus] = useState<AwsAuthStatus>(AwsAuthStatusManager.getInstance().getStatus());

  useEffect(() => {
    // Subscribe to status updates
    const unsubscribe = AwsAuthStatusManager.getInstance().subscribe(setStatus);
    return unsubscribe;
  }, []);

  // Don't show anything if not authenticating and no error
  if (!status.isAuthenticating && !status.error && status.output.length === 0) {
    return null;
  }

  // Don't show if authentication succeeded (no error and not authenticating)
  if (!status.isAuthenticating && !status.error) {
    return null;
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="permission" paddingX={1} marginY={1}>
      <Text bold color="permission">
        Cloud Authentication
      </Text>

      {status.output.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {status.output.slice(-5).map((line, index) => {
            const m = line.match(URL_RE);
            if (!m) {
              return (
                <Text key={index} dimColor>
                  {line}
                </Text>
              );
            }
            const url = m[0];
            const start = m.index ?? 0;
            const before = line.slice(0, start);
            const after = line.slice(start + url.length);
            return (
              <Text key={index} dimColor>
                {before}
                <Link url={url}>{url}</Link>
                {after}
              </Text>
            );
          })}
        </Box>
      )}

      {status.error && (
        <Box marginTop={1}>
          <Text color="error">{status.error}</Text>
        </Box>
      )}
    </Box>
  );
}
