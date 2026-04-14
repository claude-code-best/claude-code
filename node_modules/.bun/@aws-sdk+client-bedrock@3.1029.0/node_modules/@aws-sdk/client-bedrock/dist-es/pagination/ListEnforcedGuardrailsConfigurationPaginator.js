import { createPaginator } from "@smithy/core";
import { BedrockClient } from "../BedrockClient";
import { ListEnforcedGuardrailsConfigurationCommand, } from "../commands/ListEnforcedGuardrailsConfigurationCommand";
export const paginateListEnforcedGuardrailsConfiguration = createPaginator(BedrockClient, ListEnforcedGuardrailsConfigurationCommand, "nextToken", "nextToken", "");
