import { createHash } from "node:crypto";
import { config } from "../config";

/** Validate a raw API key token string */
export function validateApiKey(token: string | undefined): boolean {
  if (!token) return false;
  return config.apiKeys.includes(token);
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
