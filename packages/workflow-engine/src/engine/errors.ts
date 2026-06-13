/** 引擎级可预期错误（脚本错、上限、嵌套）。 */
export class WorkflowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowError'
  }
}

/** workflow 被 abort（kill）。 */
export class WorkflowAbortedError extends Error {
  constructor() {
    super('workflow 已被取消（abort）')
    this.name = 'WorkflowAbortedError'
  }
}
