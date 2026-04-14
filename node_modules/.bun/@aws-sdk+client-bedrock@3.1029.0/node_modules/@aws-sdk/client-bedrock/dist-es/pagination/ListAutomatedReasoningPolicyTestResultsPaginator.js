import { createPaginator } from "@smithy/core";
import { BedrockClient } from "../BedrockClient";
import { ListAutomatedReasoningPolicyTestResultsCommand, } from "../commands/ListAutomatedReasoningPolicyTestResultsCommand";
export const paginateListAutomatedReasoningPolicyTestResults = createPaginator(BedrockClient, ListAutomatedReasoningPolicyTestResultsCommand, "nextToken", "nextToken", "maxResults");
