import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Lightweight JWT implementation using HMAC-SHA256.
 * No external dependencies — uses Node.js crypto.
 *
 * Token format: base64url(header).base64url(payload).base64url(signature)
 * Used for V2 worker authentication (session ingress / SSE / CCR).
 */

interface JwtPayload {
  session_id: string;
  role: string;
  iat: number;
  exp: number;
}

function base64url(data: string | Buffer): string {
  return Buffer.from(data as unknown as ArrayLike<number>)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf-8");
}

function getSigningKey(): string {
  const key = process.env.RCS_API_KEYS?.split(",").filter(Boolean)[0];
  if (!key) throw new Error("No API key configured for JWT signing");
  return key;
}

/** Generate a JWT for worker authentication. */
export function generateWorkerJwt(
  sessionId: string,
  expiresInSeconds: number,
): string {
  const header = { alg: "HS256", typ: "JWT" };
  const payload: JwtPayload = {
    session_id: sessionId,
    role: "worker",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = createHmac("sha256", getSigningKey())
    .update(signingInput)
    .digest();

  return `${signingInput}.${base64url(signature)}`;
}

/**
 * Verify a JWT and return its payload, or null if invalid/expired.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyWorkerJwt(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;

  // Verify signature
  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac("sha256", getSigningKey())
    .update(signingInput)
    .digest();
  const actualSig = Buffer.from(
    signatureB64.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  );

  if (expectedSig.length !== actualSig.length) return null;
  if (!timingSafeEqual(expectedSig, actualSig)) return null;

  // Decode payload
  try {
    const payload: JwtPayload = JSON.parse(base64urlDecode(payloadB64));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
