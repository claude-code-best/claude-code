/**
 * Matcher - Tracks current path in XML/JSON tree and matches against Expressions
 * 
 * The matcher maintains a stack of nodes representing the current path from root to
 * current tag. It only stores attribute values for the current (top) node to minimize
 * memory usage. Sibling tracking is used to auto-calculate position and counter.
 * 
 * @example
 * const matcher = new Matcher();
 * matcher.push("root", {});
 * matcher.push("users", {});
 * matcher.push("user", { id: "123", type: "admin" });
 * 
 * const expr = new Expression("root.users.user");
 * matcher.matches(expr); // true
 */

/**
 * Names of methods that mutate Matcher state.
 * Any attempt to call these on a read-only view throws a TypeError.
 * @type {Set<string>}
 */
const MUTATING_METHODS = new Set(['push', 'pop', 'reset', 'updateCurrent', 'restore']);

export default class Matcher {
  /**
   * Create a new Matcher
   * @param {Object} options - Configuration options
   * @param {string} options.separator - Default path separator (default: '.')
   */
  constructor(options = {}) {
    this.separator = options.separator || '.';
    this.path = [];
    this.siblingStacks = [];
    // Each path node: { tag: string, values: object, position: number, counter: number }
    // values only present for current (last) node
    // Each siblingStacks entry: Map<tagName, count> tracking occurrences at each level
  }

  /**
   * Push a new tag onto the path
   * @param {string} tagName - Name of the tag
   * @param {Object} attrValues - Attribute key-value pairs for current node (optional)
   * @param {string} namespace - Namespace for the tag (optional)
   */
  push(tagName, attrValues = null, namespace = null) {
    // Remove values from previous current node (now becoming ancestor)
    if (this.path.length > 0) {
      const prev = this.path[this.path.length - 1];
      prev.values = undefined;
    }

    // Get or create sibling tracking for current level
    const currentLevel = this.path.length;
    if (!this.siblingStacks[currentLevel]) {
      this.siblingStacks[currentLevel] = new Map();
    }

    const siblings = this.siblingStacks[currentLevel];

    // Create a unique key for sibling tracking that includes namespace
    const siblingKey = namespace ? `${namespace}:${tagName}` : tagName;

    // Calculate counter (how many times this tag appeared at this level)
    const counter = siblings.get(siblingKey) || 0;

    // Calculate position (total children at this level so far)
    let position = 0;
    for (const count of siblings.values()) {
      position += count;
    }

    // Update sibling count for this tag
    siblings.set(siblingKey, counter + 1);

    // Create new node
    const node = {
      tag: tagName,
      position: position,
      counter: counter
    };

    // Store namespace if provided
    if (namespace !== null && namespace !== undefined) {
      node.namespace = namespace;
    }

    // Store values only for current node
    if (attrValues !== null && attrValues !== undefined) {
      node.values = attrValues;
    }

    this.path.push(node);
  }

  /**
   * Pop the last tag from the path
   * @returns {Object|undefined} The popped node
   */
  pop() {
    if (this.path.length === 0) {
      return undefined;
    }

    const node = this.path.pop();

    // Clean up sibling tracking for levels deeper than current
    // After pop, path.length is the new depth
    // We need to clean up siblingStacks[path.length + 1] and beyond
    if (this.siblingStacks.length > this.path.length + 1) {
      this.siblingStacks.length = this.path.length + 1;
    }

    return node;
  }

  /**
   * Update current node's attribute values
   * Useful when attributes are parsed after push
   * @param {Object} attrValues - Attribute values
   */
  updateCurrent(attrValues) {
    if (this.path.length > 0) {
      const current = this.path[this.path.length - 1];
      if (attrValues !== null && attrValues !== undefined) {
        current.values = attrValues;
      }
    }
  }

  /**
   * Get current tag name
   * @returns {string|undefined}
   */
  getCurrentTag() {
    return this.path.length > 0 ? this.path[this.path.length - 1].tag : undefined;
  }

  /**
   * Get current namespace
   * @returns {string|undefined}
   */
  getCurrentNamespace() {
    return this.path.length > 0 ? this.path[this.path.length - 1].namespace : undefined;
  }

  /**
   * Get current node's attribute value
   * @param {string} attrName - Attribute name
   * @returns {*} Attribute value or undefined
   */
  getAttrValue(attrName) {
    if (this.path.length === 0) return undefined;
    const current = this.path[this.path.length - 1];
    return current.values?.[attrName];
  }

