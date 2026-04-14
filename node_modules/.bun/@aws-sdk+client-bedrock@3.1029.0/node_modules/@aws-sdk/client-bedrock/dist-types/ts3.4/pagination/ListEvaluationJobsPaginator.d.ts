import { Paginator } from "@smithy/types";
import {
  ListEvaluationJobsCommandInput,
  ListEvaluationJobsCommandOutput,
} from "../commands/ListEvaluationJobsCommand";
import { BedrockPaginationConfiguration } from "./Interfaces";
export declare const paginateListEvaluationJobs: (
  config: BedrockPaginationConfiguration,
  input: ListEvaluationJobsCommandInput,
  ...rest: any[]
) => Paginator<ListEvaluationJobsCommandOutput>;
