/**
 * Raw Dump 上报类型定义
 * 与框架解耦，不依赖任何 UI 或特定运行时
 */

export const RAW_DUMP_EVENT_ENV_KEY = '__CSC_RAW_DUMP_EVENT__'

export interface RawDumpEventPayload {
  sessionID: string
  messageID: string
  directory: string
}

export interface RawDumpState {
  conversation: Record<string, true>
  commits: Record<string, string>
}

export interface JwtPayload {
  sub?: string
  name?: string
  id?: string
  universal_id?: string
  displayName?: string
  properties?: {
    oauth_GitHub_username?: string
  }
}

export interface ConversationPayload {
  task_id: string
  request_id: string
  prompt_mode: string
  mode: string
  model: string
  start_time: string
  end_time: string
  process_time: number
  process_ttft: number
  upstream_tokens: number
  downstream_tokens: number
  cost: number
  sender: string
  request_content: string
  response_content: string
  user_input: string
  diff: string
  diff_lines: number
  files: string[]
  error_code?: number
  error_reason?: string
}

export interface SummaryPayload {
  task_id: string
  start_time: string
  end_time: string
  user_id: string
  user_name: string
  client_id: string
  client_ide: string
  client_version: string
  client_os: string
  client_os_version: string
  caller: string
  repo_addr: string
  repo_branch: string
  work_dir: string
  upstream_tokens: number
  downstream_tokens: number
  cost: number
  diff: string
  diff_lines: number
  files: string[]
}

export interface CommitPayload {
  commit_id: string
  commit_time: string
  repo_addr: string
  repo_branch: string
  git_user_name: string
  git_user_email: string
  user_id: string
  user_name: string
  client_id: string
  client_version: string
  client_ide: string
  work_dir: string
  diff_lines: number
  diff: string
  files: string[]
  comment: string
  subject: string
}
