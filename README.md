# Craft MCP CLI 📝

_Command-line interface and SDK for Craft documents via Model Context Protocol._

Craft MCP CLI provides a simple, focused CLI for working with your Craft documents through MCP (Model Context Protocol). Manage multiple Craft connections, call tools directly from the command line, and build automations with the TypeScript SDK.

This project is a fork of [mcporter](https://github.com/modelcontextprotocol/mcporter), a general-purpose MCP CLI tool, specifically tailored for Craft's Document and Daily Notes MCP Servers via the Model Context Protocol.

## Key Features

- **Simple connection management** - Add, list, and switch between multiple Craft document connections
- **Direct tool calls** - Call Craft MCP tools directly: `craft collections_list`, `craft blocks_get id:123`
- **TypeScript SDK** - Build automations with `craftCallOnce()` and `createCraftClient()`
- **Zero config conflicts** - Uses `~/.craft/config.json`, isolated from other MCP tools
- **Auto-discovery** - Automatically detects connection type (doc vs daily-notes)

## Installation

```bash
npm install -g craft-mcp-cli
```

Or use without installing:

```bash
npx craft-mcp-cli list
```

### Local Development

To use the `craft` command locally during development:

1. Build the project:

```bash
pnpm build
```

2. Link the package globally:

```bash
npm link
```

Now you can use `craft` commands directly:

```bash
craft list
craft add work https://mcp.craft.do/links/XXX/mcp
```

**Note:** After making changes, rebuild with `pnpm build` for them to take effect in the global `craft` command.

To unlink later:

```bash
npm unlink -g craft-mcp-cli
```

## Quick Start

### 1. Add a Craft connection

Get your Craft MCP URL from a Craft document's share settings, then:

```bash
craft add work https://mcp.craft.do/links/XXX/mcp
```

The CLI will automatically detect whether it's a document or daily-notes connection.

### 2. List your connections

```bash
craft list
```

Output:
```
Craft MCP Connections:

→ work [doc]
    https://mcp.craft.do/links/XXX/mcp

Default: work
```

### 3. View available tools

```bash
craft tools              # Tools for default connection
craft tools work         # Tools for specific connection
```

### 4. Call tools

```bash
# Call on default connection
craft collections_list

# Call on specific connection
craft work blocks_get id:abc123

# With arguments
craft blocks_update id:abc123 content:'{"type":"textBlock","content":"Hello"}'
```

## CLI Commands

### Connection Management

```bash
craft add <name> <url> [--description <desc>]   # Add a connection
craft remove <name>                               # Remove a connection
craft use <name>                                  # Set default connection
craft connections                                 # List all connections
craft list                                        # Show connections (alias)
```

### Tool Operations

```bash
craft tools [connection]                          # List tools for default or specified connection
craft <connection>                               # List tools for specific connection (same as craft <connection> tools)
craft <toolName> [args...]                       # Call tool on default connection
craft <connection> <toolName> [args...]          # Call tool on specific connection
```

### Arguments

Pass arguments using `key:value` or `key=value` syntax:

```bash
craft blocks_get id:abc123
craft blocks_update id:abc123 content:'{"type":"textBlock"}'
```

## TypeScript SDK

Use the SDK to build automations:

```typescript
import { craftCallOnce, createCraftClient } from 'craft-mcp-cli';

// One-shot tool call
const result = await craftCallOnce({
  connection: 'work',
  tool: 'collections_list'
});

// Persistent client
const client = await createCraftClient('work');
const tools = await client.listTools();
const collections = await client.callTool('collections_list');
await client.close();
```

### Connection Management API

```typescript
import {
  addConnection,
  listConnections,
  getConnection,
  setDefaultConnection,
  getDefaultConnection
} from 'craft-mcp-cli';

// Add a connection programmatically
await addConnection('work', 'https://mcp.craft.do/links/XXX/mcp');

// Get connection info
const conn = await getConnection('work');
console.log(conn.type); // 'doc' or 'daily-notes'

// Set default
await setDefaultConnection('work');
```

## Configuration

Connections are stored in `~/.craft/config.json`:

```json
{
  "connections": [
    {
      "name": "work",
      "url": "https://mcp.craft.do/links/XXX/mcp",
      "type": "doc",
      "description": "Work documents"
    }
  ],
  "defaultConnection": "work"
}
```

## Advanced Usage

### OAuth Authentication

Some Craft connections may require OAuth:

```bash
craft auth work              # Complete OAuth for a connection
craft auth <url> --reset     # Reset OAuth credentials
```

### JSON Arguments

For complex arguments, use JSON files or editor mode:

```bash
# From file
craft blocks_update --args @data.json

# From stdin
echo '{"id":"abc"}' | craft blocks_get --args -

# Interactive editor
craft blocks_update --edit
```

The `--edit` flag opens an interactive editor to compose tool arguments:

- **Auto-generated template**: Creates a JSON template from the tool's input schema with helpful comments
- **Editor selection**: Uses `$EDITOR`, `$VISUAL`, or defaults to `nano`
- **GUI editor support**: Automatically adds `--wait` for VS Code, Sublime, Atom, and TextMate
- **Schema requirement**: Only works for tools that expose an input schema
- **Comment support**: You can add `//` comments in the JSON template for notes (they're removed before parsing)

Example workflow:

```bash
craft blocks_update --edit
# Opens editor with pre-filled template:
# {
#   "id": "",  // Block ID (required)
#   "content": {}  // Block content object (required)
# }
# Edit and save, then the tool is called with your arguments
```

### Debug Logging

```bash
craft list --log-level debug        # Enable debug logging
craft collections_list --json       # Output raw JSON
```

## Craft MCP Tools

```bash
craft tools               # List tools for default connection
craft tools <connection>  # List tools for specified connection
```

## Minting: Generate Types, CLI, and SDK

"Minting" lets you generate TypeScript types, standalone CLIs, and SDK clients from your Craft connections. This is perfect for building type-safe automations, creating custom CLIs, or embedding Craft functionality in your projects.

### Generate TypeScript Types and Clients

Use `craft emit-ts` to generate TypeScript definitions and typed client helpers:

```bash
# Generate types-only (interface definitions)
craft emit-ts work --out types/work-tools.d.ts

# Generate full client with runtime helpers
craft emit-ts work --mode client --out clients/work.ts
```

**Types mode** (`--mode types`, default):

- Generates a `.d.ts` file with TypeScript interfaces
- Includes doc comments and parameter hints
- Perfect for type-checking existing code

**Client mode** (`--mode client`):

- Generates both `.ts` and `.d.ts` files
- Includes a `createWorkClient()` factory function
- Wraps `createServerProxy` with proper types
- Handles runtime creation and cleanup

Example generated client usage:

```typescript
import { createWorkClient } from './clients/work.js';

const client = await createWorkClient();
const collections = await client.collections_list();
console.log(collections.text());
await client.close();
```

### Generate Standalone CLIs

Use `craft generate-cli` to create standalone CLI tools for a specific connection:

```bash
# Generate TypeScript CLI
craft generate-cli work --output cli/work.ts

# Bundle into a single JavaScript file
craft generate-cli work --bundle dist/work.js

# Compile to a native binary (Bun only)
craft generate-cli work --compile dist/work
```

**Features:**

- **Schema-aware**: Automatically maps tool arguments to CLI flags
- **Self-contained**: Embeds connection configuration
- **Multiple formats**: TypeScript, bundled JS, or compiled binary
- **Regeneration**: Use `craft inspect-cli <artifact>` to see metadata and regenerate

**Example generated CLI:**

```bash
# After generating: craft generate-cli work --bundle dist/work.js
chmod +x dist/work.js
./dist/work.js collections_list
./dist/work.js blocks_get --id abc123
```

### Inspect Generated Artifacts

```bash
# View metadata and regeneration command
craft inspect-cli dist/work.js

# Regenerate from artifact
craft generate-cli --from dist/work.js
```

## License

MIT

## Contributing

Issues and pull requests welcome at [github.com/lukilabs/craft-mcp-cli](https://github.com/your-repo/craft-mcp-cli)
