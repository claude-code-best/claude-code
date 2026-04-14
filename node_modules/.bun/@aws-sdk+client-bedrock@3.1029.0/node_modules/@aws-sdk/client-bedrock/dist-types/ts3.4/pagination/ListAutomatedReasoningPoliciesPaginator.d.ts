import { Paginator } from "@smithy/types";
import {
  ListAutomatedReasoningPoliciesCommandInput,
  ListAutomatedReasoningPoliciesCommandOutput,
} from "../commands/ListAutomatedReasoningPoliciesCommand";
import { BedrockPaginationConfiguration } from "./Interfaces";
export declare const paginateListAutomatedReasoningPolicies: (
  config: BedrockPaginationConfiguration,
  input: ListAutomatedReasoningPoliciesCommandInput,
  ...rest: any[]
) => Paginator<ListAutomatedReasoningPoliciesCommandOutput>;
