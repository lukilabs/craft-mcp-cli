---
summary: 'Quick reference for craft subcommands, their arguments, and shared global flags.'
read_when:
  - 'Need a refresher on available CLI commands'
---

# Craft MCP CLI Reference

A quick reference for the primary `craft` subcommands. This CLI is a forked/adjusted version specifically for Craft documents via the Model Context Protocol.

## `craft list [connection]`
- Without arguments, lists every configured Craft connection (with live discovery + brief
  status).
- With a connection name, prints TypeScript-style signatures for each tool, doc
  comments, and optional summaries.
- Flags:
  - `--all-parameters` – include every optional parameter in the signature.
  - `--schema` – pretty-print the JSON schema for each tool.
  - `--timeout <ms>` – per-connection timeout when enumerating all connections.

## `craft <connection> <tool> [args...]` or `craft <tool> [args...]`
- Invokes a Craft MCP tool and prints the response; supports positional arguments via
  `key:value` or `key=value` syntax.
- Useful flags:
  - `--json` – output raw JSON response.
  - `--timeout <ms>` – override call timeout.
  - `--log-level <level>` – set logging verbosity.

## `craft add <name> <url> [--description <desc>]`
- Adds a new Craft connection to `~/.craft/config.json`.
- Automatically detects connection type (doc vs daily-notes).

## `craft remove <name>`
- Removes a Craft connection from the config.

## `craft use <name>`
- Sets the default Craft connection.

## `craft tools [connection]`
- Lists available tools for the default or specified Craft connection.

## `craft auth <name|url>`
- Completes OAuth authentication for a Craft connection.

For more detail (behavioral nuances, OAuth flows, etc.), see `docs/spec.md` and
command-specific docs under `docs/`.
