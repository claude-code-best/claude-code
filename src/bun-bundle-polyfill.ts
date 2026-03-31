// Polyfill for bun:bundle — all feature flags return false in this build
export const feature = (_name: string): boolean => false;
