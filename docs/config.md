# Configuration Guide

## Overview

Craft MCP CLI stores all configuration in `~/.craft/config.json`. This is a forked/adjusted version of the general MCP CLI, specifically tailored for Craft documents via the Model Context Protocol.

## Quick Start

1. Add your first Craft connection:
   ```bash
   craft add work https://mcp.craft.do/links/XXX/mcp
   ```

2. The CLI automatically detects whether it's a document or daily-notes connection.

3. List your connections:
   ```bash
   craft list
   ```

## Configuration File Structure

The configuration file is located at `~/.craft/config.json`:

```json
{
  "connections": [
    {
      "name": "work",
      "url": "https://mcp.craft.do/links/XXX/mcp",
      "type": "doc",
      "description": "Work documents"
    },
    {
      "name": "personal",
      "url": "https://mcp.craft.do/links/YYY/mcp",
      "type": "daily-notes",
      "description": "Personal daily notes"
    }
  ],
  "defaultConnection": "work"
}
```

## Connection Fields

| Field | Type | Description |
| --- | --- | --- |
| `name` | string | Unique identifier for the connection (required) |
| `url` | string | Craft MCP URL from the document's share settings (required) |
| `type` | string | Automatically detected: `"doc"` or `"daily-notes"` |
| `description` | string | Optional free-form description |

## CLI Commands

### `craft add <name> <url> [--description <desc>]`
- Adds a new Craft connection to the config file.
- Automatically detects connection type (doc vs daily-notes).
- Example:
  ```bash
  craft add work https://mcp.craft.do/links/XXX/mcp --description "Work documents"
  ```

### `craft remove <name>`
- Removes a Craft connection from the config.
- Example:
  ```bash
  craft remove work
  ```

### `craft use <name>`
- Sets the default connection for tool calls.
- Example:
  ```bash
  craft use work
  ```

### `craft list`
- Lists all configured connections with their status.
- Shows which connection is the default.

## OAuth Authentication

Some Craft connections may require OAuth authentication:

```bash
craft auth work              # Complete OAuth for a connection
craft auth <url>             # Complete OAuth for an ad-hoc URL
```

OAuth tokens are cached automatically and reused for subsequent calls.

## Configuration Location

- **Default**: `~/.craft/config.json`
- The config directory (`~/.craft/`) is created automatically when you add your first connection.
- OAuth tokens and cached metadata are stored under `~/.craft/<name>/` for each connection.

## Troubleshooting

- If a connection fails, check that the URL is correct and accessible.
- Use `craft list` to see connection status and any errors.
- OAuth issues can be resolved by running `craft auth <name>` again.
- The config file is JSON and must be valid; the CLI will show errors if the format is incorrect.
