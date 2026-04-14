import type { infer as zodInfer, ZodType } from 'zod';
import { AutoParseableOutputFormat } from "../lib/parser.mjs";
/**
 * Creates a JSON schema output format object from the given Zod schema.
 *
 * If this is passed to the `.parse()` method then the response message will contain a
 * `.parsed_output` property that is the result of parsing the content with the given Zod object.
 *
 * This can be passed directly to the `.create()` method but will not
 * result in any automatic parsing, you'll have to parse the response yourself.
 */
export declare function zodOutputFormat<ZodInput extends ZodType>(zodObject: ZodInput): AutoParseableOutputFormat<zodInfer<ZodInput>>;
//# sourceMappingURL=zod.d.mts.map