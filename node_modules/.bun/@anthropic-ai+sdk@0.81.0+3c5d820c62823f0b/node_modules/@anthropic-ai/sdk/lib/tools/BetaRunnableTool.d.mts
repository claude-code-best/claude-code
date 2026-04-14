import { BetaMemoryTool20250818, BetaTool, BetaToolBash20241022, BetaToolBash20250124, BetaToolComputerUse20241022, BetaToolComputerUse20250124, BetaToolComputerUse20251124, BetaToolResultContentBlockParam, BetaToolTextEditor20241022, BetaToolTextEditor20250124, BetaToolTextEditor20250429, BetaToolTextEditor20250728 } from "../../resources/beta.mjs";
export type Promisable<T> = T | Promise<T>;
/**
 * Tool types that can be implemented on the client.
 * Excludes server-side tools like code execution, web search, and MCP toolsets.
 */
export type BetaClientRunnableToolType = BetaTool | BetaMemoryTool20250818 | BetaToolBash20241022 | BetaToolBash20250124 | BetaToolComputerUse20241022 | BetaToolComputerUse20250124 | BetaToolComputerUse20251124 | BetaToolTextEditor20241022 | BetaToolTextEditor20250124 | BetaToolTextEditor20250429 | BetaToolTextEditor20250728;
export type BetaRunnableTool<Input = any> = BetaClientRunnableToolType & {
    run: (args: Input) => Promisable<string | Array<BetaToolResultContentBlockParam>>;
    parse: (content: unknown) => Input;
};
//# sourceMappingURL=BetaRunnableTool.d.mts.map