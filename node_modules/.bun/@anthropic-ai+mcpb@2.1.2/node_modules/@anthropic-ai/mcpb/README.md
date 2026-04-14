# MCP Bundles (MCPB)

> **⚠️ IMPORTANT NOTICE: This project is being renamed from DXT (Desktop Extensions) to MCPB (MCP Bundles)**
>
> If you're looking for the DXT tools, they have been renamed to MCPB. Please update your dependencies and tooling:
>
> - `dxt` CLI is now `mcpb`
> - `.dxt` files are now `.mcpb` files
> - `@anthropic-ai/dxt` package will be moved to `@anthropic-ai/mcpb`

MCP Bundles (`.mcpb`) are zip archives containing a local MCP server and a `manifest.json` that describes the server and its capabilities. The format is spiritually similar to Chrome extensions (`.crx`) or VS Code extensions (`.vsix`), enabling end users to install local MCP servers with a single click.

This repository provides three components: The bundle specification in [MANIFEST.md](MANIFEST.md), a CLI tool for creating bundles (see [CLI.md](CLI.md)), and the code used by Claude for macOS and Windows to load and verify MCPB bundles ([src/index.ts](src/index.ts)).

- For developers of local MCP servers, we aim to make distribution and installation of said servers convenient
- For developers of apps supporting local MCP servers, we aim to make it easy to add support for MCPB bundles

Claude for macOS and Windows uses the code in this repository to enable single-click installation of local MCP servers, including a number of end user-friendly features - such as automatic updates, easy configuration of MCP servers and the variables and parameters they need, and a curated directory. We are committed to the open ecosystem around MCP servers and believe that its ability to be universally adopted by multiple applications and services has benefits developers aiming to connect AI tools to other apps and services. Consequently, we're open-sourcing the MCP Bundle specification, toolchain, and the schemas and key functions used by Claude for macOS and Windows to implement its own support of MCP Bundles. It is our hope that the `mcpb` format doesn't just make local MCP servers more portable for Claude, but other AI desktop applications, too.

# For Bundle Developers

At the core, MCPB are simple zip files containing your entire MCP server and a `manifest.json`. Consequently, turning a local MCP server into a bundle is straightforward: You just have to put all your required files in a folder, create a `manifest.json`, and then create an archive.

To make this process easier, this package offers a CLI that helps you with the creation of both the `manifest.json` and the final `.mcpb` file. To install it, run:

```sh
npm install -g @anthropic-ai/mcpb
```

1. In a folder containing your local MCP server, run `mcpb init`. This command will guide you through the creation of a `manifest.json`.
2. Run `mcpb pack` to create a `mcpb` file.
3. Now, any app implementing support for MCPB can run your local MCP server. As an example, open the file with Claude for macOS and Windows to show an installation dialog.

You can find the full spec for the `manifest.json` and all its mandatory and optional fields in [MANIFEST.md](MANIFEST.md). Examples for bundles can be found in [examples](./examples/).

## Prompt Template for AI Tools

AI tools like Claude Code are particularly good at creating MCP bundles when informed about the spec. When prompting an AI coding tool to build a bundle, briefly explain what your bundle aims to do - then add the following context to your instructions.

> I want to build this as a MCP Bundle, abbreviated as "MCPB". Please follow these steps:
>
> 1. **Read the specifications thoroughly:**
>    - https://github.com/anthropics/mcpb/blob/main/README.md - MCPB architecture overview, capabilities, and integration
>      patterns
>    - https://github.com/anthropics/mcpb/blob/main/MANIFEST.md - Complete bundle manifest structure and field definitions
>    - https://github.com/anthropics/mcpb/tree/main/examples - Reference implementations including a "Hello World" example
> 2. **Create a proper bundle structure:**
>    - Generate a valid manifest.json following the MANIFEST.md spec
>    - Implement an MCP server using @modelcontextprotocol/sdk with proper tool definitions
>    - Include proper error handling, security measures, and timeout management
> 3. **Follow best development practices:**
>    - Implement proper MCP protocol communication via stdio transport
>    - Structure tools with clear schemas, validation, and consistent JSON responses
>    - Make use of the fact that this bundle will be running locally
>    - Add appropriate logging and debugging capabilities
>    - Include proper documentation and setup instructions
> 4. **Test considerations:**
>    - Validate that all tool calls return properly structured responses
>    - Verify manifest loads correctly and host integration works
>
> Generate complete, production-ready code that can be immediately tested. Focus on defensive programming, clear error messages, and following the exact MCPB specifications to ensure compatibility with the ecosystem.

## Directory Structures

### Minimal Bundle

A `manifest.json` is the only required file.

### Example: Node.js Bundle

```
bundle.mcpb (ZIP file)
├── manifest.json         # Required: Bundle metadata and configuration
├── server/               # Server files
│   └── index.js          # Main entry point
├── node_modules/         # Bundled dependencies
├── package.json          # Optional: NPM package definition
├── icon.png              # Optional: Bundle icon
└── assets/               # Optional: Additional assets
```

### Example: Python Bundle

```
bundle.mcpb (ZIP file)
├── manifest.json         # Required: Bundle metadata and configuration
├── server/               # Server files
│   ├── main.py           # Main entry point
│   └── utils.py          # Additional modules
├── lib/                  # Bundled Python packages
├── requirements.txt      # Optional: Python dependencies list
└── icon.png              # Optional: Bundle icon
```

### Example: Binary Bundle

```
bundle.mcpb (ZIP file)
├── manifest.json         # Required: Bundle metadata and configuration
├── server/               # Server files
│   ├── my-server         # Unix executable
│   ├── my-server.exe     # Windows executable
└── icon.png              # Optional: Bundle icon
```

### Language Choice Recommendation

**We recommend implementing MCP servers in Node.js** rather than Python to reduce installation friction. Node.js ships with Claude for macOS and Windows, which means your bundle will work out-of-the-box for users without requiring them to install additional Python runtimes (or you to package them manually).

### Bundling Dependencies

**UV Runtime (Experimental - v0.4+):**

- Use `server.type = "uv"` in manifest
- Include `pyproject.toml` with dependencies (no bundled packages needed)
- Host application manages Python and dependencies automatically
- Works cross-platform without user Python installation
- See `examples/hello-world-uv`

**Python Bundles (Traditional):**

- Use `server.type = "python"` in manifest
- Bundle all required packages in `server/lib/` directory
- OR bundle a complete virtual environment in `server/venv/`
- Use tools like `pip-tools`, `poetry`, or `pipenv` to create reproducible bundles
- Set `PYTHONPATH` to include bundled packages via `mcp_config.env`
- **Limitation**: Cannot portably bundle compiled dependencies (e.g., pydantic, which the MCP Python SDK requires)

**Node.js Bundles:**

- Run `npm install --production` to create `node_modules`
- Bundle the entire `node_modules` directory with your bundle
- Use `npm ci` or `yarn install --frozen-lockfile` for reproducible builds
- Server entry point specified in manifest.json's `server.entry_point`

**Binary Bundles:**

- Static linking preferred for maximum compatibility
- Include all required shared libraries if dynamic linking used
- Test on clean systems without development tools

# Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## Development Setup

```sh
# Clone the repository
git clone https://github.com/anthropics/mcpb.git
cd mcpb

# Install dependencies
yarn

# Build the project
yarn build

# Run tests
yarn test
```

## Release Process

1. Update version in `package.json`
2. Create a pull request with version bump
3. After merge, create a GitHub release
4. Package will be automatically published to npm

# License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
