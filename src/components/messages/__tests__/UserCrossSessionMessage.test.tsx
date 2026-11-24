import { describe, expect, mock, test } from 'bun:test';
import * as React from 'react';
import { renderToString } from '../../../utils/staticRender.js';
import { logMock } from '../../../../tests/mocks/log';
import { debugMock } from '../../../../tests/mocks/debug';

mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}));
mock.module('src/utils/log.ts', logMock);
mock.module('src/utils/debug.ts', debugMock);

const { UserCrossSessionMessage } = await import('../UserCrossSessionMessage.js');

function param(from: string, body: string) {
  return {
    type: 'text' as const,
    text: `<cross-session-message from="${from}">\n${body}\n</cross-session-message>`,
  };
}

async function render(props: {
  from: string;
  body?: string;
  isExpanded?: boolean;
  followsSpeakerLabel?: boolean;
}): Promise<string> {
  return renderToString(
    <UserCrossSessionMessage
      addMargin={false}
      param={param(props.from, props.body ?? 'hello from the agent')}
      isExpanded={props.isExpanded}
      followsSpeakerLabel={props.followsSpeakerLabel}
    />,
  );
}

// Official 2.1.330 `MM` component (L936598) + tmux-verified rendering:
// - collapsed: `› Message from @general-purpose (ctrl+o to expand)` + body
// - expanded (verbose / transcript mode): `› Message from general-purpose`
//   (no @, no expand hint) + wrapped body
// - followsSpeakerLabel: consecutive same-sender message renders body only
describe('UserCrossSessionMessage', () => {
  test('collapsed: dim `› Message from @sender (ctrl+o to expand)` + body', async () => {
    const out = await render({ from: 'general-purpose' });
    expect(out).toContain('› Message from @general-purpose (ctrl+o to expand)');
    expect(out).toContain('hello from the agent');
  });

  test('expanded: `› Message from sender` — no @, no expand hint', async () => {
    const out = await render({ from: 'general-purpose', isExpanded: true });
    expect(out).toContain('› Message from general-purpose');
    expect(out).not.toContain('@general-purpose');
    expect(out).not.toContain('ctrl+o to expand');
    expect(out).toContain('hello from the agent');
  });

  test('followsSpeakerLabel: no header at all — body renders directly', async () => {
    const out = await render({ from: 'general-purpose', followsSpeakerLabel: true });
    expect(out).not.toContain('Message from');
    expect(out).toContain('hello from the agent');
  });

  test('followsSpeakerLabel + expanded: still no header, body present', async () => {
    const out = await render({
      from: 'general-purpose',
      followsSpeakerLabel: true,
      isExpanded: true,
    });
    expect(out).not.toContain('Message from');
    expect(out).toContain('hello from the agent');
  });

  test('non-cross-session text renders nothing', async () => {
    const out = await renderToString(
      <UserCrossSessionMessage addMargin={false} param={{ type: 'text', text: 'just a plain prompt' }} />,
    );
    expect(out.trim()).toBe('');
  });
});
