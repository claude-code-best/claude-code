import { Paginator } from "@smithy/types";
import {
  ListEnforcedGuardrailsConfigurationCommandInput,
  ListEnforcedGuardrailsConfigurationCommandOutput,
} from "../commands/ListEnforcedGuardrailsConfigurationCommand";
import { BedrockPaginationConfiguration } from "./Interfaces";
export declare const paginateListEnforcedGuardrailsConfiguration: (
  config: BedrockPaginationConfiguration,
  input: ListEnforcedGuardrailsConfigurationCommandInput,
  ...rest: any[]
) => Paginator<ListEnforcedGuardrailsConfigurationCommandOutput>;
