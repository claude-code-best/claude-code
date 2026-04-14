import type { Paginator } from "@smithy/types";
import { ListPromptRoutersCommandInput, ListPromptRoutersCommandOutput } from "../commands/ListPromptRoutersCommand";
import type { BedrockPaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListPromptRouters: (config: BedrockPaginationConfiguration, input: ListPromptRoutersCommandInput, ...rest: any[]) => Paginator<ListPromptRoutersCommandOutput>;
