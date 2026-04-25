import * as vscode from "vscode";

export interface HistoryEntry {
  id: string; // sessionId from agent
  title: string;
  timestamp: number; // unix ms
  messageCount: number;
  model: string;
  preview: string;
  cwd?: string;
}

const HISTORY_KEY = "ccb.chatHistory";
const LAST_SESSION_KEY = "ccb.lastSessionId";
const PROMPT_HISTORY_KEY = "ccb.promptHistory";
const MAX_ENTRIES = 50;
const MAX_PROMPTS = 200;

/**
 * Persists session metadata + prompt-text history in VSCode globalState
 * (per-machine, survives reloads). Session IDs come from the ACP agent so
 * they map directly to `unstable_resumeSession` / `loadSession` requests.
 */
export class HistoryManager {
  constructor(private readonly globalState: vscode.Memento) {}

  // Session metadata --------------------------------------------------------
  getAll(): HistoryEntry[] {
    return this.globalState.get<HistoryEntry[]>(HISTORY_KEY, []);
  }

  upsert(entry: HistoryEntry): void {
    const existing = this.getAll().filter((e) => e.id !== entry.id);
    const next = [entry, ...existing].slice(0, MAX_ENTRIES);
    void this.globalState.update(HISTORY_KEY, next);
  }

  remove(id: string): void {
    const next = this.getAll().filter((e) => e.id !== id);
    void this.globalState.update(HISTORY_KEY, next);
  }

  clearSessions(): void {
    void this.globalState.update(HISTORY_KEY, []);
  }

  getRecent(count: number): HistoryEntry[] {
    return this.getAll().slice(0, count);
  }

  // Last-active session (for resume on extension reload)
  getLastSessionId(): string | undefined {
    return this.globalState.get<string>(LAST_SESSION_KEY);
  }

  setLastSessionId(id: string | undefined): void {
    void this.globalState.update(LAST_SESSION_KEY, id);
  }

  // Prompt history (for Up/Down navigation + Ctrl+R search) ----------------
  getPromptHistory(): string[] {
    return this.globalState.get<string[]>(PROMPT_HISTORY_KEY, []);
  }

  pushPrompt(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    const existing = this.getPromptHistory();
    // Drop consecutive duplicate.
    if (existing[0] === trimmed) return;
    const next = [trimmed, ...existing.filter((p) => p !== trimmed)].slice(0, MAX_PROMPTS);
    void this.globalState.update(PROMPT_HISTORY_KEY, next);
  }

  clearPromptHistory(): void {
    void this.globalState.update(PROMPT_HISTORY_KEY, []);
  }
}
