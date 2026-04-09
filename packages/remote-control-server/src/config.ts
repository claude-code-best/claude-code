export const config = {
  version: process.env.RCS_VERSION || "0.1.0",
  port: parseInt(process.env.RCS_PORT || "3000"),
  host: process.env.RCS_HOST || "0.0.0.0",
  apiKeys: (process.env.RCS_API_KEYS || "").split(",").filter(Boolean),
  baseUrl: process.env.RCS_BASE_URL || "",
  pollTimeout: parseInt(process.env.RCS_POLL_TIMEOUT || "8"),
  heartbeatInterval: parseInt(process.env.RCS_HEARTBEAT_INTERVAL || "20"),
  jwtExpiresIn: parseInt(process.env.RCS_JWT_EXPIRES_IN || "3600"),
  disconnectTimeout: parseInt(process.env.RCS_DISCONNECT_TIMEOUT || "300"),
} as const;

export function getBaseUrl(): string {
  if (config.baseUrl) return config.baseUrl;
  return `http://localhost:${config.port}`;
}
