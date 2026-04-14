import { Formatter } from './types.js';

declare function resolveFormatter(cwd?: string): Promise<Formatter | undefined>;

export { resolveFormatter };
