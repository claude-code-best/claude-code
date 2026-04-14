import { createPaginator } from "@smithy/core";
import { BedrockClient } from "../BedrockClient";
import { ListPromptRoutersCommand, } from "../commands/ListPromptRoutersCommand";
export const paginateListPromptRouters = createPaginator(BedrockClient, ListPromptRoutersCommand, "nextToken", "nextToken", "maxResults");
