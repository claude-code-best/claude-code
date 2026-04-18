export interface Environment {
  id: string;
  machine_name?: string;
  directory?: string;
  status: string;
  branch?: string;
  worker_type?: string;
  capabilities?: Record<string, unknown> | null;
}

export interface Session {
  id: string;
  title?: string;
  status: string;
  environment_id?: string;
  source?: string;
  created_at?: number;
  updated_at?: number;
  automation_state?: unknown;
}

export interface SessionEvent {
  type: string;
  payload?: EventPayload;
  direction?: "inbound" | "outbound";
  seqNum?: number;
  id?: string;
}

export interface EventPayload {
  content?: string;
  message?: unknown;
  status?: string;
  uuid?: string;
  raw?: {
    uuid?: string;
    status?: string;
  };
  request_id?: string;
  request?: PermissionRequest;
  tool_name?: string;
  tool_input?: unknown;
  input?: unknown;
  description?: string;
}

export interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
  is_error?: boolean;
}

export interface PermissionRequest {
  subtype?: string;
  tool_name?: string;
  input?: unknown;
  tool_input?: unknown;
  description?: string;
}

export interface Question {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options?: QuestionOption[];
  metadata?: Record<string, unknown>;
}

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface ControlResponse {
  type: "permission_response";
  approved: boolean;
  request_id: string;
  message?: string;
  updated_input?: Record<string, unknown>;
  updated_permissions?: PermissionUpdate[];
}

export interface PermissionUpdate {
  type: string;
  mode: string;
  destination: string;
}

export type ActivityMode = "working" | "idle" | "standby" | "sleeping";

export interface AutomationActivity {
  mode: ActivityMode;
  iconVariant: string;
  label: string;
  endsAt?: number;
}
