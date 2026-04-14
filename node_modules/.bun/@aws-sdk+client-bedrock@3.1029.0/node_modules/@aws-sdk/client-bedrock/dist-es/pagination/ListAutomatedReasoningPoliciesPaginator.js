import { createPaginator } from "@smithy/core";
import { BedrockClient } from "../BedrockClient";
import { ListAutomatedReasoningPoliciesCommand, } from "../commands/ListAutomatedReasoningPoliciesCommand";
export const paginateListAutomatedReasoningPolicies = createPaginator(BedrockClient, ListAutomatedReasoningPoliciesCommand, "nextToken", "nextToken", "maxResults");
