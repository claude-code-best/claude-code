import { Paginator } from "@smithy/types";
import {
  ListAutomatedReasoningPolicyBuildWorkflowsCommandInput,
  ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput,
} from "../commands/ListAutomatedReasoningPolicyBuildWorkflowsCommand";
import { BedrockPaginationConfiguration } from "./Interfaces";
export declare const paginateListAutomatedReasoningPolicyBuildWorkflows: (
  config: BedrockPaginationConfiguration,
  input: ListAutomatedReasoningPolicyBuildWorkflowsCommandInput,
  ...rest: any[]
) => Paginator<ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput>;
