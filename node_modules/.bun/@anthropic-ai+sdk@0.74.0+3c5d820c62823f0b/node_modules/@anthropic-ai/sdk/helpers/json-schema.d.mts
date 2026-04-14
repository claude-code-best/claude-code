import { FromSchema, JSONSchema } from 'json-schema-to-ts';
import { AutoParseableOutputFormat } from "../lib/parser.mjs";
type NoInfer<T> = T extends infer R ? R : never;
/**
 * Creates a JSON schema output format object from the given JSON schema.
 * If this is passed to the `.parse()` method then the response message will contain a
 * `.parsed_output` property that is the result of parsing the content with the given JSON schema.
 *
 * Note: When `transform` is enabled (the default), the schema is deep-cloned before transformation,
 * so the original schema object is not modified.
 */
export declare function jsonSchemaOutputFormat<const Schema extends Exclude<JSONSchema, boolean> & {
    type: 'object';
}>(jsonSchema: Schema, options?: {
    transform?: boolean;
}): AutoParseableOutputFormat<NoInfer<FromSchema<Schema>>>;
export {};
//# sourceMappingURL=json-schema.d.mts.map