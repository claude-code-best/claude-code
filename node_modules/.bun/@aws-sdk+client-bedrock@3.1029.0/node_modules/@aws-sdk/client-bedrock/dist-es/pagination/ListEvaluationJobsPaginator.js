import { createPaginator } from "@smithy/core";
import { BedrockClient } from "../BedrockClient";
import { ListEvaluationJobsCommand, } from "../commands/ListEvaluationJobsCommand";
export const paginateListEvaluationJobs = createPaginator(BedrockClient, ListEvaluationJobsCommand, "nextToken", "nextToken", "maxResults");
