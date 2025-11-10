# Craft MCP CLI Usage Guide

A practical guide for using the Craft MCP CLI to interact with Craft documents via the Model Context Protocol.

## Quick Start

### Installation

```bash
npm install -g craft-mcp-cli
```

Or use without installing:

```bash
npx craft-mcp-cli list
```

### Basic Workflow

1. **Add a Craft connection** (get the MCP URL from Craft document share settings):

   ```bash
   craft add work https://mcp.craft.do/links/XXX/mcp
   ```

2. **List connections**:

   ```bash
   craft list
   ```

3. **View available tools**:

   ```bash
   craft tools              # Default connection
   craft tools work         # Specific connection
   ```

4. **Call a tool**:

   ```bash
   craft collections_list                    # Default connection
   craft work blocks_get id:abc123          # Specific connection
   ```

## Connection Management

### Adding Connections

```bash
# Basic add
craft add <name> <url>

# With description
craft add work https://mcp.craft.do/links/XXX/mcp --description "Work documents"

# The CLI automatically detects connection type (doc vs daily-notes)
```

### Managing Connections

```bash
craft list                    # List all connections with status
craft connections             # Alias for list
craft use <name>              # Set default connection
craft remove <name>           # Remove a connection
```

### Connection Types

The CLI automatically detects:

- **Document connections** (`doc`) - Individual Craft documents
- **Daily Notes connections** (`daily-notes`) - Daily notes workspace

## Tool Calling

### Basic Syntax

```bash
# Call on default connection
craft <toolName> [args...]

# Call on specific connection
craft <connection> <toolName> [args...]
```

### Argument Formats

Use `key:value` or `key=value` syntax:

```bash
craft blocks_get id:abc123
craft blocks_update id:abc123 content:'{"type":"textBlock","content":"Hello"}'
```

### Viewing Tool Signatures

```bash
# List tools with signatures
craft tools work

# Include all optional parameters
craft tools work --all-parameters

# View raw JSON schemas
craft tools work --schema
```

### Advanced Argument Input

**From JSON file:**

```bash
craft blocks_update --args @data.json
```

**From stdin:**

```bash
echo '{"id":"abc"}' | craft blocks_get --args -
```

**Interactive editor mode:**

```bash
craft blocks_update --edit
```

The `--edit` flag:

- Opens your `$EDITOR` (or `$VISUAL`, defaults to `nano`)
- Pre-fills a JSON template from the tool's schema
- Supports `//` comments in JSON (removed before parsing)
- Automatically adds `--wait` for GUI editors (VS Code, Sublime, etc.)
- Only works for tools with input schemas

## Common Workflows

### Listing Collections

```bash
craft collections_list
craft work collections_list --json  # Raw JSON output
```

### Reading Blocks

```bash
craft blocks_get id:abc123
craft work blocks_get id:abc123 --json
```

### Updating Blocks

```bash
# Simple update
craft blocks_update id:abc123 content:'{"type":"textBlock","content":"New content"}'

# Complex update with editor
craft blocks_update --edit
```

### Working with Multiple Connections

```bash
# Set default
craft use work

# Call on default
craft collections_list

# Override for one call
craft personal collections_list
```

## Output Formats

```bash
# Human-readable (default)
craft collections_list

# Raw JSON
craft collections_list --json

# Debug logging
craft list --log-level debug
```

## OAuth Authentication

Some Craft connections require OAuth:

```bash
# Complete OAuth flow
craft auth work

# Reset OAuth credentials
craft auth work --reset
```

## TypeScript SDK Usage

### One-Shot Tool Calls

```typescript
import { craftCallOnce } from 'craft-mcp-cli';

const result = await craftCallOnce({
  connection: 'work',
  tool: 'collections_list'
});

console.log(result.text());
```

### Persistent Client

```typescript
import { createCraftClient } from 'craft-mcp-cli';

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

// Add connection programmatically
await addConnection('work', 'https://mcp.craft.do/links/XXX/mcp');

// Get connection info
const conn = await getConnection('work');
console.log(conn.type); // 'doc' or 'daily-notes'

// Set default
await setDefaultConnection('work');
```

## Code Generation (Minting)

