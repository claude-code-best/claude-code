// Type re-exports for DreamTask — bridges the component tree to the task registry.
// The real implementation lives in src/tasks/DreamTask/DreamTask.ts.
// Note: Currently unused — BackgroundTasksDialog.tsx imports directly from
// src/tasks/DreamTask/DreamTask.js. Kept for decompilation completeness.

export type {
  DreamTaskState,
  DreamPhase,
  DreamTurn,
} from '../../../../../tasks/DreamTask/DreamTask.js'
export {
  isDreamTask,
  registerDreamTask,
  addDreamTurn,
  completeDreamTask,
  failDreamTask,
  DreamTask,
} from '../../../../../tasks/DreamTask/DreamTask.js'
