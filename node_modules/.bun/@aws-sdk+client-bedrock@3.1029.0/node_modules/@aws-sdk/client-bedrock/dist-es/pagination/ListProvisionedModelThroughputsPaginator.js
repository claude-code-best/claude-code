import { createPaginator } from "@smithy/core";
import { BedrockClient } from "../BedrockClient";
import { ListProvisionedModelThroughputsCommand, } from "../commands/ListProvisionedModelThroughputsCommand";
export const paginateListProvisionedModelThroughputs = createPaginator(BedrockClient, ListProvisionedModelThroughputsCommand, "nextToken", "nextToken", "maxResults");
