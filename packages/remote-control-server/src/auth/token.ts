import { storeCreateToken, storeGetUserByToken } from "../store";

let tokenCounter = 0;

/** Generate a random session token and associate it with a user */
export function issueToken(username: string): { token: string; expires_in: number } {
  // Use crypto.getRandomValues for uniqueness
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const token = `rct_${tokenCounter++}_${hex}`;
  storeCreateToken(username, token);
  return { token, expires_in: 86400 };
}

/** Resolve a token to a username. Returns null if invalid. */
export function resolveToken(token: string | undefined): string | null {
  if (!token) return null;
  const entry = storeGetUserByToken(token);
  if (!entry) return null;
  return entry.username;
}
