# Craft MCP CLI - Implementation Plan

## Overview
Fork mcporter to create a Craft-specific CLI with better UX, connection management, and TypeScript SDK. Keep all dynamic tool discovery and mcporter's core architecture.

## Goals
1. **Connection Management** - Add/remove/list/use Craft connections with friendly names
2. **Better UX** - `craft <connection> <tool>` syntax, multiple JSON input methods
3. **TypeScript SDK** - Programmatic API for Craft MCP operations
4. **Type Auto-Discovery** - Automatically detect if connection is `doc` or `daily-notes`
5. **Craft-Specific** - Validate URLs, no generic MCP exposure

---

## Architecture Overview

### What We're Keeping from mcporter
- ✅ Dynamic tool discovery via `runtime.listTools()`
- ✅ TypeScript-style tool formatting
- ✅ OAuth handling
- ✅ Connection pooling
- ✅ Transport layer (HTTP/stdio)
- ✅ Tool schema parsing
- ✅ Fuzzy matching / auto-correction
- ✅ Ephemeral server system

### What We're Adding
- 🆕 Connection config system (`~/.craft/config.json`)
- 🆕 Connection-aware command routing (`craft <connection> <tool>`)
- 🆕 Multi-method JSON input (file, stdin, editor, inline, --args)
- 🆕 Craft URL validation
- 🆕 Type auto-discovery
- 🆕 Craft-specific SDK exports

---

## 1. Connection Management System

### Config File Location
`~/.craft/config.json`

### Schema
```typescript
interface CraftConfig {
  connections: CraftConnection[];
  defaultConnection?: string;
}

interface CraftConnection {
  name: string;              // User-friendly name (e.g., "work-docs")
  url: string;               // Craft MCP URL
  type?: 'doc' | 'daily-notes';  // Auto-discovered, cached here
  description?: string;      // Optional user description
}
```

### File: `src/craft-config.ts`

**Functions to implement:**
- `loadCraftConfig(): Promise<CraftConfig>` - Load from ~/.craft/config.json, return empty if not exists
- `saveCraftConfig(config: CraftConfig): Promise<void>` - Save to file
- `addConnection(name: string, url: string, description?: string): Promise<void>`
  - Validates Craft URL
  - Auto-discovers type by connecting and inspecting tools/metadata
  - Adds to config
  - Sets as default if first connection
- `removeConnection(name: string): Promise<void>` - Remove connection, update default if needed
- `listConnections(): Promise<void>` - Pretty-print all connections
- `useConnection(name: string): Promise<void>` - Set default connection
- `getDefaultConnection(): Promise<CraftConnection | null>` - Get default
- `getConnection(name: string): Promise<CraftConnection>` - Get by name, throw if not found
- `resolveConnection(nameOrDefault?: string): Promise<CraftConnection>` - Resolve name or use default

**Type Auto-Discovery Logic:**
```typescript
async function discoverConnectionType(url: string): Promise<'doc' | 'daily-notes'> {
  // Create ephemeral runtime
  // Connect to MCP server
  // Check server info metadata or available tools
  // Infer type based on available toolset or server description
  // Return type
  // Close connection
}
```

---

## 2. Craft URL Validation

### File: `src/craft-validation.ts`

**Function:**
```typescript
export function validateCraftUrl(url: string): void {
  // Parse URL
  // Check hostname ends with 'craft.do'
  // Check path includes '/mcp'
  // Check protocol is 'https:'
  // Throw descriptive error if any check fails
}
```

**Called by:**
- All SDK functions that accept URLs
- CLI commands that accept URLs
- Connection management functions

---

## 3. Enhanced JSON Argument Parsing

### File: `src/cli/json-input.ts`

### Function 1: `parseJsonValue(value: string): Promise<unknown>`
Supports 5 input methods:

