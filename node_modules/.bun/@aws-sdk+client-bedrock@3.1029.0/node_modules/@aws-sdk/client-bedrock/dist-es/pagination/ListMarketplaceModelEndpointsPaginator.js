import { createPaginator } from "@smithy/core";
import { BedrockClient } from "../BedrockClient";
import { ListMarketplaceModelEndpointsCommand, } from "../commands/ListMarketplaceModelEndpointsCommand";
export const paginateListMarketplaceModelEndpoints = createPaginator(BedrockClient, ListMarketplaceModelEndpointsCommand, "nextToken", "nextToken", "maxResults");
