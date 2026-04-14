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
 * ReadOnlyMatcher - A safe, read-only view over a {@link Matcher} instance.
 *
 * Returned by {@link Matcher.readOnly}. Exposes all query and inspection
 * methods but **throws a `TypeError`** if any state-mutating method is called
 * (`push`, `pop`, `reset`, `updateCurrent`, `restore`).  Direct property
 * writes are also blocked.
 *
 * Pass this to consumers that only need to inspect or match the current path
 * so they cannot accidentally corrupt the parser state.
 *
 * @example
 * ```typescript
 * const matcher = new Matcher();
 * matcher.push("root", {});
 * matcher.push("users", {});
 * matcher.push("user", { id: "123" });
 *
 * const ro: ReadOnlyMatcher = matcher.readOnly();
 *
 * ro.matches(expr);      // ✓ works
 * ro.getCurrentTag();    // ✓ "user"
 * ro.getDepth();         // ✓ 3
 * ro.push("child", {}); // ✗ TypeError: Cannot call 'push' on a read-only Matcher
 * ro.reset();            // ✗ TypeError: Cannot call 'reset' on a read-only Matcher
 * ```
 */
export interface ReadOnlyMatcher {
  /**
   * Default path separator (read-only)
   */
  readonly separator: string;

  /**
   * Current path stack (each node is a frozen copy)
   */
  readonly path: ReadonlyArray<Readonly<PathNode>>;

  // ── Query methods ───────────────────────────────────────────────────────────

  /**
   * Get current tag name
   * @returns Current tag name or undefined if path is empty
   */
  getCurrentTag(): string | undefined;

  /**
   * Get current namespace
   * @returns Current namespace or undefined if not present or path is empty
   */
  getCurrentNamespace(): string | undefined;

  /**
   * Get current node's attribute value
   * @param attrName - Attribute name
   * @returns Attribute value or undefined
   */
  getAttrValue(attrName: string): any;

  /**
   * Check if current node has an attribute
   * @param attrName - Attribute name
   */
  hasAttr(attrName: string): boolean;

  /**
   * Get current node's sibling position (child index in parent)
   * @returns Position index or -1 if path is empty
   */
  getPosition(): number;

  /**
   * Get current node's repeat counter (occurrence count of this tag name)
   * @returns Counter value or -1 if path is empty
   */
  getCounter(): number;

  /**
   * Get current node's sibling index (alias for getPosition for backward compatibility)
   * @returns Index or -1 if path is empty
   * @deprecated Use getPosition() or getCounter() instead
   */
  getIndex(): number;

  /**
   * Get current path depth
   * @returns Number of nodes in the path
   */
  getDepth(): number;

  /**
   * Get path as string
   * @param separator - Optional separator (uses default if not provided)
   * @param includeNamespace - Whether to include namespace in output
   * @returns Path string (e.g., "root.users.user" or "ns:root.ns:users.user")
   */
  toString(separator?: string, includeNamespace?: boolean): string;

  /**
   * Get path as array of tag names
   * @returns Array of tag names
   */
  toArray(): string[];

  /**
   * Match current path against an Expression
   * @param expression - The expression to match against
   * @returns True if current path matches the expression
   */
  matches(expression: Expression): boolean;

  /**
   * Create a snapshot of current state
   * @returns State snapshot that can be restored later
   */
  snapshot(): MatcherSnapshot;

  // ── Blocked mutating methods ────────────────────────────────────────────────
  // These are present in the type so callers get a compile-time error with a
  // helpful message instead of a silent "property does not exist" error.

  /**
   * @throws {TypeError} Always – mutation is not allowed on a read-only view.
   */
  push(tagName: string, attrValues?: Record<string, any> | null, namespace?: string | null): never;

  /**
   * @throws {TypeError} Always – mutation is not allowed on a read-only view.
   */
  pop(): never;

