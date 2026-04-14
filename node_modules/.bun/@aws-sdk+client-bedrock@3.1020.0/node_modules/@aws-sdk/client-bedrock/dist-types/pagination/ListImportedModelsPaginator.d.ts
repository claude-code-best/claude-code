import type { Paginator } from "@smithy/types";
import { ListImportedModelsCommandInput, ListImportedModelsCommandOutput } from "../commands/ListImportedModelsCommand";
import type { BedrockPaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListImportedModels: (config: BedrockPaginationConfiguration, input: ListImportedModelsCommandInput, ...rest: any[]) => Paginator<ListImportedModelsCommandOutput>;
