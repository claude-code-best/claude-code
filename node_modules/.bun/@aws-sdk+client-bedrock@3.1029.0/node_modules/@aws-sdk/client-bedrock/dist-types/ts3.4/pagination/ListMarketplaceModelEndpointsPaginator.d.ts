import { Paginator } from "@smithy/types";
import {
  ListMarketplaceModelEndpointsCommandInput,
  ListMarketplaceModelEndpointsCommandOutput,
} from "../commands/ListMarketplaceModelEndpointsCommand";
import { BedrockPaginationConfiguration } from "./Interfaces";
export declare const paginateListMarketplaceModelEndpoints: (
  config: BedrockPaginationConfiguration,
  input: ListMarketplaceModelEndpointsCommandInput,
  ...rest: any[]
) => Paginator<ListMarketplaceModelEndpointsCommandOutput>;
