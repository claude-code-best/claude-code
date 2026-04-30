/** Thin logging wrapper — silent in test environment, uses console in production. */
const isTest = process.env.NODE_ENV === "test" || (typeof Bun !== "undefined" && !!Bun.env.BUN_TEST);

export function log(...args: unknown[]): void {
  if (!isTest) console.log(...args);
}

export function error(...args: unknown[]): void {
  if (!isTest) console.error(...args);
}
