# path-expression-matcher

Efficient path tracking and pattern matching for XML, JSON, YAML or any other parsers.

## 🎯 Purpose

`path-expression-matcher` provides three core classes for tracking and matching paths:

- **`Expression`**: Parses and stores pattern expressions (e.g., `"root.users.user[id]"`)
- **`Matcher`**: Tracks current path during parsing and matches against expressions
- **`MatcherView`**: A lightweight read-only view of a `Matcher`, safe to pass to callbacks

Compatible with [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) and similar tools.

## 📦 Installation

```bash
npm install path-expression-matcher
```

## 🚀 Quick Start

```javascript
import { Expression, Matcher } from 'path-expression-matcher';

// Create expression (parse once, reuse many times)
const expr = new Expression("root.users.user");

// Create matcher (tracks current path)
const matcher = new Matcher();

matcher.push("root");
matcher.push("users");
matcher.push("user", { id: "123" });

// Match current path against expression
if (matcher.matches(expr)) {
  console.log("Match found!");
  console.log("Current path:", matcher.toString()); // "root.users.user"
}

// Namespace support
const nsExpr = new Expression("soap::Envelope.soap::Body..ns::UserId");
matcher.push("Envelope", null, "soap");
matcher.push("Body", null, "soap");
matcher.push("UserId", null, "ns");
console.log(matcher.toString()); // "soap:Envelope.soap:Body.ns:UserId"
```

## 📖 Pattern Syntax

### Basic Paths

```javascript
"root.users.user"           // Exact path match
"*.users.user"              // Wildcard: any parent
"root.*.user"               // Wildcard: any middle
"root.users.*"              // Wildcard: any child
```

### Deep Wildcard

```javascript
"..user"                    // user anywhere in tree
"root..user"                // user anywhere under root
"..users..user"             // users somewhere, then user below it
```

### Attribute Matching

```javascript
"user[id]"                  // user with "id" attribute
"user[type=admin]"          // user with type="admin" (current node only)
"root[lang]..user"          // user under root that has "lang" attribute
```

### Position Selectors

```javascript
"user:first"                // First user (counter=0)
"user:nth(2)"               // Third user (counter=2, zero-based)
"user:odd"                  // Odd-numbered users (counter=1,3,5...)
"user:even"                 // Even-numbered users (counter=0,2,4...)
"root.users.user:first"     // First user under users
```

**Note:** Position selectors use the **counter** (occurrence count of the tag name), not the position (child index). For example, in `<root><a/><b/><a/></root>`, the second `<a/>` has position=2 but counter=1.

### Namespaces

```javascript
"ns::user"                  // user with namespace "ns"
"soap::Envelope"            // Envelope with namespace "soap"
"ns::user[id]"              // user with namespace "ns" and "id" attribute
"ns::user:first"            // First user with namespace "ns"
"*::user"                   // user with any namespace
"..ns::item"                // item with namespace "ns" anywhere in tree
"soap::Envelope.soap::Body" // Nested namespaced elements
"ns::first"                 // Tag named "first" with namespace "ns" (NO ambiguity!)
```

**Namespace syntax:**
- Use **double colon (::)** for namespace: `ns::tag`
- Use **single colon (:)** for position: `tag:first`
- Combined: `ns::tag:first` (namespace + tag + position)

**Namespace matching rules:**
- Pattern `ns::user` matches only nodes with namespace "ns" and tag "user"
- Pattern `user` (no namespace) matches nodes with tag "user" regardless of namespace
- Pattern `*::user` matches tag "user" with any namespace (wildcard namespace)
- Namespaces are tracked separately for counter/position (e.g., `ns1::item` and `ns2::item` have independent counters)

### Wildcard Differences

**Single wildcard (`*`)** - Matches exactly ONE level:
- `"*.fix1"` matches `root.fix1` (2 levels) ✅
- `"*.fix1"` does NOT match `root.another.fix1` (3 levels) ❌
- Path depth MUST equal pattern depth

