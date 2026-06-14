export class BudgetExhaustedError extends Error {
  constructor() {
    super('workflow token budget exhausted (budget.total reached the cap)')
    this.name = 'BudgetExhaustedError'
  }
}

/**
 * Token budget accumulator. The script reads via `budget.total / budget.spent() / budget.remaining()`;
 * assertCanSpend() enforces a hard cap before each agent() call.
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
