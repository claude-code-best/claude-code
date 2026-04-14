import { Paginator } from "@smithy/types";
import {
  ListModelCustomizationJobsCommandInput,
  ListModelCustomizationJobsCommandOutput,
} from "../commands/ListModelCustomizationJobsCommand";
import { BedrockPaginationConfiguration } from "./Interfaces";
export declare const paginateListModelCustomizationJobs: (
  config: BedrockPaginationConfiguration,
  input: ListModelCustomizationJobsCommandInput,
  ...rest: any[]
) => Paginator<ListModelCustomizationJobsCommandOutput>;
