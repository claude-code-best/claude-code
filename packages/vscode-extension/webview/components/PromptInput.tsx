import React, { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import type { AvailableCommand } from "../lib/acp/types";
import type { UserMessageImage } from "../lib/types";
import { getSlashMenuState, getStringMeta } from "../lib/slashCommands";
import { CommandMenu } from "./CommandMenu";

export interface PromptInputHandle {
  focus: () => void;
  insert: (text: string) => void;
  setValue: (text: string) => void;
}

interface PromptInputProps {
  disabled: boolean;
  isLoading: boolean;
  placeholder: string;
  availableCommands: AvailableCommand[];
  permissionMode: string;
  onSend: (text: string, images?: UserMessageImage[]) => void;
  onCancel: () => void;
  onCycleMode: () => void;
  onNewSession?: () => void;
  onOpenModelPicker?: () => void;
  onSetMode?: (modeId: string) => void;
  /** Returns matched files for @-mention popup; provided by useACP. */
  findFiles: (query: string) => Promise<Array<{ path: string; relPath: string }>>;
  /** Provides the prompt history for ↑/↓ navigation. */
  promptHistory: string[];
  onPromptSubmitted?: (text: string) => void;
}

const HISTORY_NAVIGATION_HINT = "Up/Down: history · Tab: complete · Shift+Tab: cycle mode · Esc: cancel";

export const PromptInput = forwardRef<PromptInputHandle, PromptInputProps>(function PromptInput(
  {
    disabled,
    isLoading,
    placeholder,
    availableCommands,
    permissionMode,
    onSend,
    onCancel,
    onCycleMode,
    findFiles,
    promptHistory,
    onPromptSubmitted,
  },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const [pendingImages, setPendingImages] = useState<UserMessageImage[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [savedDraft, setSavedDraft] = useState<string | null>(null);
  const [dismissedSlashValue, setDismissedSlashValue] = useState<string | null>(null);

  // Slash-command menu state derived from textarea content.
  const slashFilter = getSlashMenuState(value, availableCommands);
  const slashVisible = slashFilter.visible && dismissedSlashValue !== value;

  // @-mention popup state.
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const [atResults, setAtResults] = useState<Array<{ path: string; relPath: string }>>([]);
  const [atIndex, setAtIndex] = useState(0);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    insert: (text) => {
      const el = textareaRef.current;
      if (!el) return;
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      const next = value.slice(0, start) + text + value.slice(end);
      setValue(next);
      requestAnimationFrame(() => {
        el.focus();
        const cursor = start + text.length;
        el.setSelectionRange(cursor, cursor);
        autoresize(el);
      });
    },
    setValue: (text) => {
      setValue(text);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) autoresize(el);
      });
    },
  }), [value]);

  const clearAtPopup = () => {
    setAtQuery(null);
    setAtResults([]);
    setAtIndex(0);
  };

  // Resolve @ trigger asynchronously
  useEffect(() => {
    if (atQuery === null) return;
    let cancelled = false;
    (async () => {
      const results = await findFiles(atQuery);
      if (!cancelled) {
        setAtResults(results);
        setAtIndex(0);
      }
    })();
    return () => { cancelled = true; };
  }, [atQuery, findFiles]);

  const updateAtState = useCallback((text: string, cursorPos: number) => {
    // Find the @ token closest to the cursor (within whitespace bounds).
    const before = text.slice(0, cursorPos);
    const match = before.match(/(?:^|\s)@([^\s]*)$/);
    if (match) {
      setAtQuery(match[1]);
    } else if (atQuery !== null) {
      clearAtPopup();
    }
  }, [atQuery]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      setValue(next);
      autoresize(e.target);
      // Reset history navigation when user types.
      if (historyIndex !== -1) {
        setHistoryIndex(-1);
        setSavedDraft(null);
      }
      updateAtState(next, e.target.selectionStart ?? next.length);
    },
    [historyIndex, updateAtState],
  );

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    if (!items || items.length === 0) return;
    const newImages: UserMessageImage[] = [];
    for (const item of items) {
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (!file || !file.type.startsWith("image/")) continue;
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const commaIdx = result.indexOf(",");
        const data = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
        newImages.push({ mimeType: file.type, data });
        if (newImages.length === 1) {
          setPendingImages((prev) => [...prev, newImages[0]]);
        }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed && pendingImages.length === 0) return;
    if (disabled) return;
    onSend(trimmed, pendingImages.length > 0 ? pendingImages : undefined);
    onPromptSubmitted?.(trimmed);
    setValue("");
    setPendingImages([]);
    setHistoryIndex(-1);
    setSavedDraft(null);
    clearAtPopup();
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.style.height = "auto";
        el.focus();
      }
    });
  }, [value, pendingImages, disabled, onSend, onPromptSubmitted]);

  const handleHistoryNav = useCallback((direction: "up" | "down") => {
    if (promptHistory.length === 0) return;
    if (direction === "up") {
      const next = historyIndex + 1;
      if (next >= promptHistory.length) return;
      if (historyIndex === -1) setSavedDraft(value);
      setHistoryIndex(next);
      setValue(promptHistory[next]);
    } else {
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setValue(savedDraft ?? "");
        setSavedDraft(null);
      } else {
        const next = historyIndex - 1;
        setHistoryIndex(next);
        setValue(promptHistory[next]);
      }
    }
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        autoresize(el);
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
  }, [historyIndex, promptHistory, value, savedDraft]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Slash-command menu intercepts arrow keys / Enter / Tab.
      // CommandMenu listens at document-level — but we still need to skip our
      // own behaviours when the menu is showing.
      if (slashVisible) {
        return;
      }
      // @-mention popup priority
      if (atQuery !== null && atResults.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setAtIndex((i) => (i + 1) % atResults.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setAtIndex((i) => (i - 1 + atResults.length) % atResults.length);
          return;
        }
        if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
          e.preventDefault();
          const pick = atResults[atIndex];
          if (pick) {
            const el = textareaRef.current;
            if (!el) return;
            const cursor = el.selectionStart ?? value.length;
            const before = value.slice(0, cursor);
            const after = value.slice(cursor);
            const newBefore = before.replace(/(^|\s)@[^\s]*$/, (full, lead) => `${lead}@${pick.relPath} `);
            const next = newBefore + after;
            setValue(next);
            requestAnimationFrame(() => {
              el.focus();
              const newPos = newBefore.length;
              el.setSelectionRange(newPos, newPos);
              autoresize(el);
            });
            clearAtPopup();
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          clearAtPopup();
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as KeyboardEvent).isComposing) {
        e.preventDefault();
        submit();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (isLoading) onCancel();
        return;
      }
      if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        onCycleMode();
        return;
      }
      // Up/Down history nav only when textarea is single-line / cursor at extremes.
      if (e.key === "ArrowUp" && isAtFirstLine(textareaRef.current)) {
        e.preventDefault();
        handleHistoryNav("up");
        return;
      }
      if (e.key === "ArrowDown" && isAtLastLine(textareaRef.current)) {
        if (historyIndex >= 0) {
          e.preventDefault();
          handleHistoryNav("down");
        }
        return;
      }
    },
    [slashVisible, atQuery, atResults, atIndex, value, submit, isLoading, onCancel, onCycleMode, handleHistoryNav, historyIndex],
  );

  const onSlashSelect = useCallback((cmd: AvailableCommand) => {
    const argumentFor = getStringMeta(cmd, "ccbArgumentFor");
    const argumentValue = getStringMeta(cmd, "ccbArgumentValue");
    const nextValue = argumentFor && argumentValue ? `/${argumentFor} ${argumentValue} ` : `/${cmd.name} `;
    setDismissedSlashValue(null);
    setValue(nextValue);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        autoresize(el);
        const pos = el.value.length;
        el.setSelectionRange(pos, pos);
        el.focus();
      }
    });
  }, []);

  return (
    <div className="prompt-input-container">
      <CommandMenu
        commands={availableCommands}
        filter={slashFilter.filter}
        visible={slashVisible}
        commandName={slashFilter.commandName}
        onSelect={onSlashSelect}
        onClose={() => setDismissedSlashValue(value)}
      />

      {atQuery !== null && atResults.length > 0 && (
        <div className="at-mention-menu">
          {atResults.map((entry, i) => (
            <button
              key={entry.path}
              type="button"
              className={`at-mention-item ${i === atIndex ? "active" : ""}`}
              onMouseEnter={() => setAtIndex(i)}
              onClick={() => {
                const el = textareaRef.current;
                if (!el) return;
                const cursor = el.selectionStart ?? value.length;
                const before = value.slice(0, cursor);
                const after = value.slice(cursor);
                const newBefore = before.replace(/(^|\s)@[^\s]*$/, (full, lead) => `${lead}@${entry.relPath} `);
                const next = newBefore + after;
                setValue(next);
                requestAnimationFrame(() => {
                  el.focus();
                  const newPos = newBefore.length;
                  el.setSelectionRange(newPos, newPos);
                  autoresize(el);
                });
                clearAtPopup();
              }}
            >
              <span className="at-mention-name">{entry.relPath}</span>
            </button>
          ))}
        </div>
      )}

      {pendingImages.length > 0 && (
        <div className="prompt-attachments">
          {pendingImages.map((img, i) => (
            <div key={i} className="prompt-attachment">
              <img src={`data:${img.mimeType};base64,${img.data}`} alt={`attachment-${i}`} />
              <button
                type="button"
                className="prompt-attachment-remove"
                aria-label="Remove image"
                onClick={() => setPendingImages((prev) => prev.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="prompt-input-wrapper">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={handleChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled && !isLoading}
          aria-label="Message input"
        />
        {isLoading ? (
          <button type="button" className="prompt-cancel-btn" onClick={onCancel} title="Cancel (Esc)">
            ◼
          </button>
        ) : (
          <button
            type="button"
            className="prompt-send-btn"
            onClick={submit}
            disabled={disabled || (value.trim() === "" && pendingImages.length === 0)}
            title="Send (Enter)"
          >
            ▶
          </button>
        )}
      </div>

      <div className="prompt-hint">
        <span className="prompt-mode">mode: <strong>{permissionMode}</strong></span>
        <span className="prompt-keys">{HISTORY_NAVIGATION_HINT}</span>
      </div>
    </div>
  );
});

// =============================================================================
// helpers
// =============================================================================

function autoresize(el: HTMLTextAreaElement): void {
  el.style.height = "auto";
  const max = 240;
  el.style.height = `${Math.min(el.scrollHeight, max)}px`;
}

function isAtFirstLine(el: HTMLTextAreaElement | null): boolean {
  if (!el) return false;
  const cursor = el.selectionStart ?? 0;
  return el.value.slice(0, cursor).indexOf("\n") === -1;
}

function isAtLastLine(el: HTMLTextAreaElement | null): boolean {
  if (!el) return false;
  const cursor = el.selectionStart ?? 0;
  return el.value.slice(cursor).indexOf("\n") === -1;
}
