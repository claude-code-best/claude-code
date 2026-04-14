import { transformJSONSchema } from '../lib/transform-json-schema';
import type { infer as zodInfer, ZodType } from 'zod';
import * as z from 'zod';
import { AnthropicError } from '../core/error';
import { AutoParseableOutputFormat } from '../lib/parser';

/**
 * Creates a JSON schema output format object from the given Zod schema.
 *
 * If this is passed to the `.parse()` method then the response message will contain a
 * `.parsed_output` property that is the result of parsing the content with the given Zod object.
 *
 * This can be passed directly to the `.create()` method but will not
 * result in any automatic parsing, you'll have to parse the response yourself.
 */
export function zodOutputFormat<ZodInput extends ZodType>(
  zodObject: ZodInput,
): AutoParseableOutputFormat<zodInfer<ZodInput>> {
  let jsonSchema = z.toJSONSchema(zodObject, { reused: 'ref' });

  jsonSchema = transformJSONSchema(jsonSchema);

  return {
    type: 'json_schema',
    schema: {
      ...jsonSchema,
    },
    parse: (content) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (error) {
        throw new AnthropicError(
          `Failed to parse structured output as JSON: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      const output = zodObject.safeParse(parsed);

      if (!output.success) {
        const formattedIssues = output.error.issues
          .slice(0, 5)
          .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
          .join('\n');
        const issueCount = output.error.issues.length;
        const suffix = issueCount > 5 ? `\n  ... and ${issueCount - 5} more issue(s)` : '';

        throw new AnthropicError(
          `Failed to parse structured output: ${output.error.message}\nValidation issues:\n${formattedIssues}${suffix}`,
        );
      }

      return output.data;
    },
  };
}
