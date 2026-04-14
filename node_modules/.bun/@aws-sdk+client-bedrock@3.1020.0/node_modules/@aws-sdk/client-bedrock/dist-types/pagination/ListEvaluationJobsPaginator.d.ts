import type { Paginator } from "@smithy/types";
import { ListEvaluationJobsCommandInput, ListEvaluationJobsCommandOutput } from "../commands/ListEvaluationJobsCommand";
import type { BedrockPaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListEvaluationJobs: (config: BedrockPaginationConfiguration, input: ListEvaluationJobsCommandInput, ...rest: any[]) => Paginator<ListEvaluationJobsCommandOutput>;
