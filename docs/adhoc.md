---
summary: 'How to test Craft MCP URLs before adding them to your config.'
read_when:
  - 'Testing a Craft document URL before adding it as a connection'
---

# Ad-hoc Craft Connections

Craft MCP CLI supports "just try it" workflows where you can test a Craft MCP URL before adding it to your config file. This is useful for verifying a URL works or exploring a document's available tools.

## Entry Points

You can pass a Craft MCP URL directly to commands:

- `craft list <url>` – List tools available from a Craft URL
- `craft <url> <tool> [args...]` – Call a tool on an ad-hoc URL
- `craft auth <url>` – Complete OAuth for a URL before adding it

### Example: Testing a Craft URL

```bash
# Inspect the tools available from a Craft document URL
craft list 'https://mcp.craft.do/links/XXX/mcp'

# Call a tool directly on the URL
craft 'https://mcp.craft.do/links/XXX/mcp' collections_list

# Complete OAuth if needed
craft auth 'https://mcp.craft.do/links/XXX/mcp'
```

After testing, you can add the connection permanently:

```bash
craft add work 'https://mcp.craft.do/links/XXX/mcp'
```

## Connection Type Detection

Craft MCP CLI automatically detects the connection type (doc vs daily-notes) when you provide a URL. This detection happens both for ad-hoc URLs and when adding connections permanently.

## OAuth Authentication

Some Craft connections may require OAuth authentication. You can complete OAuth for an ad-hoc URL:

```bash
craft auth 'https://mcp.craft.do/links/XXX/mcp'
```

OAuth tokens are cached automatically, so subsequent calls to the same URL will reuse the credentials. When you later add the connection with `craft add`, the cached tokens are preserved.

## Persistence

Ad-hoc URLs are ephemeral—they're not saved to your config file. To make a connection permanent:

```bash
craft add <name> <url>
```

This adds the connection to `~/.craft/config.json` and you can then use it by name:

```bash
craft <name> <tool> [args...]
```

## Tips

- Test URLs before adding them to ensure they work correctly.
- Use `craft list <url>` to see what tools are available.
- OAuth tokens are cached per URL, so repeated ad-hoc calls benefit from credential reuse.
- Once added to config, connections can be managed with `craft remove`, `craft use`, etc.
