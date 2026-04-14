import { Paginator } from "@smithy/types";
import {
  ListPromptRoutersCommandInput,
  ListPromptRoutersCommandOutput,
} from "../commands/ListPromptRoutersCommand";
import { BedrockPaginationConfiguration } from "./Interfaces";
export declare const paginateListPromptRouters: (
  config: BedrockPaginationConfiguration,
  input: ListPromptRoutersCommandInput,
  ...rest: any[]
) => Paginator<ListPromptRoutersCommandOutput>;
