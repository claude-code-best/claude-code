"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.zodOutputFormat = zodOutputFormat;
const tslib_1 = require("../internal/tslib.js");
const transform_json_schema_1 = require("../lib/transform-json-schema.js");
const z = tslib_1.__importStar(require("zod"));
const error_1 = require("../core/error.js");
/**
 * Creates a JSON schema output format object from the given Zod schema.
 *
 * If this is passed to the `.parse()` method then the response message will contain a
 * `.parsed_output` property that is the result of parsing the content with the given Zod object.
 *
 * This can be passed directly to the `.create()` method but will not
 * result in any automatic parsing, you'll have to parse the response yourself.
 */
function zodOutputFormat(zodObject) {
    let jsonSchema = z.toJSONSchema(zodObject, { reused: 'ref' });
    jsonSchema = (0, transform_json_schema_1.transformJSONSchema)(jsonSchema);
    return {
        type: 'json_schema',
        schema: {
            ...jsonSchema,
        },
        parse: (content) => {
            let parsed;
            try {
                parsed = JSON.parse(content);
            }
            catch (error) {
                throw new error_1.AnthropicError(`Failed to parse structured output as JSON: ${error instanceof Error ? error.message : String(error)}`);
            }
            const output = zodObject.safeParse(parsed);
            if (!output.success) {
                const formattedIssues = output.error.issues
                    .slice(0, 5)
                    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
                    .join('\n');
                const issueCount = output.error.issues.length;
                const suffix = issueCount > 5 ? `\n  ... and ${issueCount - 5} more issue(s)` : '';
                throw new error_1.AnthropicError(`Failed to parse structured output: ${output.error.message}\nValidation issues:\n${formattedIssues}${suffix}`);
            }
            return output.data;
        },
    };
}
//# sourceMappingURL=zod.js.map