**Deep wildcard (`..`)** - Matches ZERO or MORE levels:
- `"..fix1"` matches `root.fix1` ✅
- `"..fix1"` matches `root.another.fix1` ✅
- `"..fix1"` matches `a.b.c.d.fix1` ✅
- Works at any depth

### Combined Patterns

```javascript
"..user[id]:first"              // First user with id, anywhere
"root..user[type=admin]"        // Admin user under root
"ns::user[id]:first"            // First namespaced user with id
"soap::Envelope..ns::UserId"    // UserId with namespace ns under SOAP envelope
```

## 🔧 API Reference

### Expression

#### Constructor

```javascript
new Expression(pattern, options = {}, data)
```

**Parameters:**
- `pattern` (string): Pattern to parse
- `options.separator` (string): Path separator (default: `'.'`)

**Example:**
```javascript
const expr1 = new Expression("root.users.user");
const expr2 = new Expression("root/users/user", { separator: '/' });
const expr3 = new Expression("root/users/user", { separator: '/' }, { extra: "data"});
console.log(expr3.data) // { extra: "data" }
```

#### Methods

- `hasDeepWildcard()` → boolean
- `hasAttributeCondition()` → boolean
- `hasPositionSelector()` → boolean
- `toString()` → string

### Matcher

#### Constructor

```javascript
new Matcher(options)
```

**Parameters:**
- `options.separator` (string): Default path separator (default: `'.'`)

#### Path Tracking Methods

##### `push(tagName, attrValues, namespace)`

Add a tag to the current path. Position and counter are automatically calculated.

**Parameters:**
- `tagName` (string): Tag name
- `attrValues` (object, optional): Attribute key-value pairs (current node only)
- `namespace` (string, optional): Namespace for the tag

**Example:**
```javascript
matcher.push("user", { id: "123", type: "admin" });
matcher.push("item");  // No attributes
matcher.push("Envelope", null, "soap");  // With namespace
matcher.push("Body", { version: "1.1" }, "soap");  // With both
```

**Position vs Counter:**
- **Position**: The child index in the parent (0, 1, 2, 3...)
- **Counter**: How many times this tag name appeared at this level (0, 1, 2...)

Example:
```xml
<root>
  <a/>      <!-- position=0, counter=0 -->
  <b/>      <!-- position=1, counter=0 -->
  <a/>      <!-- position=2, counter=1 -->
</root>
```

##### `pop()`

Remove the last tag from the path.

```javascript
matcher.pop();
```

##### `updateCurrent(attrValues)`

Update current node's attributes (useful when attributes are parsed after push).

```javascript
matcher.push("user");  // Don't know values yet
// ... parse attributes ...
matcher.updateCurrent({ id: "123" });
```

##### `reset()`

Clear the entire path.

```javascript
matcher.reset();
```

#### Query Methods

##### `matches(expression)`

Check if current path matches an Expression.

```javascript
const expr = new Expression("root.users.user");
if (matcher.matches(expr)) {
  // Current path matches
}
```

#### `matchesAny(exprSet)` → `boolean`

Please check `ExpressionSet` class for more details.  

```javascript
const matcher = new Matcher();
const exprSet = new ExpressionSet();
exprSet.add(new Expression("root.users.user"));
exprSet.add(new Expression("root.config.*"));
exprSet.seal();

if (matcher.matchesAny(exprSet)) {
  // Current path matches any expression in the set
}
```

##### `getCurrentTag()`

Get current tag name.

```javascript
const tag = matcher.getCurrentTag(); // "user"
```

##### `getCurrentNamespace()`

Get current namespace.

```javascript
const ns = matcher.getCurrentNamespace(); // "soap" or undefined
```

##### `getAttrValue(attrName)`

Get attribute value of current node.

```javascript
const id = matcher.getAttrValue("id"); // "123"
```

##### `hasAttr(attrName)`

Check if current node has an attribute.

```javascript
if (matcher.hasAttr("id")) {
  // Current node has "id" attribute
}
```

##### `getPosition()`

Get sibling position of current node (child index in parent).

