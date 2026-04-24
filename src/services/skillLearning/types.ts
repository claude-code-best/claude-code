export type SkillLearningScope = 'project' | 'global'

export type SkillGapStatus = 'pending' | 'draft' | 'active' | 'rejected'

export type SkillObservationEvent =
  | 'user_message'
  | 'assistant_message'
  | 'tool_start'
  | 'tool_complete'
  | 'tool_error'

export type SkillObservationOutcome = 'success' | 'failure' | 'unknown'

export const INSTINCT_DOMAINS = [
  'workflow',
  'testing',
  'debugging',
  'code-style',
  'security',
  'git',
  'project',
] as const

export type InstinctDomain = (typeof INSTINCT_DOMAINS)[number]

export type InstinctSource =
  | 'session-observation'
  | 'repo-analysis'
  | 'imported'

export type InstinctStatus =
  | 'pending'
  | 'active'
  | 'stale'
  | 'superseded'
  | 'retired'
  | 'archived'
  | 'conflict-hold'

export type ProjectContextSource =
  | 'claude_project_dir'
  | 'git_remote'
  | 'git_root'
  | 'global'

export interface SkillObservation {
  id: string
  timestamp: string
  event: SkillObservationEvent
  sessionId: string
  projectId: string
  projectName: string
  cwd: string
  toolName?: string
  toolInput?: unknown
  toolOutput?: unknown
  messageText?: string
  outcome?: SkillObservationOutcome
}

export interface Instinct {
  id: string
  trigger: string
  action: string
  confidence: number
  domain: InstinctDomain
  source: InstinctSource
  scope: SkillLearningScope
  projectId?: string
  projectName?: string
  evidence: string[]
  evidenceOutcome?: SkillObservationOutcome
  createdAt: string
  updatedAt: string
  status: InstinctStatus
}

export interface LearnedSkillDraft {
  name: string
  description: string
  scope: SkillLearningScope
  sourceInstinctIds: string[]
  confidence: number
  content: string
  outputPath: string
}

export interface SkillLearningProjectContext {
  projectId: string
  projectName: string
  scope: SkillLearningScope
  source: ProjectContextSource
  cwd: string
  projectRoot?: string
  gitRemote?: string
  storageDir: string
}

export interface SkillLearningProjectRecord
  extends SkillLearningProjectContext {
  firstSeenAt: string
  lastSeenAt: string
}

export interface SkillLearningProjectsRegistry {
  version: 1
  updatedAt: string
  projects: Record<string, SkillLearningProjectRecord>
}
