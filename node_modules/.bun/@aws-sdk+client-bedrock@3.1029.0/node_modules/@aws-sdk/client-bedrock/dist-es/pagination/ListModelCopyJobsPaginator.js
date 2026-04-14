import { createPaginator } from "@smithy/core";
import { BedrockClient } from "../BedrockClient";
import { ListModelCopyJobsCommand, } from "../commands/ListModelCopyJobsCommand";
export const paginateListModelCopyJobs = createPaginator(BedrockClient, ListModelCopyJobsCommand, "nextToken", "nextToken", "maxResults");
