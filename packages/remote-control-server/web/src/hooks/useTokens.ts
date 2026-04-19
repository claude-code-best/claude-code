import { useState, useCallback } from "react";

export interface TokenEntry {
  id: string;
  token: string;
  label: string;
}

const TOKENS_KEY = "rcs_tokens";
const ACTIVE_TOKEN_KEY = "rcs_uuid";
const DEFAULT_ID = "__default__";

function generateId(): string {
  return `tk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Ensure the existing rcs_uuid is present as the default token entry */
function ensureDefault(tokens: TokenEntry[]): TokenEntry[] {
  if (tokens.some((t) => t.id === DEFAULT_ID)) return tokens;
  let uuid: string | null = null;
  try {
    uuid = localStorage.getItem("rcs_uuid");
  } catch {
    // ignore
  }
  if (!uuid) return tokens;
  return [{ id: DEFAULT_ID, token: uuid, label: "Default" }, ...tokens];
}

function loadTokens(): TokenEntry[] {
  let tokens: TokenEntry[] = [];
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) tokens = parsed;
    }
  } catch {
    // ignore
  }
  return ensureDefault(tokens);
}

function loadActiveTokenId(tokens: TokenEntry[]): string {
  // Try saved active token
  try {
    const saved = localStorage.getItem(ACTIVE_TOKEN_KEY);
    if (saved && tokens.some((t) => t.id === saved)) return saved;
  } catch {
    // ignore
  }
  // Fall back to default (rcs_uuid) entry
  const defaultEntry = tokens.find((t) => t.id === DEFAULT_ID);
  if (defaultEntry) return defaultEntry.id;
  // Fall back to first entry
  return tokens[0]?.id ?? DEFAULT_ID;
}

export function useTokens() {
  const [tokens, setTokens] = useState<TokenEntry[]>(loadTokens);
  const [activeTokenId, setActiveTokenIdState] = useState<string>(() => loadActiveTokenId(loadTokens()));

  const persistTokens = useCallback((next: TokenEntry[]) => {
    setTokens(next);
    try {
      localStorage.setItem(TOKENS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const setActiveTokenId = useCallback((id: string) => {
    setActiveTokenIdState(id);
    try {
      localStorage.setItem(ACTIVE_TOKEN_KEY, id);
	  location.reload(); // Reload to ensure api client picks up new token from localStorage
    } catch {
      // ignore
    }
  }, []);

  const addToken = useCallback((token: string, label: string): string | null => {
    const trimmed = token.trim();
    if (!trimmed) return "Token is required";
    const entry: TokenEntry = { id: generateId(), token: trimmed, label: label.trim() || trimmed.slice(0, 8) };
    const next = [...tokens, entry];
    persistTokens(next);
    return null;
  }, [tokens, persistTokens]);

  const removeToken = useCallback((id: string) => {
    if (id === DEFAULT_ID) return; // Cannot remove default
    const next = tokens.filter((t) => t.id !== id);
    persistTokens(next);
    if (activeTokenId === id) {
      setActiveTokenId(DEFAULT_ID);
    }
  }, [tokens, persistTokens, activeTokenId, setActiveTokenId]);

  const updateToken = useCallback((id: string, label: string) => {
    const next = tokens.map((t) => t.id === id ? { ...t, label } : t);
    persistTokens(next);
  }, [tokens, persistTokens]);

  const activeToken = tokens.find((t) => t.id === activeTokenId) ?? tokens[0] ?? null;
  const activeLabel = activeToken?.label ?? "Default";
  const activeTokenValue = activeToken?.token ?? null;

  return {
    tokens,
    activeTokenId,
    activeToken,
    activeLabel,
    activeTokenValue,
    setActiveTokenId,
    addToken,
    removeToken,
    updateToken,
  };
}
