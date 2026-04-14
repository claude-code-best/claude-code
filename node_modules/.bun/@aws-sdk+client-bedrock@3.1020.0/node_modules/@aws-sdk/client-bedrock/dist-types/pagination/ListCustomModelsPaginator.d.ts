import type { Paginator } from "@smithy/types";
import { ListCustomModelsCommandInput, ListCustomModelsCommandOutput } from "../commands/ListCustomModelsCommand";
import type { BedrockPaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListCustomModels: (config: BedrockPaginationConfiguration, input: ListCustomModelsCommandInput, ...rest: any[]) => Paginator<ListCustomModelsCommandOutput>;