```javascript
const position = matcher.getPosition(); // 0, 1, 2, ...
```

##### `getCounter()`

Get repeat counter of current node (occurrence count of this tag name).

```javascript
const counter = matcher.getCounter(); // 0, 1, 2, ...
```

##### `getIndex()` (deprecated)

Alias for `getPosition()`. Use `getPosition()` or `getCounter()` instead for clarity.

```javascript
const index = matcher.getIndex(); // Same as getPosition()
```

##### `getDepth()`

Get current path depth.

```javascript
const depth = matcher.getDepth(); // 3 for "root.users.user"
```

##### `toString(separator?, includeNamespace?)`

Get path as string.

**Parameters:**
- `separator` (string, optional): Path separator (uses default if not provided)
- `includeNamespace` (boolean, optional): Whether to include namespaces (default: true)

```javascript
const path = matcher.toString();           // "root.ns:user.item"
const path2 = matcher.toString('/');       // "root/ns:user/item"
const path3 = matcher.toString('.', false); // "root.user.item" (no namespaces)
```

##### `toArray()`

Get path as array.

```javascript
const arr = matcher.toArray(); // ["root", "users", "user"]
```

#### State Management

##### `snapshot()`

Create a snapshot of current state.

```javascript
const snapshot = matcher.snapshot();
```

##### `restore(snapshot)`

Restore from a snapshot.

```javascript
matcher.restore(snapshot);
```

#### Read-Only Access

##### `readOnly()`

Returns a **`MatcherView`** — a lightweight, live read-only view of the matcher. All query and inspection methods work normally and always reflect the current state of the underlying matcher. Mutation methods (`push`, `pop`, `reset`, `updateCurrent`, `restore`) simply don't exist on `MatcherView`, so misuse is caught at **compile time** by TypeScript rather than at runtime.

The **same instance** is returned on every call — no allocation occurs per invocation. This is the recommended way to share the matcher with callbacks, plugins, or any external code that only needs to inspect the current path.

```javascript
const view = matcher.readOnly();
// Same reference every time — safe to cache
view === matcher.readOnly(); // true
```

**What works on the view:**

```javascript
view.matches(expr)          // ✓ pattern matching
view.getCurrentTag()        // ✓ current tag name
view.getCurrentNamespace()  // ✓ current namespace
view.getAttrValue("id")     // ✓ attribute value
view.hasAttr("id")          // ✓ attribute presence check
view.getPosition()          // ✓ sibling position
view.getCounter()           // ✓ occurrence counter
view.getDepth()             // ✓ path depth
view.toString()             // ✓ path as string
view.toArray()              // ✓ path as array
```

**What doesn't exist (compile-time error in TypeScript):**

```javascript
view.push("child", {})      // ✗ Property 'push' does not exist on type 'MatcherView'
view.pop()                  // ✗ Property 'pop' does not exist on type 'MatcherView'
view.reset()                // ✗ Property 'reset' does not exist on type 'MatcherView'
view.updateCurrent({})      // ✗ Property 'updateCurrent' does not exist on type 'MatcherView'
view.restore(snapshot)      // ✗ Property 'restore' does not exist on type 'MatcherView'
```

**The view is live** — it always reflects the current state of the underlying matcher.

```javascript
const matcher = new Matcher();
const view = matcher.readOnly();

matcher.push("root");
view.getDepth();    // 1 — immediately reflects the push
matcher.push("users");
view.getDepth();    // 2 — still live
```

## 💡 Usage Examples

### Example 1: XML Parser with stopNodes

```javascript
import { XMLParser } from 'fast-xml-parser';
import { Expression, Matcher } from 'path-expression-matcher';

class MyParser {
  constructor() {
    this.matcher = new Matcher();
    
    // Pre-compile stop node patterns
    this.stopNodeExpressions = [
      new Expression("html.body.script"),
      new Expression("html.body.style"),
      new Expression("..svg"),
    ];
  }
  
  parseTag(tagName, attrs) {
    this.matcher.push(tagName, attrs);
    
    // Check if this is a stop node
    for (const expr of this.stopNodeExpressions) {
      if (this.matcher.matches(expr)) {
        // Don't parse children, read as raw text
        return this.readRawContent();
      }
    }
    
    // Continue normal parsing
    this.parseChildren();
    
    this.matcher.pop();
  }
}
```

