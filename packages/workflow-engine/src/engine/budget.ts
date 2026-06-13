export class BudgetExhaustedError extends Error {
  constructor() {
    super('workflow token budget 已耗尽（budget.total 达到上限）')
    this.name = 'BudgetExhaustedError'
  }
}

/**
 * Token 预算累加器。脚本通过 `budget.total / budget.spent() / budget.remaining()`
 * 读取；agent() 调用前 assertCanSpend() 强制硬上限。
 */
export class Budget {
  private spentTokens = 0

  constructor(readonly total: number | null) {}

  spent(): number {
    return this.spentTokens
  }

  remaining(): number {
    return this.total == null
      ? Infinity
      : Math.max(0, this.total - this.spentTokens)
  }

  addOutputTokens(n: number): void {
    if (n > 0) this.spentTokens += n
  }

  assertCanSpend(): void {
    if (this.total != null && this.spentTokens >= this.total) {
      throw new BudgetExhaustedError()
    }
  }
}
