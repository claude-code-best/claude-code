import { mkdir, writeFile } from 'fs/promises';
import { marked, type Tokens } from 'marked';
import { tmpdir } from 'os';
import { join } from 'path';
import React, { useRef } from 'react';
import type { CommandResultDisplay } from '../../commands.js';
import type { OptionWithDescription } from '../../components/CustomSelect/select.js';
import { Select } from '../../components/CustomSelect/select.js';
import { Byline, KeyboardShortcutHint, Pane } from '@anthropic/ink';
import { Box, setClipboard, Text, stringWidth, type KeyboardEvent } from '@anthropic/ink';
import { logEvent } from '../../services/analytics/index.js';
import type { LocalJSXCommandCall } from '../../types/command.js';
import type { AssistantMessage, Message } from '../../types/message.js';
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';
import { extractTextContent, stripPromptXMLTags } from '../../utils/messages.js';
import { countCharInString } from '../../utils/stringUtils.js';

const COPY_DIR = join(tmpdir(), 'claude');
const RESPONSE_FILENAME = 'response.md';
const MAX_LOOKBACK = 20;

type CodeBlock = {
  code: string;
  lang: string | undefined;
};

function extractCodeBlocks(markdown: string): CodeBlock[] {
  const tokens = marked.lexer(stripPromptXMLTags(markdown));
  const blocks: CodeBlock[] = [];
  for (const token of tokens) {
    if (token.type === 'code') {
      const codeToken = token as Tokens.Code;
      blocks.push({ code: codeToken.text, lang: codeToken.lang });
    }
  }
  return blocks;
}

/**
 * Walk messages newest-first, returning text from assistant messages that
 * actually said something (skips tool-use-only turns and API errors).
 * Index 0 = latest, 1 = second-to-latest, etc. Caps at MAX_LOOKBACK.
 */
export function collectRecentAssistantTexts(messages: Message[]): string[] {
  const texts: string[] = [];
  for (let i = messages.length - 1; i >= 0 && texts.length < MAX_LOOKBACK; i--) {
    const msg = messages[i];
    if (msg?.type !== 'assistant' || msg.isApiErrorMessage) continue;
    const content = (msg as AssistantMessage).message.content;
    if (!Array.isArray(content)) continue;
    const text = extractTextContent(content, '\n\n');
    if (text) texts.push(text);
  }
  return texts;
}

export function fileExtension(lang: string | undefined): string {
  if (lang) {
    // Sanitize to prevent path traversal (e.g. ```../../etc/passwd)
    // Language identifiers are alphanumeric: python, tsx, jsonc, etc.
    const sanitized = lang.replace(/[^a-zA-Z0-9]/g, '');
    if (sanitized && sanitized !== 'plaintext') {
      return `.${sanitized}`;
    }
  }
  return '.txt';
}

async function writeToFile(text: string, filename: string): Promise<string> {
  const filePath = join(COPY_DIR, filename);
  await mkdir(COPY_DIR, { recursive: true });
  await writeFile(filePath, text, 'utf-8');
  return filePath;
}

async function copyOrWriteToFile(text: string, filename: string): Promise<string> {
  const raw = await setClipboard(text);
  if (raw) process.stdout.write(raw);
  const lineCount = countCharInString(text, '\n') + 1;
  const charCount = text.length;
  // Also write to a temp file — clipboard paths are best-effort (OSC 52 needs
  // terminal support), so the file provides a reliable fallback.
  try {
    const filePath = await writeToFile(text, filename);
    return `Copied to clipboard (${charCount} characters, ${lineCount} lines)\nAlso written to ${filePath}`;
  } catch {
    return `Copied to clipboard (${charCount} characters, ${lineCount} lines)`;
  }
}

function truncateLine(text: string, maxLen: number): string {
  const firstLine = text.split('\n')[0] ?? '';
  if (stringWidth(firstLine) <= maxLen) {
    return firstLine;
  }
  let result = '';
  let width = 0;
  const targetWidth = maxLen - 1;
  for (const char of firstLine) {
    const charWidth = stringWidth(char);
    if (width + charWidth > targetWidth) break;
    result += char;
    width += charWidth;
  }
  return result + '\u2026';
}

type PickerProps = {
  fullText: string;
  codeBlocks: CodeBlock[];
  messageAge: number;
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
};

type PickerSelection = number | 'full' | 'always';

