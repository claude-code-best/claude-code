/**
 * TypeScript definitions for path-expression-matcher
 * 
 * Provides efficient path tracking and pattern matching for XML/JSON parsers.
 */

/**
 * Options for creating an Expression
 */
export interface ExpressionOptions {
  /**
   * Path separator character
   * @default '.'
   */
  separator?: string;
}

/**
 * Parsed segment from an expression pattern
 */
export interface Segment {
  /**
   * Type of segment
   */
  type: 'tag' | 'deep-wildcard';

  /**
   * Tag name (e.g., "user", "*" for wildcard)
   * Only present when type is 'tag'
   */
  tag?: string;

  /**
   * Namespace prefix (e.g., "ns" in "ns::user")
   * Only present when namespace is specified
   */
  namespace?: string;

  /**
   * Attribute name to match (e.g., "id" in "user[id]")
   * Only present when attribute condition exists
   */
  attrName?: string;

  /**
   * Attribute value to match (e.g., "123" in "user[id=123]")
   * Only present when attribute value is specified
   */
  attrValue?: string;

  /**
   * Position selector type
   * Only present when position selector exists
   */
  position?: 'first' | 'last' | 'odd' | 'even' | 'nth';

  /**
   * Numeric value for nth() selector
   * Only present when position is 'nth'
   */
  positionValue?: number;
}

/**
 * Expression - Parses and stores a tag pattern expression
 * 
 * Patterns are parsed once and stored in an optimized structure for fast matching.
 * 
 * @example
 * ```typescript
 * const expr = new Expression("root.users.user");
 * const expr2 = new Expression("..user[id]:first");
 * const expr3 = new Expression("root/users/user", { separator: '/' });
 * ```
 * 
 * Pattern Syntax:
 * - `root.users.user` - Match exact path
 * - `..user` - Match "user" at any depth (deep wildcard)
 * - `user[id]` - Match user tag with "id" attribute
 * - `user[id=123]` - Match user tag where id="123"
 * - `user:first` - Match first occurrence of user tag
 * - `ns::user` - Match user tag with namespace "ns"
 * - `ns::user[id]:first` - Combine namespace, attribute, and position
 */
export class Expression {
  /**
   * Original pattern string
   */
  readonly pattern: string;

  /**
   * Path separator character
   */
  readonly separator: string;

  /**
   * Parsed segments
   */
  readonly segments: Segment[];

  /**
   * Create a new Expression
   * @param pattern - Pattern string (e.g., "root.users.user", "..user[id]")
   * @param options - Configuration options
   */
  constructor(pattern: string, options?: ExpressionOptions);

  /**
   * Get the number of segments
   */
  get length(): number;

  /**
   * Check if expression contains deep wildcard (..)
   */
  hasDeepWildcard(): boolean;

  /**
   * Check if expression has attribute conditions
   */
  hasAttributeCondition(): boolean;

  /**
   * Check if expression has position selectors
   */
  hasPositionSelector(): boolean;

  /**
   * Get string representation
   */
  toString(): string;
}

/**
 * Options for creating a Matcher
 */
export interface MatcherOptions {
  /**
   * Default path separator
   * @default '.'
   */
  separator?: string;
}

/**
 * Internal node structure in the path stack
 */
export interface PathNode {
  /**
   * Tag name
   */
  tag: string;

  /**
   * Namespace (if present)
   */
  namespace?: string;

  /**
   * Position in sibling list (child index in parent)
   */
  position: number;

  /**
   * Counter (occurrence count of this tag name)
   */
  counter: number;

  /**
   * Attribute key-value pairs
   * Only present for the current (last) node in path
   */
  values?: Record<string, any>;
}

/**
 * Snapshot of matcher state
 */
export interface MatcherSnapshot {
  /**
   * Copy of the path stack
   */
  path: PathNode[];

  /**
   * Copy of sibling tracking maps
   */
  siblingStacks: Map<string, number>[];
}

/**
 * MatcherView - A lightweight read-only view over a {@link Matcher} instance.
 *
 * Created once by {@link Matcher} and reused across all callbacks — no allocation
 * on every invocation. Holds a direct reference to the parent Matcher's internal
 * state so it always reflects the current parser position with zero copying or
 * freezing overhead.
 *
 * Mutation methods (`push`, `pop`, `reset`, `updateCurrent`, `restore`) are simply
 * absent from this class, so misuse is caught at compile time by TypeScript rather
 * than at runtime.
 *
 * Obtain via {@link Matcher#readOnly} — the same instance is returned every time.
 *
 * @example
 * ```typescript
 * const matcher = new Matcher();
 * const view: MatcherView = matcher.readOnly();
 *
 * matcher.push("root", {});
 * matcher.push("users", {});
 * matcher.push("user", { id: "123" });
 *
 * view.matches(expr);      // ✓ true
 * view.getCurrentTag();    // ✓ "user"
 * view.getDepth();         // ✓ 3
 * // view.push(...)        // ✗ Property 'push' does not exist on type 'MatcherView'
 * ```
 */
