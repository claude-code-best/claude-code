import { Paginator } from "@smithy/types";
import {
  ListGuardrailsCommandInput,
  ListGuardrailsCommandOutput,
} from "../commands/ListGuardrailsCommand";
import { BedrockPaginationConfiguration } from "./Interfaces";
export declare const paginateListGuardrails: (
  config: BedrockPaginationConfiguration,
  input: ListGuardrailsCommandInput,
  ...rest: any[]
) => Paginator<ListGuardrailsCommandOutput>;