function CopyPicker({ fullText, codeBlocks, messageAge, onDone }: PickerProps): React.ReactNode {
  const focusedRef = useRef<PickerSelection>('full');

  const options: OptionWithDescription<PickerSelection>[] = [
    {
      label: 'Full response',
      value: 'full' as const,
      description: `${fullText.length} chars, ${countCharInString(fullText, '\n') + 1} lines`,
    },
    ...codeBlocks.map((block, index) => {
      const blockLines = countCharInString(block.code, '\n') + 1;
      return {
        label: truncateLine(block.code, 60),
        value: index,
        description:
          [block.lang, blockLines > 1 ? `${blockLines} lines` : undefined].filter(Boolean).join(', ') || undefined,
      };
    }),
    {
      label: 'Always copy full response',
      value: 'always' as const,
      description: 'Skip this picker in the future (revert via /config)',
    },
  ];

  function getSelectionContent(selected: PickerSelection): {
    text: string;
    filename: string;
    blockIndex?: number;
  } {
    if (selected === 'full' || selected === 'always') {
      return { text: fullText, filename: RESPONSE_FILENAME };
    }
    const block = codeBlocks[selected]!;
    return {
      text: block.code,
      filename: `copy${fileExtension(block.lang)}`,
      blockIndex: selected,
    };
  }

  async function handleSelect(selected: PickerSelection): Promise<void> {
    const content = getSelectionContent(selected);
    if (selected === 'always') {
      if (!getGlobalConfig().copyFullResponse) {
        saveGlobalConfig(c => ({ ...c, copyFullResponse: true }));
      }
      logEvent('tengu_copy', {
        block_count: codeBlocks.length,
        always: true,
        message_age: messageAge,
      });
      const result = await copyOrWriteToFile(content.text, content.filename);
      onDone(`${result}\nPreference saved. Use /config to change copyFullResponse`);
      return;
    }
    logEvent('tengu_copy', {
      selected_block: content.blockIndex,
      block_count: codeBlocks.length,
      message_age: messageAge,
    });
    const result = await copyOrWriteToFile(content.text, content.filename);
    onDone(result);
  }

  async function handleWrite(selected: PickerSelection): Promise<void> {
    const content = getSelectionContent(selected);
    logEvent('tengu_copy', {
      selected_block: content.blockIndex,
      block_count: codeBlocks.length,
      message_age: messageAge,
      write_shortcut: true,
    });
    try {
      const filePath = await writeToFile(content.text, content.filename);
      onDone(`Written to ${filePath}`);
    } catch (e) {
      onDone(`Failed to write file: ${e instanceof Error ? e.message : e}`);
    }
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'w') {
      e.preventDefault();
      void handleWrite(focusedRef.current);
    }
  }

  return (
    <Pane>
      <Box flexDirection="column" gap={1} tabIndex={0} autoFocus onKeyDown={handleKeyDown}>
        <Text dimColor>Select content to copy:</Text>
        <Select<PickerSelection>
          options={options}
          hideIndexes={false}
          onFocus={value => {
            focusedRef.current = value;
          }}
          onChange={selected => {
            void handleSelect(selected);
          }}
          onCancel={() => {
            onDone('Copy cancelled', { display: 'system' });
          }}
        />
        <Text dimColor>
          <Byline>
            <KeyboardShortcutHint shortcut="enter" action="copy" />
            <KeyboardShortcutHint shortcut="w" action="write to file" />
            <KeyboardShortcutHint shortcut="esc" action="cancel" />
          </Byline>
        </Text>
      </Box>
    </Pane>
  );
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const texts = collectRecentAssistantTexts(context.messages);

  if (texts.length === 0) {
    onDone('No assistant message to copy');
    return null;
  }

  // /copy N reaches back N-1 messages (1 = latest, 2 = second-to-latest, ...)
  let age = 0;
  const arg = args?.trim();
  if (arg) {
    const n = Number(arg);
    if (!Number.isInteger(n) || n < 1) {
      onDone(`Usage: /copy [N] where N is 1 (latest), 2, 3, \u2026 Got: ${arg}`);
      return null;
    }
    if (n > texts.length) {
      onDone(`Only ${texts.length} assistant ${texts.length === 1 ? 'message' : 'messages'} available to copy`);
      return null;
    }
    age = n - 1;
  }

  const text = texts[age]!;
  const codeBlocks = extractCodeBlocks(text);
  const config = getGlobalConfig();

  if (codeBlocks.length === 0 || config.copyFullResponse) {
    logEvent('tengu_copy', {
      always: config.copyFullResponse,
      block_count: codeBlocks.length,
      message_age: age,
    });
    const result = await copyOrWriteToFile(text, RESPONSE_FILENAME);
    onDone(result);
    return null;
  }

  return <CopyPicker fullText={text} codeBlocks={codeBlocks} messageAge={age} onDone={onDone} />;
};
