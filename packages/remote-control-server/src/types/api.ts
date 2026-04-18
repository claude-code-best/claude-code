/** API 请求/响应类型定义 */

// Hono context variable types
declare module "hono" {
  interface ContextVariableMap {
    username?: string;
    uuid?: string;
    jwtPayload?: { session_id: string; role: string; iat: number; exp: number };
  }
}

// --- Environment ---

export interface RegisterEnvironmentRequest {
  machine_name?: string;
  directory?: string;
  branch?: string;
  git_repo_url?: string;
  max_sessions?: number;
  worker_type?: string;
  bridge_id?: string;
  capabilities?: Record<string, unknown>;
}

export interface RegisterEnvironmentResponse {
  id: string;
  secret: string;
  status: string;
}

export interface WorkResponse {
  id: string;
  type: "work";
  environment_id: string;
  state: string;
  data: {
    type: "session" | "healthcheck";
    id: string;
  };
  secret: string;
  created_at: string;
}

export interface WorkSecretPayload {
  version: number;
  session_ingress_token: string;
  api_base_url: string;
  sources: string[];
  auth: string[];
  use_code_sessions: boolean;
}

// --- Session ---

export interface CreateSessionRequest {
  environment_id?: string | null;
  title?: string;
  events?: unknown[];
  source?: string;
  permission_mode?: string;
}

export interface SessionResponse {
  id: string;
  environment_id: string | null;
  title: string | null;
  status: string;
  source: string;
  permission_mode: string | null;
  worker_epoch: number;
  username: string | null;
  created_at: number;
  updated_at: number;
  automation_state?: AutomationStateResponse;
}

export interface AutomationStateResponse {
  enabled: boolean;
  phase: "standby" | "sleeping" | null;
  next_tick_at: number | null;
  sleep_until: number | null;
}

// --- v2 Code Sessions ---

export interface CreateCodeSessionRequest {
  title?: string;
  source?: string;
  permission_mode?: string;
}

export interface BridgeResponse {
  api_base_url: string;
  worker_epoch: number;
  worker_jwt: string;
  expires_in: number;
}

// --- Web ---

export interface EnvironmentResponse {
  id: string;
  machine_name: string | null;
  directory: string | null;
  branch: string | null;
  status: string;
  username: string | null;
  last_poll_at: number | null;
  worker_type?: string;
  capabilities?: Record<string, unknown> | null;
}

export interface SessionSummaryResponse {
  id: string;
  title: string | null;
  status: string;
  username: string | null;
  updated_at: number;
}

// --- Web Auth ---

export interface WebLoginRequest {
  apiKey: string;
  username: string;
}

export interface WebLoginResponse {
  token: string;
  expires_in: number;
}

export interface WebControlRequest {
  type: string;
  content?: string;
  [key: string]: unknown;
}

// --- Error ---

export interface ErrorResponse {
  error: {
    type: string;
    message: string;
  };
}

// --- Event ---

export interface SessionEventPayload {
  id: string;
  session_id: string;
  type: string;
  payload: unknown;
  direction: "inbound" | "outbound";
  seq_num: number;
  created_at: number;
}
