import type { Paginator } from "@smithy/types";
import { ListModelCopyJobsCommandInput, ListModelCopyJobsCommandOutput } from "../commands/ListModelCopyJobsCommand";
import type { BedrockPaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListModelCopyJobs: (config: BedrockPaginationConfiguration, input: ListModelCopyJobsCommandInput, ...rest: any[]) => Paginator<ListModelCopyJobsCommandOutput>;
