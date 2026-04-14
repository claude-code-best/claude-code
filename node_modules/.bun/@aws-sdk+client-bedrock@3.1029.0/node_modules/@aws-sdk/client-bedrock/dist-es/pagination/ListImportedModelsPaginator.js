import { createPaginator } from "@smithy/core";
import { BedrockClient } from "../BedrockClient";
import { ListImportedModelsCommand, } from "../commands/ListImportedModelsCommand";
export const paginateListImportedModels = createPaginator(BedrockClient, ListImportedModelsCommand, "nextToken", "nextToken", "maxResults");
