import type { Logger } from "../client.js";
import { ContentBlock, JSONOutputFormat, Message, OutputConfig, TextBlock, MessageCreateParams } from "../resources/messages/messages.js";
type Simplify<T> = {
    [KeyType in keyof T]: T[KeyType];
} & {};
type AutoParseableOutputConfig = Omit<OutputConfig, 'format'> & {
    format?: JSONOutputFormat | AutoParseableOutputFormat<any> | null;
};
export type ParseableMessageCreateParams = Simplify<Omit<MessageCreateParams, 'output_config'> & {
    output_config?: AutoParseableOutputConfig | null;
}>;
export type ExtractParsedContentFromParams<Params extends ParseableMessageCreateParams> = Params['output_config'] extends {
    format: AutoParseableOutputFormat<infer P>;
} ? P : null;
export type AutoParseableOutputFormat<ParsedT> = JSONOutputFormat & {
    parse(content: string): ParsedT;
};
export type ParsedMessage<ParsedT> = Message & {
    content: Array<ParsedContentBlock<ParsedT>>;
    parsed_output: ParsedT | null;
};
export type ParsedContentBlock<ParsedT> = (TextBlock & {
    parsed_output: ParsedT | null;
}) | Exclude<ContentBlock, TextBlock>;
export declare function maybeParseMessage<Params extends ParseableMessageCreateParams | null>(message: Message, params: Params, opts: {
    logger: Logger;
}): ParsedMessage<ExtractParsedContentFromParams<NonNullable<Params>>>;
export declare function parseMessage<Params extends ParseableMessageCreateParams>(message: Message, params: Params, opts: {
    logger: Logger;
}): ParsedMessage<ExtractParsedContentFromParams<Params>>;
export {};
//# sourceMappingURL=parser.d.ts.map