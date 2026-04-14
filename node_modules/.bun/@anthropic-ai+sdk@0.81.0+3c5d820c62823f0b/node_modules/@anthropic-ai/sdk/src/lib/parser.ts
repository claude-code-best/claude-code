import type { Logger } from '../client';
import { AnthropicError } from '../core/error';
import {
  ContentBlock,
  JSONOutputFormat,
  Message,
  OutputConfig,
  TextBlock,
  MessageCreateParams,
} from '../resources/messages/messages';

// vendored from typefest just to make things look a bit nicer on hover
type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {};

type AutoParseableOutputConfig = Omit<OutputConfig, 'format'> & {
  format?: JSONOutputFormat | AutoParseableOutputFormat<any> | null;
};

export type ParseableMessageCreateParams = Simplify<
  Omit<MessageCreateParams, 'output_config'> & {
    output_config?: AutoParseableOutputConfig | null;
  }
>;

export type ExtractParsedContentFromParams<Params extends ParseableMessageCreateParams> =
  Params['output_config'] extends { format: AutoParseableOutputFormat<infer P> } ? P : null;

export type AutoParseableOutputFormat<ParsedT> = JSONOutputFormat & {
  parse(content: string): ParsedT;
};

export type ParsedMessage<ParsedT> = Message & {
  content: Array<ParsedContentBlock<ParsedT>>;
  parsed_output: ParsedT | null;
};

export type ParsedContentBlock<ParsedT> =
  | (TextBlock & { parsed_output: ParsedT | null })
  | Exclude<ContentBlock, TextBlock>;

function getOutputFormat(
  params: ParseableMessageCreateParams | null,
): JSONOutputFormat | AutoParseableOutputFormat<any> | null | undefined {
  return params?.output_config?.format;
}

export function maybeParseMessage<Params extends ParseableMessageCreateParams | null>(
  message: Message,
  params: Params,
  opts: { logger: Logger },
): ParsedMessage<ExtractParsedContentFromParams<NonNullable<Params>>> {
  const outputFormat = getOutputFormat(params);
  if (!params || !('parse' in (outputFormat ?? {}))) {
    return {
      ...message,
      content: message.content.map((block) => {
        if (block.type === 'text') {
          const parsedBlock = Object.defineProperty({ ...block }, 'parsed_output', {
            value: null,
            enumerable: false,
          }) as ParsedContentBlock<ExtractParsedContentFromParams<NonNullable<Params>>>;

          return parsedBlock;
        }
        return block;
      }),
      parsed_output: null,
    } as ParsedMessage<ExtractParsedContentFromParams<NonNullable<Params>>>;
  }

  return parseMessage(message, params, opts);
}

export function parseMessage<Params extends ParseableMessageCreateParams>(
  message: Message,
  params: Params,
  opts: { logger: Logger },
): ParsedMessage<ExtractParsedContentFromParams<Params>> {
  let firstParsedOutput: ReturnType<typeof parseOutputFormat<Params>> | null = null;

  const content: Array<ParsedContentBlock<ExtractParsedContentFromParams<Params>>> = message.content.map(
    (block) => {
      if (block.type === 'text') {
        const parsedOutput = parseOutputFormat(params, block.text);

        if (firstParsedOutput === null) {
          firstParsedOutput = parsedOutput;
        }

        const parsedBlock = Object.defineProperty({ ...block }, 'parsed_output', {
          value: parsedOutput,
          enumerable: false,
        }) as ParsedContentBlock<ExtractParsedContentFromParams<Params>>;
        return parsedBlock;
      }
      return block;
    },
  );

  return {
    ...message,
    content,
    parsed_output: firstParsedOutput,
  } as ParsedMessage<ExtractParsedContentFromParams<Params>>;
}

function parseOutputFormat<Params extends ParseableMessageCreateParams>(
  params: Params,
  content: string,
): ExtractParsedContentFromParams<Params> | null {
  const outputFormat = getOutputFormat(params);
  if (outputFormat?.type !== 'json_schema') {
    return null;
  }

  try {
    if ('parse' in outputFormat) {
      return outputFormat.parse(content);
    }

    return JSON.parse(content);
  } catch (error) {
    throw new AnthropicError(`Failed to parse structured output: ${error}`);
  }
}
