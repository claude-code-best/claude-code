import { createPaginator } from "@smithy/core";
import { BedrockClient } from "../BedrockClient";
import { ListModelInvocationJobsCommand, } from "../commands/ListModelInvocationJobsCommand";
export const paginateListModelInvocationJobs = createPaginator(BedrockClient, ListModelInvocationJobsCommand, "nextToken", "nextToken", "maxResults");
