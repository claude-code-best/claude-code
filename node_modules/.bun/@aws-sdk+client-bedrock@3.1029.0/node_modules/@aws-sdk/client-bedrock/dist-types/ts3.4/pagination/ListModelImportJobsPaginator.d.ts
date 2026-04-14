import { Paginator } from "@smithy/types";
import {
  ListModelImportJobsCommandInput,
  ListModelImportJobsCommandOutput,
} from "../commands/ListModelImportJobsCommand";
import { BedrockPaginationConfiguration } from "./Interfaces";
export declare const paginateListModelImportJobs: (
  config: BedrockPaginationConfiguration,
  input: ListModelImportJobsCommandInput,
  ...rest: any[]
) => Paginator<ListModelImportJobsCommandOutput>;
