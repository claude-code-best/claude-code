import { createPaginator } from "@smithy/core";
import { BedrockClient } from "../BedrockClient";
import { ListModelImportJobsCommand, } from "../commands/ListModelImportJobsCommand";
export const paginateListModelImportJobs = createPaginator(BedrockClient, ListModelImportJobsCommand, "nextToken", "nextToken", "maxResults");
