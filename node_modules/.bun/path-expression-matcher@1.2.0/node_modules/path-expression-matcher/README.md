# path-expression-matcher

Efficient path tracking and pattern matching for XML, JSON, YAML or any other parsers.

## 🎯 Purpose

`path-expression-matcher` provides two core classes for tracking and matching paths:

- **`Expression`**: Parses and stores pattern expressions (e.g., `"root.users.user[id]"`)
- **`Matcher`**: Tracks current path during parsing and matches against expressions

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
new Expression(pattern, options)
```

**Parameters:**
- `pattern` (string): Pattern to parse
- `options.separator` (string): Path separator (default: `'.'`)

**Example:**
```javascript
const expr1 = new Expression("root.users.user");
const expr2 = new Expression("root/users/user", { separator: '/' });
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

Returns a **live, read-only proxy** of the matcher. All query and inspection methods work normally, but any attempt to call a state-mutating method (`push`, `pop`, `reset`, `updateCurrent`, `restore`) or to write/delete a property throws a `TypeError`.

This is the recommended way to share the matcher with external consumers — plugins, callbacks, event handlers — that only need to inspect the current path without being able to corrupt parser state.

```javascript
const ro = matcher.readOnly();
```

**What works on the read-only view:**

```javascript
ro.matches(expr)          // ✓ pattern matching
ro.getCurrentTag()        // ✓ current tag name
ro.getCurrentNamespace()  // ✓ current namespace
ro.getAttrValue("id")     // ✓ attribute value
ro.hasAttr("id")          // ✓ attribute presence check
ro.getPosition()          // ✓ sibling position
ro.getCounter()           // ✓ occurrence counter
ro.getDepth()             // ✓ path depth
ro.toString()             // ✓ path as string
ro.toArray()              // ✓ path as array
ro.snapshot()             // ✓ snapshot (can be used to restore the real matcher)
```

**What throws a `TypeError`:**

```javascript
ro.push("child", {})      // ✗ TypeError: Cannot call 'push' on a read-only Matcher
ro.pop()                  // ✗ TypeError: Cannot call 'pop' on a read-only Matcher
ro.reset()                // ✗ TypeError: Cannot call 'reset' on a read-only Matcher
ro.updateCurrent({})      // ✗ TypeError: Cannot call 'updateCurrent' on a read-only Matcher
ro.restore(snapshot)      // ✗ TypeError: Cannot call 'restore' on a read-only Matcher
ro.separator = '/'        // ✗ TypeError: Cannot set property on a read-only Matcher
```

**Important:** The read-only view is **live** — it always reflects the current state of the underlying matcher. If you need a frozen-in-time copy instead, use `snapshot()`.

```javascript
const matcher = new Matcher();
const ro = matcher.readOnly();

matcher.push("root");
ro.getDepth();    // 1 — immediately reflects the push
matcher.push("users");
ro.getDepth();    // 2 — still live
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

### Example 8: Passing a Read-Only Matcher to External Consumers

When passing the matcher into callbacks, plugins, or other code you don't control, use `readOnly()` to prevent accidental state corruption.

```javascript
import { Expression, Matcher } from 'path-expression-matcher';

const matcher = new Matcher();

const adminExpr = new Expression("..user[type=admin]");

function parseTag(tagName, attrs, onTag) {
  matcher.push(tagName, attrs);

  // Pass a read-only view — consumer can inspect but not mutate
  onTag(matcher.readOnly());

  matcher.pop();
}

// Safe consumer — can only read
function myPlugin(ro) {
  if (ro.matches(adminExpr)) {
    console.log("Admin at path:", ro.toString());
    console.log("Depth:", ro.getDepth());
    console.log("ID:", ro.getAttrValue("id"));
  }
}

// ro.push(...) or ro.reset() here would throw TypeError,
// so the parser's state is always safe.
parseTag("user", { id: "1", type: "admin" }, myPlugin);
```

**Combining with `snapshot()`:** A snapshot taken via the read-only view can still be used to restore the real matcher.

```javascript
const matcher = new Matcher();
matcher.push("root");
matcher.push("users");

const ro = matcher.readOnly();
const snap = ro.snapshot();       // ✓ snapshot works on read-only view

matcher.push("user");             // continue parsing...
matcher.restore(snap);            // restore to "root.users" using the snapshot
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

### Batch Pattern Checking

```javascript
// For multiple patterns, check all at once
const patterns = [
  new Expression("..user"),
  new Expression("..post"),
  new Expression("..comment"),
];

function matchesAny(matcher, patterns) {
  return patterns.some(expr => matcher.matches(expr));
}
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

Issues and PRs welcome! This package is designed to be used by XML/JSON parsers like fast-xml-parser.