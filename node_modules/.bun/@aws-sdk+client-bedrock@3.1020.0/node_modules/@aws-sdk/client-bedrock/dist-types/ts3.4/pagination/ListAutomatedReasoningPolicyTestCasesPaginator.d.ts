import { Paginator } from "@smithy/types";
import {
  ListAutomatedReasoningPolicyTestCasesCommandInput,
  ListAutomatedReasoningPolicyTestCasesCommandOutput,
} from "../commands/ListAutomatedReasoningPolicyTestCasesCommand";
import { BedrockPaginationConfiguration } from "./Interfaces";
export declare const paginateListAutomatedReasoningPolicyTestCases: (
  config: BedrockPaginationConfiguration,
  input: ListAutomatedReasoningPolicyTestCasesCommandInput,
  ...rest: any[]
) => Paginator<ListAutomatedReasoningPolicyTestCasesCommandOutput>;
