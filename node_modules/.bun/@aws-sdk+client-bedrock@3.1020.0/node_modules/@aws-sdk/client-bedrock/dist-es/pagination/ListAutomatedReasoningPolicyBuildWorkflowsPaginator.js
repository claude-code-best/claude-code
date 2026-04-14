import { createPaginator } from "@smithy/core";
import { BedrockClient } from "../BedrockClient";
import { ListAutomatedReasoningPolicyBuildWorkflowsCommand, } from "../commands/ListAutomatedReasoningPolicyBuildWorkflowsCommand";
export const paginateListAutomatedReasoningPolicyBuildWorkflows = createPaginator(BedrockClient, ListAutomatedReasoningPolicyBuildWorkflowsCommand, "nextToken", "nextToken", "maxResults");
