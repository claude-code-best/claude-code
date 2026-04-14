/**
 * Types copied from path-expression-matcher
 * @version <version>
 * @updated <date>
 *
 * Update this file when path-expression-matcher releases a new version.
 * Source: https://github.com/NaturalIntelligence/path-expression-matcher
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
  type: 'tag' | 'deep-wildcard';
  tag?: string;
  namespace?: string;
  attrName?: string;
  attrValue?: string;
  position?: 'first' | 'last' | 'odd' | 'even' | 'nth';
  positionValue?: number;
}

/**
 * Expression - Parses and stores a tag pattern expression.
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
 * - `root.users.user`      — Match exact path
 * - `..user`               — Match "user" at any depth (deep wildcard)
 * - `user[id]`             — Match user tag with "id" attribute
 * - `user[id=123]`         — Match user tag where id="123"
 * - `user:first`           — Match first occurrence of user tag
 * - `ns::user`             — Match user tag with namespace "ns"
 * - `ns::user[id]:first`   — Combine namespace, attribute, and position
 */
export class Expression {
  readonly pattern: string;
  readonly separator: string;
  readonly segments: Segment[];

  constructor(pattern: string, options?: ExpressionOptions);

  get length(): number;
  hasDeepWildcard(): boolean;
  hasAttributeCondition(): boolean;
  hasPositionSelector(): boolean;
  toString(): string;
}

// ---------------------------------------------------------------------------
// ReadonlyMatcher
// ---------------------------------------------------------------------------

/**
 * A live read-only view of a {@link Matcher} instance, returned by {@link Matcher.readOnly}.
 *
 * All query and inspection methods work normally and always reflect the current
 * state of the underlying matcher. State-mutating methods (`push`, `pop`,
 * `reset`, `updateCurrent`, `restore`) are not present — calling them on the
 * underlying Proxy throws a `TypeError` at runtime.
 *
 * This is the type received by all FXP user callbacks when `jPath: false`.
 */
export interface ReadonlyMatcher {
  readonly separator: string;

  /** Check if current path matches an Expression. */
  matches(expression: Expression): boolean;

  /** Get current tag name, or `undefined` if path is empty. */
  getCurrentTag(): string | undefined;

  /** Get current namespace, or `undefined` if not present. */
  getCurrentNamespace(): string | undefined;

  /** Get attribute value of the current node. */
  getAttrValue(attrName: string): any;

  /** Check if the current node has a given attribute. */
  hasAttr(attrName: string): boolean;

  /** Sibling position of the current node (child index in parent). */
  getPosition(): number;

  /** Occurrence counter of the current tag name at this level. */
  getCounter(): number;

  /** Number of nodes in the current path. */
  getDepth(): number;

  /** Current path as a string (e.g. `"root.users.user"`). */
  toString(separator?: string, includeNamespace?: boolean): string;

  /** Current path as an array of tag names. */
  toArray(): string[];

  /**
   * Create a snapshot of the current state.
   * The snapshot can be passed to the real {@link Matcher.restore} if needed.
   */
  snapshot(): MatcherSnapshot;
}

/** Internal node structure — exposed via snapshot only. */
export interface PathNode {
  tag: string;
  namespace?: string;
  position: number;
  counter: number;
  values?: Record<string, any>;
}

/** Snapshot of matcher state returned by `snapshot()` and `readOnly().snapshot()`. */
export interface MatcherSnapshot {
  path: PathNode[];
  siblingStacks: Map<string, number>[];
}