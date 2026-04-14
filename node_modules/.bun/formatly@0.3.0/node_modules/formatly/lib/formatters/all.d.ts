import { FormatterRunner } from '../types.js';

declare const formatters: [{
    readonly name: "biome";
    readonly runner: FormatterRunner;
    readonly testers: {
        readonly configFile: RegExp;
        readonly script: RegExp;
    };
}, {
    readonly name: "deno";
    readonly runner: FormatterRunner;
    readonly testers: {
        readonly configFile: RegExp;
        readonly script: RegExp;
    };
}, {
    readonly name: "dprint";
    readonly runner: FormatterRunner;
    readonly testers: {
        readonly configFile: RegExp;
        readonly script: RegExp;
    };
}, {
    readonly name: "prettier";
    readonly runner: FormatterRunner;
    readonly testers: {
        readonly configFile: RegExp;
        readonly packageKey: "prettier";
        readonly script: RegExp;
    };
}];

export { formatters };
