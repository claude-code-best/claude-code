import { PaginationConfiguration } from "@smithy/types";
import { BedrockClient } from "../BedrockClient";
export interface BedrockPaginationConfiguration
  extends PaginationConfiguration {
  client: BedrockClient;
}
