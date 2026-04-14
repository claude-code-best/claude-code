import type { Paginator } from "@smithy/types";
import { ListAutomatedReasoningPoliciesCommandInput, ListAutomatedReasoningPoliciesCommandOutput } from "../commands/ListAutomatedReasoningPoliciesCommand";
import type { BedrockPaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListAutomatedReasoningPolicies: (config: BedrockPaginationConfiguration, input: ListAutomatedReasoningPoliciesCommandInput, ...rest: any[]) => Paginator<ListAutomatedReasoningPoliciesCommandOutput>;
