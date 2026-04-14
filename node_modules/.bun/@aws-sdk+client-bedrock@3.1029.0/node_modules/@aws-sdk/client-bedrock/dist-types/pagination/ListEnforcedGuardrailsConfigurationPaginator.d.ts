import type { Paginator } from "@smithy/types";
import { ListEnforcedGuardrailsConfigurationCommandInput, ListEnforcedGuardrailsConfigurationCommandOutput } from "../commands/ListEnforcedGuardrailsConfigurationCommand";
import type { BedrockPaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListEnforcedGuardrailsConfiguration: (config: BedrockPaginationConfiguration, input: ListEnforcedGuardrailsConfigurationCommandInput, ...rest: any[]) => Paginator<ListEnforcedGuardrailsConfigurationCommandOutput>;
