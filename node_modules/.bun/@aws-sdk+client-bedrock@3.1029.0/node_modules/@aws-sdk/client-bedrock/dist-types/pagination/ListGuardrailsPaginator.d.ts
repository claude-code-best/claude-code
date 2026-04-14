import type { Paginator } from "@smithy/types";
import { ListGuardrailsCommandInput, ListGuardrailsCommandOutput } from "../commands/ListGuardrailsCommand";
import type { BedrockPaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListGuardrails: (config: BedrockPaginationConfiguration, input: ListGuardrailsCommandInput, ...rest: any[]) => Paginator<ListGuardrailsCommandOutput>;
