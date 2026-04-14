import { createPaginator } from "@smithy/core";
import { BedrockClient } from "../BedrockClient";
import { ListCustomModelsCommand, } from "../commands/ListCustomModelsCommand";
export const paginateListCustomModels = createPaginator(BedrockClient, ListCustomModelsCommand, "nextToken", "nextToken", "maxResults");
