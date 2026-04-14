import { Paginator } from "@smithy/types";
import {
  ListCustomModelDeploymentsCommandInput,
  ListCustomModelDeploymentsCommandOutput,
} from "../commands/ListCustomModelDeploymentsCommand";
import { BedrockPaginationConfiguration } from "./Interfaces";
export declare const paginateListCustomModelDeployments: (
  config: BedrockPaginationConfiguration,
  input: ListCustomModelDeploymentsCommandInput,
  ...rest: any[]
) => Paginator<ListCustomModelDeploymentsCommandOutput>;