1. **Inline JSON**: `'{"key": "value"}'` → `JSON.parse(value)`
2. **File**: `@filename.json` → Read file + parse
3. **Stdin**: `-` → Read from stdin + parse
4. **Empty string**: `''` → Return undefined (for optional params)
5. **Otherwise**: Try parse, throw helpful error

```typescript
export async function parseJsonValue(value: string): Promise<unknown> {
  if (value === undefined || value === '') {
    return undefined;
  }

  // Stdin
  if (value === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks).toString('utf-8').trim();
    return JSON.parse(content);
  }

  // File
  if (value.startsWith('@')) {
    const filePath = value.slice(1);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content.trim());
  }

  // Inline JSON
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(
      `Invalid JSON: ${error.message}\n` +
      `Supported formats:\n` +
      `  - Inline JSON: '{"key": "value"}'\n` +
      `  - File: @filename.json\n` +
      `  - Stdin: -`
    );
  }
}
```

### Function 2: `openEditorForArgs(toolSchema: ServerToolInfo): Promise<Record<string, unknown>>`

1. Generate template from tool's inputSchema using `generateTemplateFromSchema()`
2. Write template to temp file
3. Open in $EDITOR (fallback: nano, then vi)
4. Wait for editor to close
5. Read file, strip comments
6. Parse JSON
7. Return args object

```typescript
export async function openEditorForArgs(
  toolSchema: ServerToolInfo
): Promise<Record<string, unknown>> {
  const template = generateTemplateFromSchema(toolSchema.inputSchema);

  const tmpDir = path.join(os.tmpdir(), 'craft-cli');
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `craft-${toolSchema.name}-${Date.now()}.json`);

  await fs.writeFile(tmpFile, template, 'utf-8');

  const editor = process.env.EDITOR || process.env.VISUAL || 'nano';

  return new Promise((resolve, reject) => {
    const child = spawn(editor, [tmpFile], { stdio: 'inherit' });

    child.on('exit', async (code) => {
      if (code !== 0) {
        await fs.unlink(tmpFile).catch(() => {});
        reject(new Error(`Editor exited with code ${code}`));
        return;
      }

      try {
        const content = await fs.readFile(tmpFile, 'utf-8');
        await fs.unlink(tmpFile).catch(() => {});

        // Remove comments (lines starting with //)
        const jsonContent = content
          .split('\n')
          .filter(line => !line.trim().startsWith('//'))
          .join('\n');

        resolve(JSON.parse(jsonContent));
      } catch (error) {
        await fs.unlink(tmpFile).catch(() => {});
        reject(error);
      }
    });

    child.on('error', async (error) => {
      await fs.unlink(tmpFile).catch(() => {});
      reject(error);
    });
  });
}
```

### Function 3: `generateTemplateFromSchema(schema: JSONSchema): string`

Convert JSON schema to commented JSON template:

```typescript
export function generateTemplateFromSchema(schema: any): string {
  const properties = schema.properties || {};
  const required = schema.required || [];

  const lines: string[] = ['{'];

  for (const [key, prop] of Object.entries(properties)) {
    const isRequired = required.includes(key);
    const desc = (prop as any).description || '';

    // Add comment
    if (desc) {
      lines.push(`  // ${isRequired ? 'REQUIRED' : 'OPTIONAL'}: ${desc}`);
    }

    // Add property with example value
    const example = generateExampleValue(prop);
    lines.push(`  "${key}": ${JSON.stringify(example, null, 2).replace(/\n/g, '\n  ')}${key !== lastKey ? ',' : ''}`);
    lines.push('');
  }

  lines.push('}');
  return lines.join('\n');
}
```

---

## 4. Modify Argument Parsing

### File: `src/cli/call-arguments.ts`

### Changes:

1. **Make function async**
   - `parseCallArguments(...)` → `async parseCallArguments(...)`
   - Update return type
   - Update all callers

2. **Enhanced --args parsing (lines 71-86)**
   ```typescript
   // Current:
   if (token === '--args') {
     const value = args[index + 1];
     Object.assign(result.args, JSON.parse(value));
   }

   // New:
   if (token === '--args') {
     const value = args[index + 1];
     const parsed = await parseJsonValue(value);
     Object.assign(result.args, parsed);
   }
   ```

3. **Add --edit flag detection**
   ```typescript
   if (token === '--edit') {
     result.editMode = true;
     index++;
     continue;
   }
   ```

4. **Apply parseJsonValue to individual args**
   - When parsing `key=value` or `key:value` patterns
   - Check if value starts with `@` or is `-`
   - Use `await parseJsonValue(value)` for these cases

---

## 5. Connection-Aware Command Routing

### File: `src/cli/command-inference.ts`

**Add before line 78:**

```typescript
import { loadCraftConfig } from '../craft-config.js';

