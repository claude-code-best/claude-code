import type { PaginationConfiguration } from "@smithy/types";
import { BedrockClient } from "../BedrockClient";
/**
 * @public
 */
export interface BedrockPaginationConfiguration extends PaginationConfiguration {
    client: BedrockClient;
}
