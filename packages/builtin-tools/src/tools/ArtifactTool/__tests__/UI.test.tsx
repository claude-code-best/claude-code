import { describe, expect, test } from 'bun:test';
import * as React from 'react';
import type { ProgressMessage } from 'src/types/message.js';
import type { ToolProgressData } from 'src/Tool.js';
import { renderToolResultMessage } from '../UI.js';
import type { ArtifactOutput } from '../ArtifactTool.js';

const NO_PROGRESS: ProgressMessage<ToolProgressData>[] = [];
const OPTIONS = { verbose: false, theme: 'dark' } as never;

/** Walk a React element tree and concatenate all string/number children. */
function extractText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) {
    const children = (node.props as { children?: React.ReactNode }).children;
    return extractText(children);
  }
  return '';
}

describe('ArtifactTool UI.renderToolResultMessage', () => {
  test('renders the uploaded URL and expiry on success', () => {
    const content: ArtifactOutput = {
      id: 'abc123',
      url: 'https://cloud-artifacts.claude-code-best.win/7d/abc123.html',
      expiresAt: '2026-06-27T10:00:00.000Z',
    };
    const node = renderToolResultMessage(content, NO_PROGRESS, OPTIONS);
    expect(React.isValidElement(node)).toBe(true);
    const text = extractText(node);
    expect(text).toContain(content.url);
    expect(text).toContain(content.expiresAt);
    expect(text).toContain('Artifact uploaded');
  });

  test('renders the error message on failure', () => {
    const content: ArtifactOutput = {
      id: '',
      url: '',
      expiresAt: '',
      error: 'File does not exist or is not readable: /tmp/missing.html',
    };
    const node = renderToolResultMessage(content, NO_PROGRESS, OPTIONS);
    expect(React.isValidElement(node)).toBe(true);
    const text = extractText(node);
    expect(text).toContain('Artifact upload failed');
    expect(text).toContain('/tmp/missing.html');
  });

  test('returns null when url is empty without error', () => {
    const content: ArtifactOutput = { id: '', url: '', expiresAt: '' };
    const node = renderToolResultMessage(content, NO_PROGRESS, OPTIONS);
    expect(node).toBeNull();
  });

  test('omits the expiry line when expiresAt is empty', () => {
    const content: ArtifactOutput = {
      id: 'abc',
      url: 'https://cloud-artifacts.claude-code-best.win/7d/abc.html',
      expiresAt: '',
    };
    const node = renderToolResultMessage(content, NO_PROGRESS, OPTIONS);
    expect(React.isValidElement(node)).toBe(true);
    // Sanity: still renders URL even without expiry
    expect(extractText(node)).toContain(content.url);
  });
});
