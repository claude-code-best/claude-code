import type { Paginator } from "@smithy/types";
import { ListProvisionedModelThroughputsCommandInput, ListProvisionedModelThroughputsCommandOutput } from "../commands/ListProvisionedModelThroughputsCommand";
import type { BedrockPaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListProvisionedModelThroughputs: (config: BedrockPaginationConfiguration, input: ListProvisionedModelThroughputsCommandInput, ...rest: any[]) => Paginator<ListProvisionedModelThroughputsCommandOutput>;
