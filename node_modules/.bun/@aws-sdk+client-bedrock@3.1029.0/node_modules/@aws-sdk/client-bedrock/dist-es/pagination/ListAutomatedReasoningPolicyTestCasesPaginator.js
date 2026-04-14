import { createPaginator } from "@smithy/core";
import { BedrockClient } from "../BedrockClient";
import { ListAutomatedReasoningPolicyTestCasesCommand, } from "../commands/ListAutomatedReasoningPolicyTestCasesCommand";
export const paginateListAutomatedReasoningPolicyTestCases = createPaginator(BedrockClient, ListAutomatedReasoningPolicyTestCasesCommand, "nextToken", "nextToken", "maxResults");
