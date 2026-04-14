import { FormatlyOptions, FormatlyReport } from './types.js';

declare function formatly(patterns: string[], options?: FormatlyOptions): Promise<FormatlyReport>;

export { formatly };