// Inside inferCommand function, before existing logic:
const craftConfig = await loadCraftConfig();
const connectionMatch = craftConfig.connections.find(
  c => c.name === tokens[0]
);

if (connectionMatch) {
  // Connection name found: craft <connection> <command>
  const connectionName = tokens.shift()!;

  // Continue inference with remaining tokens
  // Pass connectionName to downstream commands
  return {
    ...inferredCommand,
    defaultConnection: connectionName
  };
}
```

**Update InferredCommand type:**
```typescript
interface InferredCommand {
  command: 'list' | 'call' | 'auth' | ...;
  defaultConnection?: string;
  // ... rest
}
```

---

## 6. Update Call and List Commands

### File: `src/cli/call-command.ts`

**Add parameter: `defaultConnection?: string`**

```typescript
export async function runCallCommand(
  runtime: Runtime,
  argv: string[],
  defaultConnection?: string  // NEW
): Promise<void> {
  // ...

  // When parsing args, if no --server flag and defaultConnection provided:
  if (!parseResult.server && defaultConnection) {
    const conn = await getConnection(defaultConnection);
    // Create ephemeral server from connection
    // Use that for the call
  }

  // Handle --edit mode
  if (parseResult.editMode) {
    // Fetch tool schema
    const tools = await runtime.listTools(server);
    const tool = tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    // Open editor
    const args = await openEditorForArgs(tool);
    parseResult.args = args;
  }

  // Continue with call...
}
```

### File: `src/cli/list-command.ts`

**Show connection type in output:**

```typescript
// When listing tools for a connection
const conn = await getConnection(connectionName);
console.log(`${conn.name} [${conn.type || 'unknown'}] - ${tools.length} tools\n`);
```

---

## 7. Add Connection Management Commands

### File: `src/cli.ts`

**Add before existing command handling (around line 72):**

```typescript
import {
  addConnection,
  removeConnection,
  listConnections,
  useConnection,
  loadCraftConfig
} from './craft-config.js';

// Connection management commands
if (command === 'add') {
  if (args.length < 2) {
    console.error('Usage: craft add <name> <url> [--description <desc>]');
    process.exit(1);
  }

  const [name, url] = args;
  const description = extractFlag(argv, '--description', '-d');

  await addConnection(name, url, description);
  return;
}

if (command === 'list' && args.length === 0) {
  // Could be connection list or tool list
  // If we have connections, show them
  const config = await loadCraftConfig();
  if (config.connections.length > 0 && !extractFlag(argv, '--tools')) {
    await listConnections();
    return;
  }
}

if (command === 'remove') {
  if (args.length === 0) {
    console.error('Usage: craft remove <name>');
    process.exit(1);
  }

  await removeConnection(args[0]);
  return;
}

if (command === 'use') {
  if (args.length === 0) {
    console.error('Usage: craft use <name>');
    process.exit(1);
  }

  await useConnection(args[0]);
  return;
}

if (command === 'tools') {
  // List tools for default or specified connection
  const connectionName = args[0] || (await getDefaultConnection())?.name;
  if (!connectionName) {
    console.error('No default connection. Use: craft use <name>');
    process.exit(1);
  }

  await listToolsForConnection(connectionName, runtime);
  return;
}

