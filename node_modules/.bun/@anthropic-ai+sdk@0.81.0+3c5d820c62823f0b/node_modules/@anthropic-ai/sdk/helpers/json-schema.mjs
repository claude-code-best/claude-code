import { AnthropicError } from "../core/error.mjs";
import { transformJSONSchema } from "../lib/transform-json-schema.mjs";
/**
 * Creates a JSON schema output format object from the given JSON schema.
 * If this is passed to the `.parse()` method then the response message will contain a
 * `.parsed_output` property that is the result of parsing the content with the given JSON schema.
 *
 * Note: When `transform` is enabled (the default), the schema is deep-cloned before transformation,
 * so the original schema object is not modified.
 */
export function jsonSchemaOutputFormat(jsonSchema, options) {
    if (jsonSchema.type !== 'object') {
        throw new Error(`JSON schema must be an object, but got ${jsonSchema.type}`);
    }
    const transform = options?.transform ?? true;
    if (transform) {
        jsonSchema = transformJSONSchema(jsonSchema);
    }
    return {
        type: 'json_schema',
        schema: {
            ...jsonSchema,
        },
        parse: (content) => {
            try {
                return JSON.parse(content);
            }
            catch (error) {
                throw new AnthropicError(`Failed to parse structured output: ${error instanceof Error ? error.message : String(error)}`);
            }
        },
    };
}
//# sourceMappingURL=json-schema.mjs.map