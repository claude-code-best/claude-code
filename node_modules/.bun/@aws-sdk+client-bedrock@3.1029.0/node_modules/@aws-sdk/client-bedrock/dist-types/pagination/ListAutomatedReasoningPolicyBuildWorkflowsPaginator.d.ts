import type { Paginator } from "@smithy/types";
import { ListAutomatedReasoningPolicyBuildWorkflowsCommandInput, ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput } from "../commands/ListAutomatedReasoningPolicyBuildWorkflowsCommand";
import type { BedrockPaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListAutomatedReasoningPolicyBuildWorkflows: (config: BedrockPaginationConfiguration, input: ListAutomatedReasoningPolicyBuildWorkflowsCommandInput, ...rest: any[]) => Paginator<ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput>;