// Continue with existing command inference...
```

---

## 8. Craft-Specific SDK

### File: `src/craft-runtime.ts`

```typescript
import { createRuntime } from './runtime.js';
import { callOnce } from './runtime.js';
import { resolveConnection, getConnection } from './craft-config.js';
import { validateCraftUrl } from './craft-validation.js';

export async function craftCallOnce(params: {
  connection: string;  // Connection name from config
  tool: string;
  args?: Record<string, unknown>;
}): Promise<unknown> {
  const conn = await resolveConnection(params.connection);
  validateCraftUrl(conn.url);

  // Create ephemeral server definition
  return callOnce({
    server: {
      name: conn.name,
      command: {
        kind: 'http' as const,
        url: new URL(conn.url)
      },
      description: conn.description
    },
    toolName: params.tool,
    args: params.args
  });
}

export async function createCraftClient(connectionName: string) {
  const conn = await resolveConnection(connectionName);
  validateCraftUrl(conn.url);

  // Create temp config with this connection
  const tempConfigPath = path.join(os.tmpdir(), `craft-${Date.now()}.json`);
  const tempConfig = {
    mcpServers: {
      [conn.name]: {
        baseUrl: conn.url,
        description: conn.description
      }
    },
    imports: []
  };

  await fs.writeFile(tempConfigPath, JSON.stringify(tempConfig), 'utf-8');

  const runtime = await createRuntime({ configPath: tempConfigPath });

  return {
    callTool: (tool: string, args?: Record<string, unknown>) =>
      runtime.callTool(conn.name, tool, { args }),

    listTools: () =>
      runtime.listTools(conn.name),

    close: async () => {
      await runtime.close();
      await fs.unlink(tempConfigPath).catch(() => {});
    }
  };
}
```

### File: `src/sdk.ts`

```typescript
// Connection management
export {
  addConnection,
  removeConnection,
  listConnections,
  getConnection,
  useConnection as setDefaultConnection,
  getDefaultConnection
} from './craft-config.js';

// Craft-specific calling
export {
  craftCallOnce,
  createCraftClient
} from './craft-runtime.js';

// Types
export type {
  CraftConnection,
  CraftConnectionType,
  CraftConfig
} from './craft-config.js';
```

---

## 9. Update package.json

```json
{
  "name": "craft-mcp-cli",
  "version": "1.0.0",
  "description": "CLI and SDK for Craft documents via Model Context Protocol",
  "type": "module",
  "main": "./dist/sdk.js",
  "types": "./dist/sdk.d.ts",
  "bin": {
    "craft": "./dist/cli.js"
  },
  "exports": {
    ".": {
      "import": "./dist/sdk.js",
      "types": "./dist/sdk.d.ts"
    }
  },
  "scripts": {
    "craft": "tsx src/cli.ts",
    "build": "tsc -p tsconfig.build.json",
    "...": "..."
  },
  "keywords": [
    "craft",
    "mcp",
    "model-context-protocol",
    "cli",
    "sdk"
  ],
  "author": "Craft Team",
  "license": "MIT"
}
```

---

## Implementation Order

1. ✅ ~~Create `craft.ts` standalone~~ (done, but will replace)
2. Create `src/craft-validation.ts` - URL validation
3. Create `src/craft-config.ts` - Connection management with type auto-discovery
4. Create `src/cli/json-input.ts` - Multi-method JSON parsing
5. Modify `src/cli/call-arguments.ts` - Make async, use parseJsonValue
6. Modify `src/cli/command-inference.ts` - Connection-aware routing
7. Modify `src/cli/call-command.ts` - Accept defaultConnection, handle --edit
8. Modify `src/cli/list-command.ts` - Show connection types
9. Modify `src/cli.ts` - Add connection commands, update branding
10. Create `src/craft-runtime.ts` - SDK calling functions
11. Create `src/sdk.ts` - Public SDK exports
12. Update `package.json` - Name, bin, exports
13. Update `tsconfig.build.json` - Include new files
14. Test: `pnpm build && npm link`

---

## Files Summary

### New Files
- `src/craft-validation.ts` - Craft URL validation ✅ Started
- `src/craft-config.ts` - Connection config management (with type auto-discovery)
- `src/craft-runtime.ts` - SDK runtime functions
- `src/sdk.ts` - Public SDK exports
- `src/cli/json-input.ts` - Multi-method JSON parsing

### Modified Files
- `src/cli.ts` - Add connection commands, branding
- `src/cli/call-arguments.ts` - Async + enhanced parsing + --edit
- `src/cli/call-command.ts` - Accept defaultConnection, handle --edit mode
- `src/cli/command-inference.ts` - Connection-aware routing
- `src/cli/list-command.ts` - Show connection types
- `package.json` - Name, bin, exports
- `tsconfig.build.json` - Include craft.ts and new files

### Unchanged (Keep as-is)
- `src/runtime.ts` - Core MCP runtime ✅
- `src/config.ts` - Config loading ✅
- `src/transports/` - All transport code ✅
- `src/cli/list-format.ts` - TypeScript formatting ✅
- Tool discovery, caching, OAuth - All unchanged ✅

---

## Testing Plan

### Manual Testing

```bash
# Build and link
pnpm build
npm link

