import { Paginator } from "@smithy/types";
import {
  ListImportedModelsCommandInput,
  ListImportedModelsCommandOutput,
} from "../commands/ListImportedModelsCommand";
import { BedrockPaginationConfiguration } from "./Interfaces";
export declare const paginateListImportedModels: (
  config: BedrockPaginationConfiguration,
  input: ListImportedModelsCommandInput,
  ...rest: any[]
) => Paginator<ListImportedModelsCommandOutput>;