### Generate TypeScript Types

```bash
# Types-only (interface definitions)
craft emit-ts work --out types/work-tools.d.ts

# Full client with runtime helpers
craft emit-ts work --mode client --out clients/work.ts

# Include all optional parameters
craft emit-ts work --mode client --out clients/work.ts --include-optional
```

**Types mode** (`--mode types`, default):

- Generates `.d.ts` file with TypeScript interfaces
- Includes doc comments and parameter hints
- Perfect for type-checking existing code

**Client mode** (`--mode client`):

- Generates both `.ts` and `.d.ts` files
- Includes factory function (e.g., `createWorkClient()`)
- Wraps `createServerProxy` with proper types
- Handles runtime creation and cleanup

Example generated client:

```typescript
import { createWorkClient } from './clients/work.js';

const client = await createWorkClient();
const collections = await client.collections_list();
console.log(collections.text());
await client.close();
```

### Generate Standalone CLIs

```bash
# Generate TypeScript CLI
craft generate-cli work --output cli/work.ts

# Bundle into single JavaScript file
craft generate-cli work --bundle dist/work.js

# Compile to native binary (Bun only)
craft generate-cli work --compile dist/work
```

**Features:**

- Schema-aware: Maps tool arguments to CLI flags
- Self-contained: Embeds connection configuration
- Multiple formats: TypeScript, bundled JS, or compiled binary
- Regeneration: Use `craft inspect-cli <artifact>` to see metadata

**Using generated CLI:**

```bash
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

## Tips & Best Practices

### 1. Always Check Available Tools First

```bash
craft tools <connection>
```

This shows you:

- Available tool names
- Required and optional parameters
- Type signatures
- Documentation comments

### 2. Use `--edit` for Complex Arguments

When calling tools with complex nested objects, use `--edit`:

```bash
craft blocks_update --edit
```

This opens an editor with a pre-filled template based on the tool's schema.

### 3. Set a Default Connection

```bash
craft use work
```

Then you can call tools without specifying the connection each time.

### 4. Use JSON Output for Automation

```bash
craft collections_list --json | jq '.collections[0].id'
```

### 5. Debug Connection Issues

```bash
craft list --log-level debug
```

This shows detailed connection status and any errors.

### 6. Regenerate Types When Schemas Change

If a Craft connection's tools change, regenerate your TypeScript types:

```bash
craft emit-ts work --mode client --out clients/work.ts
```

### 7. Test Tools Before Automating

Always test a tool call manually before building automation:

```bash
craft tools work              # See what's available
craft work collections_list   # Test the call
craft work collections_list --json  # See the raw response
```

## Error Handling

### Common Errors

**Connection not found:**

```bash
craft use nonexistent
# Error: Connection 'nonexistent' not found
```

**Tool not found:**

```bash
craft invalid_tool
# Error: Tool 'invalid_tool' not found
```

**Missing required arguments:**

```bash
craft blocks_get
# Error: Missing required argument: id
```

**OAuth required:**

```bash
craft collections_list
# Error: OAuth authentication required. Run: craft auth work
```

### Debugging

Enable debug logging to see detailed error information:

```bash
craft <command> --log-level debug
```

## Examples

### List all collections and their IDs

```bash
craft collections_list --json | jq -r '.collections[] | "\(.id): \(.name)"'
```

### Get a specific block

```bash
craft blocks_get id:abc123
```

### Update block content

```bash
craft blocks_update id:abc123 content:'{"type":"textBlock","content":"Updated"}'
```

### Generate typed client for automation

```bash
craft emit-ts work --mode client --out src/craft-client.ts
```

Then use in your code:

```typescript
import { createWorkClient } from './craft-client.js';

const client = await createWorkClient();
const collections = await client.collections_list();
// Fully typed!
```

## Getting Help

```bash
craft help                    # General help
craft help list              # Command-specific help
craft tools --help           # Tool listing help
```

## See Also

- `README.md` - Full documentation and examples
- `docs/cli-reference.md` - Quick command reference
- `docs/emit-ts.md` - Type generation details
- `docs/cli-generator.md` - CLI generation details
- `docs/call-syntax.md` - Advanced call syntax patterns