### Example 2: Conditional Processing

```javascript
const matcher = new Matcher();
const userExpr = new Expression("..user[type=admin]");
const firstItemExpr = new Expression("..item:first");

function processTag(tagName, value, attrs) {
  matcher.push(tagName, attrs);
  
  if (matcher.matches(userExpr)) {
    value = enhanceAdminUser(value);
  }
  
  if (matcher.matches(firstItemExpr)) {
    value = markAsFirst(value);
  }
  
  matcher.pop();
  return value;
}
```

### Example 3: Path-based Filtering

```javascript
const patterns = [
  new Expression("data.users.user"),
  new Expression("data.posts.post"),
  new Expression("..comment[approved=true]"),
];

function shouldInclude(matcher) {
  return patterns.some(expr => matcher.matches(expr));
}
```

### Example 4: Custom Separator

```javascript
const matcher = new Matcher({ separator: '/' });
const expr = new Expression("root/config/database", { separator: '/' });

matcher.push("root");
matcher.push("config");
matcher.push("database");

console.log(matcher.toString()); // "root/config/database"
console.log(matcher.matches(expr)); // true
```

### Example 5: Attribute Checking

```javascript
const matcher = new Matcher();
matcher.push("root");
matcher.push("user", { id: "123", type: "admin", status: "active" });

// Check attribute existence (current node only)
console.log(matcher.hasAttr("id"));        // true
console.log(matcher.hasAttr("email"));     // false

// Get attribute value (current node only)
console.log(matcher.getAttrValue("type")); // "admin"

// Match by attribute
const expr1 = new Expression("user[id]");
console.log(matcher.matches(expr1));       // true

const expr2 = new Expression("user[type=admin]");
console.log(matcher.matches(expr2));       // true
```

### Example 6: Position vs Counter

```javascript
const matcher = new Matcher();
matcher.push("root");

// Mixed tags at same level
matcher.push("item");  // position=0, counter=0 (first item)
matcher.pop();

matcher.push("div");   // position=1, counter=0 (first div)
matcher.pop();

matcher.push("item");  // position=2, counter=1 (second item)

console.log(matcher.getPosition()); // 2 (third child overall)
console.log(matcher.getCounter());  // 1 (second "item" specifically)

// :first uses counter, not position
const expr = new Expression("root.item:first");
console.log(matcher.matches(expr)); // false (counter=1, not 0)
```

### Example 8: Passing a Read-Only View to External Consumers

When passing the matcher into callbacks, plugins, or other code you don't control, use `readOnly()` to get a `MatcherView` — it can inspect but never mutate parser state.

```javascript
import { Expression, Matcher } from 'path-expression-matcher';

const matcher = new Matcher();

const adminExpr = new Expression("..user[type=admin]");

function parseTag(tagName, attrs, onTag) {
  matcher.push(tagName, attrs);

  // Pass MatcherView — consumer can inspect but not mutate
  onTag(matcher.readOnly());

  matcher.pop();
}

// Safe consumer — can only read
function myPlugin(view) {
  if (view.matches(adminExpr)) {
    console.log("Admin at path:", view.toString());
    console.log("Depth:", view.getDepth());
    console.log("ID:", view.getAttrValue("id"));
  }
}

// view.push(...) or view.reset() don't exist on MatcherView —
// TypeScript catches misuse at compile time.
parseTag("user", { id: "1", type: "admin" }, myPlugin);
```

