/**
 * fast-xml-tagger - XML/JSON path matching library
 * 
 * Provides efficient path tracking and pattern matching for XML/JSON parsers.
 * 
 * @example
 * import { Expression, Matcher } from 'fast-xml-tagger';
 * 
 * // Create expression (parse once)
 * const expr = new Expression("root.users.user[id]");
 * 
 * // Create matcher (track path)
 * const matcher = new Matcher();
 * matcher.push("root", [], {}, 0);
 * matcher.push("users", [], {}, 0);
 * matcher.push("user", ["id", "type"], { id: "123", type: "admin" }, 0);
 * 
 * // Match
 * if (matcher.matches(expr)) {
 *   console.log("Match found!");
 * }
 */

import Expression from './Expression.js';
import Matcher from './Matcher.js';

export { Expression, Matcher };
export default { Expression, Matcher };