  /**
   * Check if current node has an attribute
   * @param {string} attrName - Attribute name
   * @returns {boolean}
   */
  hasAttr(attrName) {
    if (this.path.length === 0) return false;
    const current = this.path[this.path.length - 1];
    return current.values !== undefined && attrName in current.values;
  }

  /**
   * Get current node's sibling position (child index in parent)
   * @returns {number}
   */
  getPosition() {
    if (this.path.length === 0) return -1;
    return this.path[this.path.length - 1].position ?? 0;
  }

  /**
   * Get current node's repeat counter (occurrence count of this tag name)
   * @returns {number}
   */
  getCounter() {
    if (this.path.length === 0) return -1;
    return this.path[this.path.length - 1].counter ?? 0;
  }

  /**
   * Get current node's sibling index (alias for getPosition for backward compatibility)
   * @returns {number}
   * @deprecated Use getPosition() or getCounter() instead
   */
  getIndex() {
    return this.getPosition();
  }

  /**
   * Get current path depth
   * @returns {number}
   */
  getDepth() {
    return this.path.length;
  }

  /**
   * Get path as string
   * @param {string} separator - Optional separator (uses default if not provided)
   * @param {boolean} includeNamespace - Whether to include namespace in output (default: true)
   * @returns {string}
   */
  toString(separator, includeNamespace = true) {
    const sep = separator || this.separator;
    return this.path.map(n => {
      if (includeNamespace && n.namespace) {
        return `${n.namespace}:${n.tag}`;
      }
      return n.tag;
    }).join(sep);
  }

  /**
   * Get path as array of tag names
   * @returns {string[]}
   */
  toArray() {
    return this.path.map(n => n.tag);
  }

  /**
   * Reset the path to empty
   */
  reset() {
    this.path = [];
    this.siblingStacks = [];
  }

  /**
   * Match current path against an Expression
   * @param {Expression} expression - The expression to match against
   * @returns {boolean} True if current path matches the expression
   */
  matches(expression) {
    const segments = expression.segments;

    if (segments.length === 0) {
      return false;
    }

    // Handle deep wildcard patterns
    if (expression.hasDeepWildcard()) {
      return this._matchWithDeepWildcard(segments);
    }

    // Simple path matching (no deep wildcards)
    return this._matchSimple(segments);
  }

