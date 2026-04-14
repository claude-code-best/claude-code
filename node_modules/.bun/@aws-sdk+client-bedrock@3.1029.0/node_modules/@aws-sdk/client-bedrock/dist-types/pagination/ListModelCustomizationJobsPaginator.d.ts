import type { Paginator } from "@smithy/types";
import { ListModelCustomizationJobsCommandInput, ListModelCustomizationJobsCommandOutput } from "../commands/ListModelCustomizationJobsCommand";
import type { BedrockPaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListModelCustomizationJobs: (config: BedrockPaginationConfiguration, input: ListModelCustomizationJobsCommandInput, ...rest: any[]) => Paginator<ListModelCustomizationJobsCommandOutput>;
