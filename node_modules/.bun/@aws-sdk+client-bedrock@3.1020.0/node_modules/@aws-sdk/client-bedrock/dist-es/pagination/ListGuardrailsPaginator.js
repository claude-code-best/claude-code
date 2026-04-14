import { createPaginator } from "@smithy/core";
import { BedrockClient } from "../BedrockClient";
import { ListGuardrailsCommand, } from "../commands/ListGuardrailsCommand";
export const paginateListGuardrails = createPaginator(BedrockClient, ListGuardrailsCommand, "nextToken", "nextToken", "maxResults");