export class MatcherView {
  /**
   * Default path separator (read-only, delegates to parent Matcher)
   */
  readonly separator: string;

  getCurrentTag(): string | undefined;
  getCurrentNamespace(): string | undefined;
  getAttrValue(attrName: string): any;
  hasAttr(attrName: string): boolean;
  getPosition(): number;
  getCounter(): number;
  /** @deprecated Use getPosition() or getCounter() instead */
  getIndex(): number;
  getDepth(): number;
  toString(separator?: string, includeNamespace?: boolean): string;
  toArray(): string[];
  matches(expression: Expression): boolean;
  matchesAny(exprSet: ExpressionSet): boolean;
}

/**
 * @deprecated Use {@link MatcherView} instead.
 * Alias kept for backward compatibility with code that references `ReadOnlyMatcher`.
 */
export type ReadOnlyMatcher = MatcherView;

/**
 * Matcher - Tracks current path in XML/JSON tree and matches against Expressions.
 *
 * The matcher maintains a stack of nodes representing the current path from root to
 * current tag. It only stores attribute values for the current (top) node to minimize
 * memory usage.
 *
 * Use {@link Matcher#readOnly} to obtain a {@link MatcherView} safe to pass to
 * user callbacks — the same instance is reused on every call with no allocation overhead.
 *
 * @example
 * ```typescript
 * const matcher = new Matcher();
 * matcher.push("root", {});
 * matcher.push("users", {});
 * matcher.push("user", { id: "123", type: "admin" });
 *
 * const expr = new Expression("root.users.user");
 * matcher.matches(expr); // true
 *
 * matcher.pop();
 * matcher.matches(expr); // false
 * ```
 */
export class Matcher {
  /**
   * Default path separator
   */
  readonly separator: string;

  /**
   * Create a new Matcher
   * @param options - Configuration options
   */
  constructor(options?: MatcherOptions);

  /**
   * Push a new tag onto the path.
   * @param tagName - Name of the tag
   * @param attrValues - Attribute key-value pairs for current node (optional)
   * @param namespace - Namespace for the tag (optional)
   *
   * @example
   * ```typescript
   * matcher.push("user", { id: "123", type: "admin" });
   * matcher.push("user", { id: "456" }, "ns");
   * matcher.push("container", null);
   * ```
   */
  push(tagName: string, attrValues?: Record<string, any> | null, namespace?: string | null): void;

  /**
   * Pop the last tag from the path.
   * @returns The popped node or undefined if path is empty
   */
  pop(): PathNode | undefined;

  /**
   * Update current node's attribute values.
   * Useful when attributes are parsed after push.
   * @param attrValues - Attribute values
   */
  updateCurrent(attrValues: Record<string, any>): void;

  /**
   * Reset the path to empty.
   */
  reset(): void;

  /**
   * Create a snapshot of current state.
   * @returns State snapshot that can be restored later
   */
  snapshot(): MatcherSnapshot;

  /**
   * Restore state from snapshot.
   * @param snapshot - State snapshot from previous snapshot() call
   */
  restore(snapshot: MatcherSnapshot): void;

  getCurrentTag(): string | undefined;
  getCurrentNamespace(): string | undefined;
  getAttrValue(attrName: string): any;
  hasAttr(attrName: string): boolean;
  getPosition(): number;
  getCounter(): number;
  /** @deprecated Use getPosition() or getCounter() instead */
  getIndex(): number;
  getDepth(): number;
  toString(separator?: string, includeNamespace?: boolean): string;
  toArray(): string[];
  matches(expression: Expression): boolean;
  matchesAny(exprSet: ExpressionSet): boolean;

  /**
   * Return the read-only {@link MatcherView} for this matcher.
   *
   * The same instance is returned on every call — no allocation occurs.
   * Pass this to user callbacks; it always reflects current parser state.
   *
   * @example
   * ```typescript
   * const view = matcher.readOnly();
   * // same reference every time — safe to cache
   * view === matcher.readOnly(); // true
   * ```
   */
  readOnly(): MatcherView;
}

