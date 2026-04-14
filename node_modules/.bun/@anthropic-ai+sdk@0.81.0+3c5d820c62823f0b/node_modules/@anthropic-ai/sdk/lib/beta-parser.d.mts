import type { Logger } from "../client.mjs";
import { BetaContentBlock, BetaJSONOutputFormat, BetaMessage, BetaOutputConfig, BetaTextBlock, MessageCreateParams } from "../resources/beta/messages/messages.mjs";
type Simplify<T> = {
    [KeyType in keyof T]: T[KeyType];
} & {};
type AutoParseableBetaOutputConfig = Omit<BetaOutputConfig, 'format'> & {
    format?: BetaJSONOutputFormat | AutoParseableBetaOutputFormat<any> | null;
};
export type BetaParseableMessageCreateParams = Simplify<Omit<MessageCreateParams, 'output_format' | 'output_config'> & {
    /**
     * @deprecated Use `output_config.format` instead. This parameter will be removed in a future
     *   release.
     */
    output_format?: BetaJSONOutputFormat | AutoParseableBetaOutputFormat<any> | null;
    output_config?: AutoParseableBetaOutputConfig | null;
}>;
export type ExtractParsedContentFromBetaParams<Params extends BetaParseableMessageCreateParams> = Params['output_format'] extends AutoParseableBetaOutputFormat<infer P> ? P : Params['output_config'] extends {
    format: AutoParseableBetaOutputFormat<infer P>;
} ? P : null;
export type AutoParseableBetaOutputFormat<ParsedT> = BetaJSONOutputFormat & {
    parse(content: string): ParsedT;
};
export type ParsedBetaMessage<ParsedT> = BetaMessage & {
    content: Array<ParsedBetaContentBlock<ParsedT>>;
    parsed_output: ParsedT | null;
};
export type ParsedBetaContentBlock<ParsedT> = (BetaTextBlock & {
    parsed_output: ParsedT | null;
}) | Exclude<BetaContentBlock, BetaTextBlock>;
export declare function maybeParseBetaMessage<Params extends BetaParseableMessageCreateParams | null>(message: BetaMessage, params: Params, opts: {
    logger: Logger;
}): ParsedBetaMessage<ExtractParsedContentFromBetaParams<NonNullable<Params>>>;
export declare function parseBetaMessage<Params extends BetaParseableMessageCreateParams>(message: BetaMessage, params: Params, opts: {
    logger: Logger;
}): ParsedBetaMessage<ExtractParsedContentFromBetaParams<Params>>;
export {};
//# sourceMappingURL=beta-parser.d.mts.map