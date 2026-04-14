import { FormatterRunnerOptions, FormatlyReportChildProcessResult } from '../types.js';

declare function runFormatterCommand(runner: string, { cwd, patterns }: FormatterRunnerOptions): Promise<FormatlyReportChildProcessResult>;

export { runFormatterCommand };
