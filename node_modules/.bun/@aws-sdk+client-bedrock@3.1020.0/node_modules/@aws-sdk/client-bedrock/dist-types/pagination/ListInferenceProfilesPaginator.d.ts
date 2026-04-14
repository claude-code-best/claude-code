import type { Paginator } from "@smithy/types";
import { ListInferenceProfilesCommandInput, ListInferenceProfilesCommandOutput } from "../commands/ListInferenceProfilesCommand";
import type { BedrockPaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListInferenceProfiles: (config: BedrockPaginationConfiguration, input: ListInferenceProfilesCommandInput, ...rest: any[]) => Paginator<ListInferenceProfilesCommandOutput>;