```javascript
const matcher = new Matcher();
const soapExpr = new Expression("soap::Envelope.soap::Body..ns::UserId");

// Parse SOAP document
matcher.push("Envelope", { xmlns: "..." }, "soap");
matcher.push("Body", null, "soap");
matcher.push("GetUserRequest", null, "ns");
matcher.push("UserId", null, "ns");

// Match namespaced pattern
if (matcher.matches(soapExpr)) {
  console.log("Found UserId in SOAP body");
  console.log(matcher.toString()); // "soap:Envelope.soap:Body.ns:GetUserRequest.ns:UserId"
}

// Namespace-specific counters
matcher.reset();
matcher.push("root");
matcher.push("item", null, "ns1");  // ns1::item counter=0
matcher.pop();
matcher.push("item", null, "ns2");  // ns2::item counter=0 (different namespace)
matcher.pop();
matcher.push("item", null, "ns1");  // ns1::item counter=1

const firstNs1Item = new Expression("root.ns1::item:first");
console.log(matcher.matches(firstNs1Item)); // false (counter=1)

const secondNs1Item = new Expression("root.ns1::item:nth(1)");
console.log(matcher.matches(secondNs1Item)); // true

// NO AMBIGUITY: Tags named after position keywords
matcher.reset();
matcher.push("root");
matcher.push("first", null, "ns");  // Tag named "first" with namespace

const expr = new Expression("root.ns::first");
console.log(matcher.matches(expr)); // true - matches namespace "ns", tag "first"
```

## 🏗️ Architecture

### Data Storage Strategy

**Ancestor nodes:** Store only tag name, position, and counter (minimal memory)
**Current node:** Store tag name, position, counter, and attribute values

This design minimizes memory usage:
- No attribute names stored (derived from values object when needed)
- Attribute values only for current node, not ancestors
- Attribute checking for ancestors is not supported (acceptable trade-off)
- For 1M nodes with 3 attributes each, saves ~50MB vs storing attribute names

### Matching Strategy

Matching is performed **bottom-to-top** (from current node toward root):
1. Start at current node
2. Match segments from pattern end to start
3. Attribute checking only works for current node (ancestors have no attribute data)
4. Position selectors use **counter** (occurrence count), not position (child index)

### Performance

- **Expression parsing:** One-time cost when Expression is created
- **Expression analysis:** Cached (hasDeepWildcard, hasAttributeCondition, hasPositionSelector)
- **Path tracking:** O(1) for push/pop operations
- **Pattern matching:** O(n*m) where n = path depth, m = pattern segments
- **Memory per ancestor node:** ~40-60 bytes (tag, position, counter only)
- **Memory per current node:** ~80-120 bytes (adds attribute values)

## 🎓 Design Patterns

### Pre-compile Patterns (Recommended)

```javascript
// ✅ GOOD: Parse once, reuse many times
const expr = new Expression("..user[id]");

for (let i = 0; i < 1000; i++) {
  if (matcher.matches(expr)) {
    // ...
  }
}
```

```javascript
// ❌ BAD: Parse on every iteration
for (let i = 0; i < 1000; i++) {
  if (matcher.matches(new Expression("..user[id]"))) {
    // ...
  }
}
```

### Batch Pattern Checking with ExpressionSet (Recommended)

For checking multiple patterns on every tag, use `ExpressionSet` instead of a manual loop.
It pre-indexes expressions at build time so each call to `matchesAny()` does an O(1) bucket
lookup rather than a full O(N) scan:

```javascript
import { Expression, ExpressionSet, Matcher } from 'path-expression-matcher';

// Build once at config/startup time
const stopNodes = new ExpressionSet();
stopNodes
  .add(new Expression('root.users.user'))
  .add(new Expression('root.config.*'))
  .add(new Expression('..script'))
  .seal(); // prevent accidental mutation during parsing

// Per-tag — hot path
if (stopNodes.matchesAny(matcher)) {
  // handle stop node
}
```

This replaces the manual loop pattern:

```javascript
// ❌ Before — O(N) per tag
function isStopNode(expressions, matcher) {
  for (let i = 0; i < expressions.length; i++) {
    if (matcher.matches(expressions[i])) return true;
  }
  return false;
}

// ✅ After — O(1) lookup per tag
const stopNodes = new ExpressionSet();
stopNodes.addAll(expressions);
stopNodes.matchesAny(matcher);
//or matcher.matchesAny(stopNodes)
```

