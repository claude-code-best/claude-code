# AGENTS.md - Guide for AI Agents Working with Fastify

This document provides information and guidelines for AI agents (such as GitHub Copilot, Cursor, pi, or other AI coding assistants) working with the Fastify codebase.

## Project Overview

Fastify is a high-performance web framework for Node.js focused on:
- **Speed**: One of the fastest Node.js web frameworks
- **Extensibility**: Powerful plugin architecture with hooks and decorators
- **Schema-based**: JSON Schema validation and serialization
- **Developer experience**: Expressive API with minimal overhead
- **TypeScript support**: Full type definitions included

**Current Version**: 5.7.1 (main branch)
**Repository**: https://github.com/fastify/fastify

## Repository Structure

```
fastify/
├── docs/                 # Documentation (Guides and Reference)
│   ├── Guides/          # Tutorials and how-to guides
│   └── Reference/       # API documentation
├── examples/            # Example applications and benchmarks
├── lib/                 # Core library code
├── test/                # Test files
├── types/               # TypeScript type definitions
├── build/               # Build scripts
├── integration/         # Integration tests
├── fastify.js           # Main entry point
├── fastify.d.ts         # Main TypeScript definitions
└── package.json         # Dependencies and scripts
```

## Key Files for Agents

### Core Files
- **`fastify.js`** - Main Fastify class and entry point
- **`fastify.d.ts`** - TypeScript type definitions (keep these in sync)
- **`lib/`** - All core functionality:
  - `route.js` - Route handling
  - `req-res.js` - Request and Reply objects
  - `hooks.js` - Lifecycle hooks
  - `plugin.js` - Plugin system
  - `validation.js` - Schema validation
  - `content-type-parser.js` - Body parsing
  - `logger.js` - Pino logger integration

### Configuration Files
- **`package.json`** - Scripts, dependencies, and contributors
- **`eslint.config.js`** - Linting configuration (uses neostandard)
- **`.markdownlint-cli2.yaml`** - Markdown linting rules

### Documentation Files
- **`README.md`** - Project overview and quick start
- **`CONTRIBUTING.md`** - Contribution guidelines
- **`GOVERNANCE.md`** - Links to organization governance
- **`SECURITY.md`** - Security policy
- **`docs/Guides/Contributing.md`** - Detailed contributing guide
- **`docs/Guides/Style-Guide.md`** - Coding style conventions

## Testing Conventions

### Test Framework
Fastify uses **Borp** (a custom test runner) for testing.

### Test Structure
- Tests are in the **`test/`** directory
- Test files follow the pattern: `test/<module>.test.js`
- Integration tests are in **`integration/`** directory

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run unit

# Run tests with coverage
npm run coverage

# Run tests in watch mode
npm run test:watch

# Run TypeScript type tests
npm run test:typescript

