import type { Paginator } from "@smithy/types";
import { ListMarketplaceModelEndpointsCommandInput, ListMarketplaceModelEndpointsCommandOutput } from "../commands/ListMarketplaceModelEndpointsCommand";
import type { BedrockPaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListMarketplaceModelEndpoints: (config: BedrockPaginationConfiguration, input: ListMarketplaceModelEndpointsCommandInput, ...rest: any[]) => Paginator<ListMarketplaceModelEndpointsCommandOutput>;
