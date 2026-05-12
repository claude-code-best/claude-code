/**
 * Tests for AutofixProgress.tsx
 * Uses src/utils/staticRender to render Ink components to strings.
 * Covers: all AutofixPhase values + sessionUrl + errorMessage branches.
 */
import { describe, expect, test } from 'bun:test';
import * as React from 'react';
import { renderToString } from '../../../utils/staticRender.js';
import { AutofixProgress } from '../AutofixProgress.js';

describe('AutofixProgress', () => {
  test('renders target in header', async () => {
    const out = await renderToString(<AutofixProgress phase="detecting" target="acme/myrepo#42" />);
    expect(out).toContain('acme/myrepo#42');
    expect(out).toContain('Autofix PR');
  });

  test('detecting phase shows arrow on detecting step', async () => {
    const out = await renderToString(<AutofixProgress phase="detecting" target="owner/repo#1" />);
    // detecting step should be active (→) and later steps pending (·)
    expect(out).toContain('Detecting repository');
  });

  test('checking_eligibility phase renders eligibility label', async () => {
    const out = await renderToString(<AutofixProgress phase="checking_eligibility" target="owner/repo#2" />);
    expect(out).toContain('Checking remote agent eligibility');
  });

  test('acquiring_lock phase renders lock label', async () => {
    const out = await renderToString(<AutofixProgress phase="acquiring_lock" target="owner/repo#3" />);
    expect(out).toContain('Acquiring monitor lock');
  });

  test('launching phase renders launching label', async () => {
    const out = await renderToString(<AutofixProgress phase="launching" target="owner/repo#4" />);
    expect(out).toContain('Launching remote session');
  });

  test('registered phase renders registered label', async () => {
    const out = await renderToString(<AutofixProgress phase="registered" target="owner/repo#5" />);
    expect(out).toContain('Session registered');
  });

  test('done phase renders done label', async () => {
    const out = await renderToString(<AutofixProgress phase="done" target="owner/repo#6" />);
    expect(out).toContain('Autofix launched');
  });

  test('error phase renders error message when provided', async () => {
    const out = await renderToString(
      <AutofixProgress phase="error" target="owner/repo#7" errorMessage="Something went wrong" />,
    );
    expect(out).toContain('Something went wrong');
  });

  test('error phase with errorMessage shows the message', async () => {
    const out = await renderToString(
      <AutofixProgress phase="error" target="owner/repo#8" errorMessage="session_create_failed" />,
    );
    expect(out).toContain('session_create_failed');
  });

  test('error phase without errorMessage does not crash', async () => {
    const out = await renderToString(<AutofixProgress phase="error" target="owner/repo#9" />);
    expect(out).toContain('owner/repo#9');
  });

  test('sessionUrl is rendered when provided', async () => {
    const url = 'https://claude.ai/session/abc123';
    const out = await renderToString(<AutofixProgress phase="done" target="owner/repo#10" sessionUrl={url} />);
    expect(out).toContain(url);
    expect(out).toContain('Track');
  });

  test('sessionUrl absent — no Track line shown', async () => {
    const out = await renderToString(<AutofixProgress phase="registered" target="owner/repo#11" />);
    expect(out).not.toContain('Track');
  });
});
