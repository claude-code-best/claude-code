import { Paginator } from "@smithy/types";
import {
  ListModelCopyJobsCommandInput,
  ListModelCopyJobsCommandOutput,
} from "../commands/ListModelCopyJobsCommand";
import { BedrockPaginationConfiguration } from "./Interfaces";
export declare const paginateListModelCopyJobs: (
  config: BedrockPaginationConfiguration,
  input: ListModelCopyJobsCommandInput,
  ...rest: any[]
) => Paginator<ListModelCopyJobsCommandOutput>;