# Run CI tests (minimal)
npm run test:ci
```

### Test Requirements
- **100% line coverage** is required for all changes (enforced by CI)
- Tests must pass on all supported Node.js versions
- TypeScript types must be tested (using `tsd`)

## Code Style and Conventions

### Linting
- Uses **Neostandard** JavaScript style guide
- ESLint is configured in `eslint.config.js`
- Run `npm run lint` to check code style
- Run `npm run lint:fix` to auto-fix issues

### Key Style Rules (from Style-Guide.md)
- Use `const` and `let`, never `var`
- Use arrow functions for callbacks
- Use async/await instead of promises
- Follow semicolon usage (neostandard enforces this)
- Use template literals for string interpolation
- Prefer functional methods (`map`, `filter`, `reduce`) over loops
- Error-first callback pattern for async operations where needed

### Naming Conventions
- **Files**: kebab-case (`content-type-parser.js`)
- **Variables**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **Classes**: PascalCase
- **Private methods**: prefixed with `_`

## Common Tasks

### Adding a New Feature
1. Implement the feature in `lib/`
2. Add tests in `test/`
3. Update TypeScript types in `fastify.d.ts` or `types/`
4. Update documentation in `docs/`
5. Run `npm test` to ensure all tests pass
6. Run `npm run lint` to check code style
7. Add changelog entry for release

### Fixing a Bug
1. Add a failing test case in `test/`
2. Fix the bug in `lib/`
3. Ensure all tests pass
4. Check if TypeScript types need updating
5. Update documentation if behavior changes

### Working with Plugins
- See `docs/Guides/Write-Plugin.md` for plugin authoring
- See `docs/Guides/Plugins-Guide.md` for plugin usage
- Plugin example: `lib/plugin.js`

## Architecture Highlights

### Core Components

1. **Server (`fastify.js`)**
   - Main Fastify class
   - Server initialization and configuration
   - Plugin system integration (via `avvio`)

2. **Routing (`lib/route.js`)**
   - Uses `find-my-way` for fast route matching
   - Route registration and lookup
   - Shorthand methods (get, post, put, delete, etc.)

3. **Request/Response (`lib/req-res.js`)**
   - Request object extensions
   - Reply object with fluent API
   - Decorator support

4. **Hooks (`lib/hooks.js`)**
   - Lifecycle hooks (onRequest, preHandler, etc.)
   - Hook execution order and timing

5. **Validation (`lib/validation.js`)**
   - JSON Schema validation via AJV
   - Response serialization
   - Built-in error serializer

6. **Content Type Parser (`lib/content-type-parser.js`)**
   - Request body parsing
   - Custom parser support
   - JSON and other formats

### Plugin System
- Plugins are loaded asynchronously via `avvio`
- Supports encapsulation (scoped plugins)
- Hooks and decorators can be scoped
- See `lib/plugin.js` for implementation

## TypeScript Integration

- TypeScript definitions are in `fastify.d.ts` and `types/`
- Types must be tested with `tsd`
- Run `npm run test:typescript` to verify types
- Keep types in sync with JavaScript implementation

## Performance Considerations

Fastify prioritizes performance:
- **Routes**: Pre-compiled functions for fast matching
- **Validation**: Compiled JSON Schema validators
- **Serialization**: Compiled serializers (fast-json-stringify)
- **Logging**: Low-overhead Pino logger
- **Caching**: Route context caching with `toad-cache`

When making changes:
- Profile performance impact for hot paths
- Use benchmarks in `examples/benchmark/`
- Run `npm run benchmark` to measure

## Documentation Updates

Documentation is critical for Fastify. When changing behavior:

1. Update relevant docs in `docs/Reference/` for API changes
2. Update `docs/Guides/` for usage pattern changes
3. Check for broken links (CI validates this)
4. Update examples in `examples/` if needed
5. Run `npm run lint:markdown` to check docs

## Pre-commit Checks

Before submitting changes, ensure:

1. ✅ All tests pass: `npm test`
2. ✅ 100% coverage: `npm run coverage`
3. ✅ Linting passes: `npm run lint`
4. ✅ TypeScript types pass: `npm run test:typescript`
5. ✅ Markdown linting passes: `npm run lint:markdown`
6. ✅ Documentation is updated
7. ✅ Examples still work if affected

## Working with CI

Fastify uses GitHub Actions for CI. Workflows are in `.github/workflows/`:
- **`ci.yml`** - Main CI pipeline
- **`package-manager-ci.yml`** - Tests multiple package managers
- **`website.yml`** - Website deployment

## Agent-Specific Tips

### When Generating Code
1. Check existing patterns in `lib/` before creating new patterns
2. Follow the established error handling patterns
3. Use async/await consistently
4. Add appropriate hooks if extending lifecycle
5. Consider TypeScript types from the start

### When Refactoring
1. Ensure all tests still pass
2. Don't change public APIs without semver consideration
3. Update TypeScript definitions if signatures change
4. Check for deprecation needs
5. Update documentation for changed behavior

### When Analyzing Issues
1. Check `test/` for usage examples
2. Review relevant `docs/Reference/` files
3. Look at similar implementations in `lib/`
4. Consider the plugin system and encapsulation
5. Check hook timing and order

### Common Gotchas
- **Encapsulation**: Plugins are isolated - decorators don't leak
- **Hook order**: Hooks run in specific order (see docs/Reference/Hooks.md)
- **Async boot**: Server starts asynchronously - use `ready()` or `after()`
- **Error handling**: Use Fastify error classes from `@fastify/error`
- **Validation**: Schemas are compiled - changes require recompilation

## Key Dependencies

- **`avvio`** - Plugin loading and boot
- **`find-my-way`** - Fast HTTP router
- **`fast-json-stringify`** - Response serialization
- **`pino`** - Logging
- **`@fastify/ajv-compiler`** - JSON Schema validation
- **`light-my-request`** - HTTP injection for testing

## Contact and Resources

- **Documentation**: https://fastify.dev/
- **Discord**: https://discord.gg/fastify
- **GitHub Issues**: https://github.com/fastify/fastify/issues
- **GitHub Discussions**: https://github.com/fastify/fastify/discussions
- **Help**: https://github.com/fastify/help

## Version Information

- **Main branch**: Fastify v5
- **v4 branch**: https://github.com/fastify/fastify/tree/4.x
- **LTS Policy**: See `docs/Reference/LTS.md`

---

This document is maintained by the Fastify team. For questions or suggestions, please open an issue or discussion.