  /**
   * @throws {TypeError} Always – mutation is not allowed on a read-only view.
   */
  updateCurrent(attrValues: Record<string, any>): never;

  /**
   * @throws {TypeError} Always – mutation is not allowed on a read-only view.
   */
  reset(): never;

  /**
   * @throws {TypeError} Always – mutation is not allowed on a read-only view.
   */
  restore(snapshot: MatcherSnapshot): never;
}

/**
 * Matcher - Tracks current path in XML/JSON tree and matches against Expressions
 * 
 * The matcher maintains a stack of nodes representing the current path from root to
 * current tag. It only stores attribute values for the current (top) node to minimize
 * memory usage.
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
   * Current path stack
   */
  readonly path: PathNode[];

  /**
   * Create a new Matcher
   * @param options - Configuration options
   */
  constructor(options?: MatcherOptions);

  /**
   * Push a new tag onto the path
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
   * Pop the last tag from the path
   * @returns The popped node or undefined if path is empty
   */
  pop(): PathNode | undefined;

  /**
   * Update current node's attribute values
   * Useful when attributes are parsed after push
   * @param attrValues - Attribute values
   */
  updateCurrent(attrValues: Record<string, any>): void;

  /**
   * Get current tag name
   * @returns Current tag name or undefined if path is empty
   */
  getCurrentTag(): string | undefined;

  /**
   * Get current namespace
   * @returns Current namespace or undefined if not present or path is empty
   */
  getCurrentNamespace(): string | undefined;

  /**
   * Get current node's attribute value
   * @param attrName - Attribute name
   * @returns Attribute value or undefined
   */
  getAttrValue(attrName: string): any;

  /**
   * Check if current node has an attribute
   * @param attrName - Attribute name
   */
  hasAttr(attrName: string): boolean;

  /**
   * Get current node's sibling position (child index in parent)
   * @returns Position index or -1 if path is empty
   */
  getPosition(): number;

  /**
   * Get current node's repeat counter (occurrence count of this tag name)
   * @returns Counter value or -1 if path is empty
   */
  getCounter(): number;

  /**
   * Get current node's sibling index (alias for getPosition for backward compatibility)
   * @returns Index or -1 if path is empty
   * @deprecated Use getPosition() or getCounter() instead
   */
  getIndex(): number;

  /**
   * Get current path depth
   * @returns Number of nodes in the path
   */
  getDepth(): number;

  /**
   * Get path as string
   * @param separator - Optional separator (uses default if not provided)
   * @param includeNamespace - Whether to include namespace in output
   * @returns Path string (e.g., "root.users.user" or "ns:root.ns:users.user")
   */
  toString(separator?: string, includeNamespace?: boolean): string;

  /**
   * Get path as array of tag names
   * @returns Array of tag names
   */
  toArray(): string[];

  /**
   * Reset the path to empty
   */
  reset(): void;

  /**
   * Match current path against an Expression
   * @param expression - The expression to match against
   * @returns True if current path matches the expression
   * 
   * @example
   * ```typescript
   * const expr = new Expression("root.users.user[id]");
   * const matcher = new Matcher();
   * 
   * matcher.push("root");
   * matcher.push("users");
   * matcher.push("user", { id: "123" });
   * 
   * matcher.matches(expr); // true
   * ```
   */
  matches(expression: Expression): boolean;

  /**
   * Create a snapshot of current state
   * @returns State snapshot that can be restored later
   */
  snapshot(): MatcherSnapshot;

  /**
   * Restore state from snapshot
   * @param snapshot - State snapshot from previous snapshot() call
   */
  restore(snapshot: MatcherSnapshot): void;

  /**
   * Return a read-only view of this matcher.
   */
  readOnly(): ReadOnlyMatcher;
}

/**
 * Default export containing both Expression and Matcher
 */
declare const _default: {
  Expression: typeof Expression;
  Matcher: typeof Matcher;
};

export default _default;