/**
 * ExpressionSet - An indexed collection of Expressions for efficient bulk matching
 *
 * Pre-indexes expressions at insertion time by depth and terminal tag name so
 * that `matchesAny()` performs an O(1) bucket lookup rather than a full O(E)
 * linear scan on every tag.
 *
 * Three internal buckets are maintained automatically:
 *  - **exact** — expressions with a fixed depth and a concrete terminal tag
 *  - **depth-wildcard** — fixed depth but terminal tag is `*`
 *  - **deep-wildcard** — expressions containing `..` (cannot be depth-indexed)
 *
 * @example
 * ```typescript
 * import { Expression, ExpressionSet, Matcher } from 'fast-xml-tagger';
 *
 * // Build once at config time
 * const stopNodes = new ExpressionSet();
 * stopNodes
 *   .add(new Expression('root.users.user'))
 *   .add(new Expression('root.config.*'))
 *   .add(new Expression('..script'))
 *   .seal(); // prevent accidental mutation during parsing
 *
 * // Query on every tag — hot path
 * if (stopNodes.matchesAny(matcher)) {
 *   // handle stop node
 * }
 * ```
 */
export class ExpressionSet {
  /**
   * Create an empty ExpressionSet.
   */
  constructor();

  /**
   * Number of expressions currently in the set.
   */
  readonly size: number;

  /**
   * Whether the set has been sealed against further modifications.
   */
  readonly isSealed: boolean;

  /**
   * Add a single Expression to the set.
   *
   * Duplicate patterns (same `expression.pattern` string) are silently ignored.
   *
   * @param expression - A pre-constructed Expression instance
   * @returns `this` — for chaining
   * @throws {TypeError} if the set has been sealed
   *
   * @example
   * ```typescript
   * set.add(new Expression('root.users.user'));
   * set.add(new Expression('..script'));
   * ```
   */
  add(expression: Expression): this;

  /**
   * Add multiple expressions at once.
   *
   * @param expressions - Array of Expression instances
   * @returns `this` — for chaining
   * @throws {TypeError} if the set has been sealed
   *
   * @example
   * ```typescript
   * set.addAll([
   *   new Expression('root.users.user'),
   *   new Expression('root.config.setting'),
   * ]);
   * ```
   */
  addAll(expressions: Expression[]): this;

  /**
   * Check whether an Expression with the same pattern is already present.
   *
   * @param expression - Expression to look up
   * @returns `true` if the pattern was already added
   */
  has(expression: Expression): boolean;

  /**
   * Seal the set against further modifications.
   *
   * After calling `seal()`, any call to `add()` or `addAll()` will throw a
   * `TypeError`. This is useful to prevent accidental mutation once the config
   * has been fully built and parsing has started.
   *
   * @returns `this` — for chaining
   *
   * @example
   * ```typescript
   * const stopNodes = new ExpressionSet();
   * stopNodes.addAll(patterns.map(p => new Expression(p))).seal();
   *
   * // Later — safe: reads are still allowed
   * stopNodes.matchesAny(matcher);
   *
   * // Later — throws TypeError: ExpressionSet is sealed
   * stopNodes.add(new Expression('root.extra'));
   * ```
   */
  seal(): this;

  /**
   * Test whether the matcher's current path matches **any** expression in the set.
   *
   * Uses the pre-built index to evaluate only the relevant bucket(s):
   *  1. Exact depth + tag — O(1) lookup
   *  2. Depth-matched wildcard tag — O(1) lookup
   *  3. Deep-wildcard expressions — always scanned (typically a small list)
   *
   * @param matcher - A `Matcher` instance or a `ReadOnlyMatcher` view
   * @returns `true` if at least one expression matches the current path
   *
   * @example
   * ```typescript
   * // Replaces:
   * // for (const expr of stopNodeExpressions) {
   * //   if (matcher.matches(expr)) return true;
   * // }
   *
   * if (stopNodes.matchesAny(matcher)) {
   *   // current tag is a stop node
   * }
   * ```
   */
  matchesAny(matcher: Matcher | MatcherView): boolean;

  /**
   * Find the first expression in the set that matches the matcher's current path.
   *
   * Uses the pre-built index to evaluate only the relevant bucket(s):
   *  1. Exact depth + tag — O(1) lookup
   *  2. Depth-matched wildcard tag — O(1) lookup
   *  3. Deep-wildcard expressions — always scanned (typically a small list)
   *
   * @param matcher - A `Matcher` instance or a `ReadOnlyMatcher` view
   * @returns Expression if at least one expression matches the current path
   *
   * @example
   * ```typescript
   * const node = stopNodes.findMatch(matcher);
   * ```
   */
  findMatch(matcher: Matcher | MatcherView): Expression;
}

/**
 * Default export containing Expression, Matcher, and ExpressionSet
 */
declare const _default: {
  Expression: typeof Expression;
  Matcher: typeof Matcher;
  MatcherView: typeof MatcherView;
  ExpressionSet: typeof ExpressionSet;
};

export default _default;