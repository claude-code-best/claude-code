import { Paginator } from "@smithy/types";
import {
  ListInferenceProfilesCommandInput,
  ListInferenceProfilesCommandOutput,
} from "../commands/ListInferenceProfilesCommand";
import { BedrockPaginationConfiguration } from "./Interfaces";
export declare const paginateListInferenceProfiles: (
  config: BedrockPaginationConfiguration,
  input: ListInferenceProfilesCommandInput,
  ...rest: any[]
) => Paginator<ListInferenceProfilesCommandOutput>;
