import { createHash, timingSafeEqual } from "node:crypto";
import { config } from "../config";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Validate a raw API key token string */
export function validateApiKey(token: string | undefined): boolean {
  if (!token) return false;
  const tokenHash = sha256(token);
  return config.apiKeys.some((key) => timingSafeEqual(tokenHash, sha256(key)));
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
