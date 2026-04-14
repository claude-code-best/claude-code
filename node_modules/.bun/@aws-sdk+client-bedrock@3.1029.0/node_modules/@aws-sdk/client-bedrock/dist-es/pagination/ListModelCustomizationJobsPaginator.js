import { createPaginator } from "@smithy/core";
import { BedrockClient } from "../BedrockClient";
import { ListModelCustomizationJobsCommand, } from "../commands/ListModelCustomizationJobsCommand";
export const paginateListModelCustomizationJobs = createPaginator(BedrockClient, ListModelCustomizationJobsCommand, "nextToken", "nextToken", "maxResults");
