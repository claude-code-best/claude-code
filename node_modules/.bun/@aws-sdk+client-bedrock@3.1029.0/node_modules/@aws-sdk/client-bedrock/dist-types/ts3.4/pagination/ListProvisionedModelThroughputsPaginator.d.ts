import { Paginator } from "@smithy/types";
import {
  ListProvisionedModelThroughputsCommandInput,
  ListProvisionedModelThroughputsCommandOutput,
} from "../commands/ListProvisionedModelThroughputsCommand";
import { BedrockPaginationConfiguration } from "./Interfaces";
export declare const paginateListProvisionedModelThroughputs: (
  config: BedrockPaginationConfiguration,
  input: ListProvisionedModelThroughputsCommandInput,
  ...rest: any[]
) => Paginator<ListProvisionedModelThroughputsCommandOutput>;