# Test connection management
craft add work-docs https://mcp.craft.do/links/SECRET1/mcp
craft add daily https://mcp.craft.do/links/SECRET2/mcp -d "Daily notes"
craft list
craft use work-docs

# Test tool discovery
craft tools
craft work-docs tools
craft daily tools

# Test calling with different input methods

# 1. Simple inline args
craft collections_list
craft blocks_get --id "123"

# 2. With connection prefix
craft work-docs collections_list
craft daily blocks_get --id "456"

# 3. File input
echo '{"blocks": [...], "position": {...}}' > /tmp/blocks.json
craft blocks_add --blocks @/tmp/blocks.json --position '{"location":"end"}'

# 4. Complete args from file
echo '{"blocks": [...], "position": {...}}' > /tmp/complete.json
craft blocks_add --args @/tmp/complete.json

# 5. Stdin
echo '{"blocks": [...], "position": {...}}' | craft blocks_add --args -

# 6. Editor mode
craft blocks_add --edit
# Should open editor with template

# Test SDK
node -e "
import('craft-mcp-cli').then(async ({craftCallOnce, listConnections}) => {
  const conns = await listConnections();
  console.log('Connections:', conns);

  const result = await craftCallOnce({
    connection: 'work-docs',
    tool: 'collections_list'
  });
  console.log('Result:', result);
});
"
```

### Validation Testing

```bash
# Should fail - invalid URL
craft add bad http://example.com/mcp

# Should fail - not craft.do
craft add bad https://example.com/mcp

# Should fail - no /mcp path
craft add bad https://mcp.craft.do/links/SECRET

# Should succeed
craft add good https://mcp.craft.do/links/SECRET/mcp
```

---

## Success Criteria

- ✅ Can add/remove/list Craft connections
- ✅ Type is auto-discovered and cached
- ✅ Can list tools with `craft tools` or `craft <connection> tools`
- ✅ Can call tools with `craft <connection> <tool> <args>`
- ✅ All 5 JSON input methods work (@file, -, inline, --args, --edit)
- ✅ --edit opens editor with full parameter template
- ✅ SDK exports work from TypeScript code
- ✅ Craft URL validation prevents non-Craft MCPs
- ✅ Dynamic tool discovery works (no hardcoded tools)
- ✅ TypeScript formatting preserved from mcporter

---

## Future Enhancements

- [ ] Connection import from Craft app
- [ ] Connection export/sharing
- [ ] Tool favorites/aliases
- [ ] Interactive connection wizard
- [ ] Better error messages with suggestions
- [ ] Shell completions (bash/zsh/fish)
- [ ] Connection health checks
- [ ] Batch operations across connections
