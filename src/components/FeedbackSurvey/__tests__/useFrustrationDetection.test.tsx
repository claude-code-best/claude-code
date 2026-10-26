import { afterEach, describe, expect, mock, test } from 'bun:test';
import * as React from 'react';
import { renderToString } from '../../../utils/staticRender.js';
import type { Message } from '../../../types/message.js';

let transcriptShareDismissed = false;
let productFeedbackAllowed = true;

const mockSubmitTranscriptShare = mock(async () => {});

mock.module('../../../services/analytics/index.js', () => ({
  logEvent: () => {},
}));

mock.module('../submitTranscriptShare.js', () => ({
  submitTranscriptShare: mockSubmitTranscriptShare,
}));

mock.module('../../../services/policyLimits/index.js', () => ({
  isPolicyAllowed: (p: string) => (p === 'product_feedback' ? productFeedbackAllowed : true),
}));

mock.module('../../../utils/config.js', () => ({
  getGlobalConfig: () => ({
    transcriptShareDismissed,
  }),
  saveGlobalConfig: (fn: any) => {
    const current = { transcriptShareDismissed };
    const next = typeof fn === 'function' ? fn(current) : fn;
    transcriptShareDismissed = next.transcriptShareDismissed;
  },
}));

import { useFrustrationDetection } from '../useFrustrationDetection.js';

type DetectionResult = ReturnType<typeof useFrustrationDetection>;

function apiError(uuid: string): Message {
  return {
    type: 'assistant',
    uuid: uuid as any,
    isApiErrorMessage: true,
    message: { role: 'assistant', content: [] },
  };
}

async function renderDetection(props: {
  messages: Message[];
  isLoading?: boolean;
  hasActivePrompt?: boolean;
  otherSurveyOpen?: boolean;
}): Promise<DetectionResult> {
  let result: DetectionResult | null = null;
  function Probe(): React.ReactNode {
    result = useFrustrationDetection(
      props.messages,
      props.isLoading ?? false,
      props.hasActivePrompt ?? false,
      props.otherSurveyOpen ?? false,
    );
    return null;
  }

  await renderToString(<Probe />);
  if (!result) {
    throw new Error('useFrustrationDetection did not render');
  }
  return result;
}

afterEach(() => {
  transcriptShareDismissed = false;
  productFeedbackAllowed = true;
  mockSubmitTranscriptShare.mockClear();
});

describe('useFrustrationDetection', () => {
  test('stays closed without frustration signals', async () => {
    const result = await renderDetection({ messages: [] });

    expect(result.state).toBe('closed');
    expect(typeof result.handleTranscriptSelect).toBe('function');
  }, 10000);

  test('opens a transcript prompt for repeated API errors', async () => {
    const result = await renderDetection({
      messages: [apiError('a'), apiError('b')],
    });

    expect(result.state).toBe('transcript_prompt');
  }, 10000);

  test('does not prompt while loading, prompting, blocked by another survey, dismissed, or policy-denied', async () => {
    const messages = [apiError('a'), apiError('b')];

    expect((await renderDetection({ messages, isLoading: true })).state).toBe('closed');
    expect((await renderDetection({ messages, hasActivePrompt: true })).state).toBe('closed');
    expect((await renderDetection({ messages, otherSurveyOpen: true })).state).toBe('closed');

    transcriptShareDismissed = true;
    expect((await renderDetection({ messages })).state).toBe('closed');

    transcriptShareDismissed = false;
    productFeedbackAllowed = false;
    expect((await renderDetection({ messages })).state).toBe('closed');
  }, 10000);

  test('submits transcript share when the user accepts', async () => {
    const result = await renderDetection({
      messages: [apiError('a'), apiError('b')],
    });

    result.handleTranscriptSelect('yes');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockSubmitTranscriptShare).toHaveBeenCalledWith(
      [apiError('a'), apiError('b')],
      'frustration',
      expect.any(String),
    );
  }, 10000);
});
