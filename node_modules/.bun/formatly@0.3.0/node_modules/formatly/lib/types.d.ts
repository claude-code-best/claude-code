interface FormatlyOptions {
    cwd?: string;
    /**
     * Pass an explicitly formatter to use instead of automatically detecting
     */
    formatter?: FormatterName;
}
type FormatlyReport = FormatlyReportError | FormatlyReportResult;
interface FormatlyReportChildProcessResult {
    code: null | number;
    runner: "child_process";
    signal: NodeJS.Signals | null;
}
interface FormatlyReportError {
    message: string;
    ran: false;
}
interface FormatlyReportResult {
    formatter: Formatter;
    ran: true;
    result: FormatlyReportChildProcessResult | FormatlyReportVirtualResult;
}
interface FormatlyReportVirtualResult {
    runner: "virtual";
}
interface Formatter {
    name: FormatterName;
    runner: FormatterRunner;
    testers: {
        configFile: RegExp;
        packageKey?: string;
        script: RegExp;
    };
}
type FormatterName = "biome" | "deno" | "dprint" | "prettier";
type FormatterRunner = (options: FormatterRunnerOptions) => Promise<FormatlyReportChildProcessResult | FormatlyReportVirtualResult>;
interface FormatterRunnerOptions {
    cwd: string;
    patterns: string[];
}

export type { FormatlyOptions, FormatlyReport, FormatlyReportChildProcessResult, FormatlyReportError, FormatlyReportResult, FormatlyReportVirtualResult, Formatter, FormatterName, FormatterRunner, FormatterRunnerOptions };
