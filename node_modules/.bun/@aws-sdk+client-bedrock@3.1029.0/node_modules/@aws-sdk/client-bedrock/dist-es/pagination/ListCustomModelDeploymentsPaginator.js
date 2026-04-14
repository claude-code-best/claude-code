import { createPaginator } from "@smithy/core";
import { BedrockClient } from "../BedrockClient";
import { ListCustomModelDeploymentsCommand, } from "../commands/ListCustomModelDeploymentsCommand";
export const paginateListCustomModelDeployments = createPaginator(BedrockClient, ListCustomModelDeploymentsCommand, "nextToken", "nextToken", "maxResults");
