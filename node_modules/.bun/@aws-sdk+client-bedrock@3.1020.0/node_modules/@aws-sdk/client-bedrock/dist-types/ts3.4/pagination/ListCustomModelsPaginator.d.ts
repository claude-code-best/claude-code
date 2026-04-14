import { Paginator } from "@smithy/types";
import {
  ListCustomModelsCommandInput,
  ListCustomModelsCommandOutput,
} from "../commands/ListCustomModelsCommand";
import { BedrockPaginationConfiguration } from "./Interfaces";
export declare const paginateListCustomModels: (
  config: BedrockPaginationConfiguration,
  input: ListCustomModelsCommandInput,
  ...rest: any[]
) => Paginator<ListCustomModelsCommandOutput>;