  /**
   * Match simple path (no deep wildcards)
   * @private
   */
  _matchSimple(segments) {
    // Path must be same length as segments
    if (this.path.length !== segments.length) {
      return false;
    }

    // Match each segment bottom-to-top
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const node = this.path[i];
      const isCurrentNode = (i === this.path.length - 1);

      if (!this._matchSegment(segment, node, isCurrentNode)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Match path with deep wildcards
   * @private
   */
  _matchWithDeepWildcard(segments) {
    let pathIdx = this.path.length - 1;  // Start from current node (bottom)
    let segIdx = segments.length - 1;     // Start from last segment

    while (segIdx >= 0 && pathIdx >= 0) {
      const segment = segments[segIdx];

      if (segment.type === 'deep-wildcard') {
        // ".." matches zero or more levels
        segIdx--;

        if (segIdx < 0) {
          // Pattern ends with "..", always matches
          return true;
        }

        // Find where next segment matches in the path
        const nextSeg = segments[segIdx];
        let found = false;

        for (let i = pathIdx; i >= 0; i--) {
          const isCurrentNode = (i === this.path.length - 1);
          if (this._matchSegment(nextSeg, this.path[i], isCurrentNode)) {
            pathIdx = i - 1;
            segIdx--;
            found = true;
            break;
          }
        }

        if (!found) {
          return false;
        }
      } else {
        // Regular segment
        const isCurrentNode = (pathIdx === this.path.length - 1);
        if (!this._matchSegment(segment, this.path[pathIdx], isCurrentNode)) {
          return false;
        }
        pathIdx--;
        segIdx--;
      }
    }

    // All segments must be consumed
    return segIdx < 0;
  }

  /**
   * Match a single segment against a node
   * @private
   * @param {Object} segment - Segment from Expression
   * @param {Object} node - Node from path
   * @param {boolean} isCurrentNode - Whether this is the current (last) node
   * @returns {boolean}
   */
  _matchSegment(segment, node, isCurrentNode) {
    // Match tag name (* is wildcard)
    if (segment.tag !== '*' && segment.tag !== node.tag) {
      return false;
    }

    // Match namespace if specified in segment
    if (segment.namespace !== undefined) {
      // Segment has namespace - node must match it
      if (segment.namespace !== '*' && segment.namespace !== node.namespace) {
        return false;
      }
    }
    // If segment has no namespace, it matches nodes with or without namespace

    // Match attribute name (check if node has this attribute)
    // Can only check for current node since ancestors don't have values
    if (segment.attrName !== undefined) {
      if (!isCurrentNode) {
        // Can't check attributes for ancestor nodes (values not stored)
        return false;
      }

      if (!node.values || !(segment.attrName in node.values)) {
        return false;
      }

      // Match attribute value (only possible for current node)
      if (segment.attrValue !== undefined) {
        const actualValue = node.values[segment.attrName];
        // Both should be strings
        if (String(actualValue) !== String(segment.attrValue)) {
          return false;
        }
      }
    }

    // Match position (only for current node)
    if (segment.position !== undefined) {
      if (!isCurrentNode) {
        // Can't check position for ancestor nodes
        return false;
      }

      const counter = node.counter ?? 0;

      if (segment.position === 'first' && counter !== 0) {
        return false;
      } else if (segment.position === 'odd' && counter % 2 !== 1) {
        return false;
      } else if (segment.position === 'even' && counter % 2 !== 0) {
        return false;
      } else if (segment.position === 'nth') {
        if (counter !== segment.positionValue) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Create a snapshot of current state
   * @returns {Object} State snapshot
   */
  snapshot() {
    return {
      path: this.path.map(node => ({ ...node })),
      siblingStacks: this.siblingStacks.map(map => new Map(map))
    };
  }

  /**
   * Restore state from snapshot
   * @param {Object} snapshot - State snapshot
   */
  restore(snapshot) {
    this.path = snapshot.path.map(node => ({ ...node }));
    this.siblingStacks = snapshot.siblingStacks.map(map => new Map(map));
  }

  /**
   * Return a read-only view of this matcher.
   *
   * The returned object exposes all query/inspection methods but throws a
   * TypeError if any state-mutating method is called (`push`, `pop`, `reset`,
   * `updateCurrent`, `restore`).  Property reads (e.g. `.path`, `.separator`)
   * are allowed but the returned arrays/objects are frozen so callers cannot
   * mutate internal state through them either.
   *
   * @returns {ReadOnlyMatcher} A proxy that forwards read operations and blocks writes.
   *
   * @example
   * const matcher = new Matcher();
   * matcher.push("root", {});
   *
   * const ro = matcher.readOnly();
   * ro.matches(expr);      // ✓ works
   * ro.getCurrentTag();    // ✓ works
   * ro.push("child", {}); // ✗ throws TypeError
   * ro.reset();            // ✗ throws TypeError
   */
  readOnly() {
    const self = this;

    return new Proxy(self, {
      get(target, prop, receiver) {
        // Block mutating methods
        if (MUTATING_METHODS.has(prop)) {
          return () => {
            throw new TypeError(
              `Cannot call '${prop}' on a read-only Matcher. ` +
              `Obtain a writable instance to mutate state.`
            );
          };
        }

        const value = Reflect.get(target, prop, receiver);

        // Freeze array/object properties so callers can't mutate internal
        // state through direct property access (e.g. matcher.path.push(...))
        if (prop === 'path' || prop === 'siblingStacks') {
          return Object.freeze(
            Array.isArray(value)
              ? value.map(item =>
                item instanceof Map
                  ? Object.freeze(new Map(item))   // freeze a copy of each Map
                  : Object.freeze({ ...item })      // freeze a copy of each node
              )
              : value
          );
        }

        // Bind methods so `this` inside them still refers to the real Matcher
        if (typeof value === 'function') {
          return value.bind(target);
        }

        return value;
      },

      // Prevent any property assignment on the read-only view
      set(_target, prop) {
        throw new TypeError(
          `Cannot set property '${String(prop)}' on a read-only Matcher.`
        );
      },

      // Prevent property deletion
      deleteProperty(_target, prop) {
        throw new TypeError(
          `Cannot delete property '${String(prop)}' from a read-only Matcher.`
        );
      }
    });
  }
}