---

## 📦 ExpressionSet API

`ExpressionSet` is an indexed collection of `Expression` objects designed for efficient
bulk matching. Build it once from your config, then call `matchesAny()` on every tag.

### Constructor

```javascript
const set = new ExpressionSet();
```

### `add(expression)` → `this`

Add a single `Expression`. Duplicate patterns (same pattern string) are silently ignored.
Returns `this` for chaining. Throws `TypeError` if the set is sealed.

```javascript
set.add(new Expression('root.users.user'));
set.add(new Expression('..script'));
```

### `addAll(expressions)` → `this`

Add an array of `Expression` objects at once. Returns `this` for chaining.

```javascript
set.addAll(config.stopNodes.map(p => new Expression(p)));
```

### `has(expression)` → `boolean`

Check whether an expression with the same pattern is already present.

```javascript
set.has(new Expression('root.users.user')); // true / false
```

### `seal()` → `this`

Prevent further additions. Any subsequent call to `add()` or `addAll()` throws a `TypeError`.
Useful to guard against accidental mutation once parsing has started.

```javascript
const stopNodes = new ExpressionSet();
stopNodes.addAll(patterns).seal();

stopNodes.add(new Expression('root.extra')); // ❌ TypeError: ExpressionSet is sealed
```

### `size` → `number`

Number of distinct expressions in the set.

```javascript
set.size; // 3
```

### `isSealed` → `boolean`

Whether `seal()` has been called.

### `matchesAny(matcher)` → `boolean`

Returns `true` if the matcher's current path matches **any** expression in the set.
Accepts both a `Matcher` instance and a `MatcherView`.

```javascript
if (stopNodes.matchesAny(matcher)) { /* ... */ }
if (stopNodes.matchesAny(matcher.readOnly())) { /* ... */ } // also works
```

**How indexing works:** expressions are bucketed at `add()` time, not at match time.

| Expression type | Bucket | Lookup cost |
|---|---|---|
| Fixed path, concrete tag (`root.users.user`) | `depth:tag` map | O(1) |
| Fixed path, wildcard tag (`root.config.*`) | `depth` map | O(1) |
| Deep wildcard (`..script`) | flat list | O(D) — always scanned |

In practice, deep-wildcard expressions are rare in configs, so the list stays small.

### `findMatch(matcher)` → `Expression`

Returns the Expression instance that matched the current path. Accepts both a `Matcher` instance and a `MatcherView`.

```javascript
const node = stopNodes.findMatch(matcher);
```


### Example 7: ExpressionSet in a real parser loop

```javascript
import { XMLParser } from 'fast-xml-parser';
import { Expression, ExpressionSet, Matcher } from 'path-expression-matcher';

// Config-time setup
const stopNodes = new ExpressionSet();
stopNodes
  .addAll(['script', 'style'].map(t => new Expression(`..${t}`)))
  .seal();

const matcher = new Matcher();

const parser = new XMLParser({
  onOpenTag(tagName, attrs) {
    matcher.push(tagName, attrs);
    if (stopNodes.matchesAny(matcher)) {
      // treat as stop node
    }
  },
  onCloseTag() {
    matcher.pop();
  },
});
```



## 🔗 Integration with fast-xml-parser

**Basic integration:**

```javascript
import { XMLParser } from 'fast-xml-parser';
import { Expression, Matcher } from 'path-expression-matcher';

const parser = new XMLParser({
  // Custom options using path-expression-matcher
  stopNodes: ["script", "style"].map(tag => new Expression(`..${tag}`)),
  
  tagValueProcessor: (tagName, value, jPath, hasAttrs, isLeaf, matcher) => {
    // matcher is available in callbacks
    if (matcher.matches(new Expression("..user[type=admin]"))) {
      return enhanceValue(value);
    }
    return value;
  }
});
```

## 📄 License

MIT

## 🤝 Contributing

Issues and PRs welcome! This package is designed to be used by XML/JSON parsers like fast-xml-parser. But can be used with any formar parser.