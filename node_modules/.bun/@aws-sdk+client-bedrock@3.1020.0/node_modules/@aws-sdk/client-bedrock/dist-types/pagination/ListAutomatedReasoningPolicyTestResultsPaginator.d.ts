import type { Paginator } from "@smithy/types";
import { ListAutomatedReasoningPolicyTestResultsCommandInput, ListAutomatedReasoningPolicyTestResultsCommandOutput } from "../commands/ListAutomatedReasoningPolicyTestResultsCommand";
import type { BedrockPaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListAutomatedReasoningPolicyTestResults: (config: BedrockPaginationConfiguration, input: ListAutomatedReasoningPolicyTestResultsCommandInput, ...rest: any[]) => Paginator<ListAutomatedReasoningPolicyTestResultsCommandOutput>;
