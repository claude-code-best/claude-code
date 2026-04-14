import type { Paginator } from "@smithy/types";
import { ListIdentityPoolsCommandInput, ListIdentityPoolsCommandOutput } from "../commands/ListIdentityPoolsCommand";
import type { CognitoIdentityPaginationConfiguration } from "./Interfaces";
/**
 * @public
 */
export declare const paginateListIdentityPools: (config: CognitoIdentityPaginationConfiguration, input: ListIdentityPoolsCommandInput, ...rest: any[]) => Paginator<ListIdentityPoolsCommandOutput>;
