---
summary: 'High-level overview of Craft MCP CLI, a forked/adjusted version specifically for Craft documents.'
read_when:
  - 'Onboarding to this repository or explaining Craft MCP CLI to others'
---

# Craft MCP CLI Overview

Craft MCP CLI is a forked/adjusted version of the general MCP CLI, specifically tailored for Craft documents via the Model Context Protocol (MCP). It provides a focused CLI and SDK for working with Craft documents.

## Key Features

- **Craft-focused** – Designed specifically for Craft document connections (doc and daily-notes types)
- **Simple connection management** – Add, list, and switch between multiple Craft connections
- **Direct tool calls** – Call Craft MCP tools directly from the command line
- **TypeScript SDK** – Build automations with `craftCallOnce()` and `createCraftClient()`
- **Zero config conflicts** – Uses `~/.craft/config.json`, isolated from other MCP tools
- **Auto-discovery** – Automatically detects connection type (doc vs daily-notes)

## Primary Commands

- `craft list [connection]`  
  Lists all configured Craft connections with their status and available tools.
- `craft <connection> <tool> [args...]` or `craft <tool> [args...]`  
  Invokes a Craft MCP tool with arguments using `key:value` or `key=value` syntax.
- `craft add <name> <url> [--description <desc>]`  
  Adds a new Craft connection to the config.
- `craft remove <name>`  
  Removes a Craft connection.
- `craft use <name>`  
  Sets the default connection.
- `craft tools [connection]`  
  Lists available tools for a connection.
- `craft auth <name|url>`  
  Completes OAuth authentication for a Craft connection.

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

## Debug + Support Docs

- **Configuration** (`docs/config.md`) – explains the Craft-specific config structure.
- **Tool Calling** (`docs/tool-calling.md`) – shows argument syntax and usage patterns.
- **OAuth Implementation** (`docs/oauth-implementation.md`) – details on OAuth flows for Craft connections.

Read these docs (via `pnpm run docs:list`) whenever your task touches the corresponding area.
