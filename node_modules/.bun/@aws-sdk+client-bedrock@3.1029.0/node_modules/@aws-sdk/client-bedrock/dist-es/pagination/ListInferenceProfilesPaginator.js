import { createPaginator } from "@smithy/core";
import { BedrockClient } from "../BedrockClient";
import { ListInferenceProfilesCommand, } from "../commands/ListInferenceProfilesCommand";
export const paginateListInferenceProfiles = createPaginator(BedrockClient, ListInferenceProfilesCommand, "nextToken", "nextToken", "maxResults");
