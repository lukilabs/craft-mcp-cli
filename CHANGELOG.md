# Changelog

All notable changes to Craft MCP CLI will be documented in this file.

## [Unreleased]

_No changes yet._

## [1.0.2] - 2025-11-10

### Fixed

- **Shell completion performance**: Implemented per-connection caching to eliminate 5+ second delays
  - Cache directory at `/tmp/craft-completion-cache-$USER/` with separate files per connection
  - Tool completions now instant after first use
  - Cache automatically invalidated when connections are added/removed

- **Argument input handling**: Fixed completion blocking argument entry
  - Tool completion only shows at position 2 after connection name
  - After selecting a tool, completion stops to allow argument typing
  - Example: `craft space blocks_add <tab>` now allows argument input instead of showing tools again

- **Tool name display**: Removed erroneous `:tool` suffix
  - Tools now display cleanly: `blocks_add`, `collections_list` instead of `blocks_addool`, `collections_listool`

### Changed

- Shell completion cache structure changed from single file to directory with per-connection files
- Completion priming now caches both default and connection-specific tool lists

## [1.0.1] - 2025-11-10

### Fixed
- Fixed `emit-ts` and `generate-cli` commands to use Craft connections from `~/.craft/config.json` instead of looking for `./config/craft.json` in the current directory
- All commands now consistently use Craft-specific connection management, preventing conflicts with editor MCP server imports

## [1.0.0] - 2025-11-10

Initial release of Craft MCP CLI - a command-line interface and SDK for Craft documents via Model Context Protocol.

> **Note:** This project is a fork of [mcporter](https://github.com/modelcontextprotocol/mcporter), specifically tailored for Craft's Document and Daily Notes MCP Servers.

### Added

#### Connection Management
- `craft add <name> <url>` - Add Craft MCP connections with auto-discovery of connection type (doc vs daily-notes)
- `craft remove <name>` - Remove connections
- `craft use <name>` - Set default connection
- `craft connections` / `craft list` - List all configured connections
- Configuration stored in `~/.craft/config.json`, isolated from other MCP tools

#### CLI Commands
- `craft tools [connection]` - List available tools for a connection
- `craft <toolName> [args...]` - Call tools on default connection
- `craft <connection> <toolName> [args...]` - Call tools on specific connections
- Tool argument syntax: `key:value` or `key=value`
- JSON input modes: inline, from file (`@file.json`), from stdin (`-`), or interactive editor (`--edit`)

#### TypeScript SDK
- `craftCallOnce()` - One-shot tool calls with automatic connection handling
- `createCraftClient()` - Persistent client for multiple operations
- Connection management API: `addConnection()`, `getConnection()`, `listConnections()`, `setDefaultConnection()`, `getDefaultConnection()`
- Full TypeScript type definitions: `CraftConnection`, `CraftConnectionType`, `CraftConfig`

#### Advanced Features
- OAuth authentication support: `craft auth <connection>`
- Code generation: `craft emit-ts` - Generate TypeScript types and clients from connections
- CLI generation: `craft generate-cli` - Create standalone CLI tools
- Debug logging with `--log-level` flag

#### Developer Experience
- Isolated runtime with `createCraftRuntime()` - bypasses generic MCP config loading
- Editor integration with `--edit` flag - opens $EDITOR/$VISUAL with schema-based templates
- GUI editor support with automatic `--wait` flag for VS Code, Sublime, Atom, TextMate
- Shell completion support
