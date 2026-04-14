import type { Paginator } from "@smithy/types";
import { ListAutomatedReasoningPolicyTestCasesCommandInput, ListAutomatedReasoningPolicyTestCasesCommandOutput } from "../commands/ListAutomatedReasoningPolicyTestCasesCommand";
import type { BedrockPaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListAutomatedReasoningPolicyTestCases: (config: BedrockPaginationConfiguration, input: ListAutomatedReasoningPolicyTestCasesCommandInput, ...rest: any[]) => Paginator<ListAutomatedReasoningPolicyTestCasesCommandOutput>;
