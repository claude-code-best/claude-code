/** Engine-level expected errors (script errors, caps, nesting). */
export class WorkflowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowError'
  }
}

/** workflow was aborted (killed). */
export class WorkflowAbortedError extends Error {
  constructor() {
    super('workflow has been aborted')
    this.name = 'WorkflowAbortedError'
  }
}
