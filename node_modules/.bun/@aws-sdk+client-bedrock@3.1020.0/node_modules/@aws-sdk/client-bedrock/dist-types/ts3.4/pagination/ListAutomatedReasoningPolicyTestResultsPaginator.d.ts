import { Paginator } from "@smithy/types";
import {
  ListAutomatedReasoningPolicyTestResultsCommandInput,
  ListAutomatedReasoningPolicyTestResultsCommandOutput,
} from "../commands/ListAutomatedReasoningPolicyTestResultsCommand";
import { BedrockPaginationConfiguration } from "./Interfaces";
export declare const paginateListAutomatedReasoningPolicyTestResults: (
  config: BedrockPaginationConfiguration,
  input: ListAutomatedReasoningPolicyTestResultsCommandInput,
  ...rest: any[]
) => Paginator<ListAutomatedReasoningPolicyTestResultsCommandOutput>;
