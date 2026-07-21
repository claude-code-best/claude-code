import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatInput, getSlashCommandFilter } from '../ChatInput';

describe('ChatInput slash commands', () => {
  test('only treats a slash in the first position as a command trigger', () => {
    expect(getSlashCommandFilter('/')).toBe('');
    expect(getSlashCommandFilter('/compact')).toBe('compact');
    expect(getSlashCommandFilter('/compact now')).toBeNull();
    expect(getSlashCommandFilter('/compact ')).toBeNull();
    expect(getSlashCommandFilter('hello /compact')).toBeNull();
    expect(getSlashCommandFilter(' /compact')).toBeNull();
  });

  test('does not render a persistent command button', () => {
    const markup = renderToStaticMarkup(
      createElement(ChatInput, {
        onSubmit: () => {},
        commands: [{ name: 'compact', description: 'Compact the conversation' }],
      }),
    );

    expect(markup.match(/<button/g)).toHaveLength(1);
    expect(markup).not.toContain('命令列表');
  });
});
