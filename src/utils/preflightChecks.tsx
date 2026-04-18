import React, { useEffect, useState } from 'react';
import { useTimeout } from '../hooks/useTimeout.js';
import { Box, Text } from '@anthropic/ink';
import { Spinner } from '../components/Spinner.js';

export interface PreflightCheckResult {
  success: boolean;
  error?: string;
  sslHint?: string;
}

async function checkEndpoints(): Promise<PreflightCheckResult> {
  // Skip connectivity check — users may use third-party API providers
  // (OpenAI, Gemini, Grok, etc.) or be behind restricted networks.
  return { success: true };
}

interface PreflightStepProps {
  onSuccess: () => void;
}

export function PreflightStep({ onSuccess }: PreflightStepProps): React.ReactNode {
  const [result, setResult] = useState<PreflightCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  // delay showing the check since it's so fast that we normally
  // want to just immediately show the next step without a flash
  const showSpinner = useTimeout(1000) && isChecking;

  useEffect(() => {
    async function run() {
      const checkResult = await checkEndpoints();
      setResult(checkResult);
      setIsChecking(false);
    }
    void run();
  }, []);

  useEffect(() => {
    if (result?.success) {
      onSuccess();
    }
    // Failure branch removed — preflight check always succeeds
  }, [result, onSuccess]);

  return (
    <Box flexDirection="column" gap={1} paddingLeft={1}>
      {isChecking && showSpinner ? (
        <Box paddingLeft={1}>
          <Spinner />
          <Text>Checking connectivity...</Text>
        </Box>
      ) : (
        !result?.success &&
        !isChecking && (
          <Box flexDirection="column" gap={1}>
            <Text color="error">Unable to connect to Anthropic services</Text>
            <Text color="error">{result?.error}</Text>
          </Box>
        )
      )}
    </Box>
  );
}
