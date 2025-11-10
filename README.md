# Craft MCP CLI 📝

_Command-line interface and SDK for Craft documents via Model Context Protocol._

Craft MCP CLI provides a simple, focused CLI for working with your Craft documents through MCP (Model Context Protocol). Manage multiple Craft connections, call tools directly from the command line, and build automations with the TypeScript SDK.

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

### Debug Logging

```bash
craft list --log-level debug        # Enable debug logging
craft collections_list --json       # Output raw JSON
```

## Craft MCP Tools

Common tools available (varies by connection type):

**Document connections:**
- `collections_list` - List collections in the document
- `collections_create` - Create a new collection
- `collectionSchema_get` - Get collection schema
- `blocks_get` - Get block content
- `blocks_update` - Update block content

**Daily-notes connections:**
- `connection_time_get` - Get current connection time
- Plus all document tools

Use `craft tools` to see all available tools for your connection.

## License

MIT

## Contributing

Issues and pull requests welcome at [github.com/your-repo/craft-mcp-cli](https://github.com/your-repo/craft-mcp-cli)
