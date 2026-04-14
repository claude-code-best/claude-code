import { FromSchema, JSONSchema } from 'json-schema-to-ts';
import { AutoParseableOutputFormat } from '../lib/parser';
import { AnthropicError } from '../core/error';
import { transformJSONSchema } from '../lib/transform-json-schema';

type NoInfer<T> = T extends infer R ? R : never;

/**
 * Creates a JSON schema output format object from the given JSON schema.
 * If this is passed to the `.parse()` method then the response message will contain a
 * `.parsed_output` property that is the result of parsing the content with the given JSON schema.
 *
 * Note: When `transform` is enabled (the default), the schema is deep-cloned before transformation,
 * so the original schema object is not modified.
 */
export function jsonSchemaOutputFormat<
  const Schema extends Exclude<JSONSchema, boolean> & { type: 'object' },
>(
  jsonSchema: Schema,
  options?: {
    transform?: boolean;
  },
): AutoParseableOutputFormat<NoInfer<FromSchema<Schema>>> {
  if (jsonSchema.type !== 'object') {
    throw new Error(`JSON schema must be an object, but got ${jsonSchema.type}`);
  }

  const transform = options?.transform ?? true;
  if (transform) {
    jsonSchema = transformJSONSchema(jsonSchema) as Schema;
  }

  return {
    type: 'json_schema',
    schema: {
      ...jsonSchema,
    },
    parse: (content) => {
      try {
        return JSON.parse(content);
      } catch (error) {
        throw new AnthropicError(
          `Failed to parse structured output: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}
