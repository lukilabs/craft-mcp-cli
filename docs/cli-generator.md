---
summary: 'Goals and requirements for Craft MCP CLI generator (if implemented), including outputs, runtimes, and schema-aware UX.'
read_when:
  - 'Changing generate-cli behavior or bundler integrations'
---

# CLI Generator Plan

> Note: This document describes a potential feature for generating standalone CLIs from Craft connections. This is a forked/adjusted version of the general MCP CLI, specifically tailored for Craft documents.

Default behavior: generating `<connection>.ts` in the working directory if no output path is provided. Bundling is opt-in via `--bundle` and produces a single JS file with shebang; otherwise we emit TypeScript targeting Node.js. Rolldown handles bundling by default unless the runtime resolves to Bun—in that case Bun's native bundler is selected automatically (still requires `--runtime bun` or Bun auto-detection); `--bundler` lets you override either choice.

## Goal
Create a `craft generate-cli` command (if implemented) that produces a standalone CLI for a single Craft connection. The generated CLI should feel like a Unix tool: subcommands map to Craft MCP tools, arguments translate to schema fields, and output can be piped/redirected easily.

## High-Level Requirements
- **Input**: Identify the target server either by shorthand name or by providing an explicit MCP server definition.
- **Output**: Emit a TypeScript file (ESM) targeting Node.js by default (`<server>.ts` unless `--output` overrides). Bundling to a standalone JS file happens only when `--bundle` is passed.
- **Runtime Selection**: Prefer Bun when it is available (`bun --version` succeeds); otherwise fall back to Node.js. Callers can force either runtime via `--runtime bun|node`.
- **Schema-Aware CLI**: Leverage `createServerProxy` to map positional/flag arguments to MCP tool schemas, including defaults and required validation.
- **Unix-Friendly Output**: Provide `--output text|json|markdown|raw` flags so results can be piped; default to human-readable text. Include `--timeout` (default 30s) to cap call duration.
- **Shell Completion (optional)**: Generate completion scripts for bash/zsh/fish if requested.
- **Documentation**: Update README (or similar) to show how to generate and use the CLI.

## Steps
1. **Command Scaffolding**
   - Add `generate-cli` subcommand to the existing CLI (if implemented).
   - Parse flags: `--connection`, `--name`, `--url`, optional `--description`, plus `--output`, `--runtime=node|bun`, `--bundle`, `--bundler=rolldown|bun`, `--minify`, `--compile`, etc. Runtime auto-detects Bun when available, and the bundler inherits that choice unless overridden.
2. **Connection Resolution**
   - If `--connection` matches a configured Craft connection name (from `~/.craft/config.json`), use that connection.
   - Otherwise, if a Craft MCP URL is provided, use it directly.
   - Validate that a connection is found; prompt on failure.
3. **Tool Introspection**
   - Use `listTools(server, { includeSchema: true })` to inspect MCP tool schemas.
   - For each tool, extract required/optional arguments, types, and defaults.
4. **Template Generation**
   - Build a template (probably EJS or string interpolation) that:
     - Imports `createRuntime` and `createServerProxy`.
     - Creates a CLI (likely using `commander` or a minimal custom parser) with subcommands per tool.
     - Bakes in server metadata (command/url, headers, etc.) or references config path if preferred.
     - Adds output-format handling.
   - Include `package.json` scaffolding if `--bundle` or `--package` is set.
5. **Optional Bundling**
   - If requested, run Rolldown (default when targeting Node) or Bun’s bundler (default when the runtime is Bun, or when `--bundler bun` is passed) to emit a single JS file with shebang (Node or Bun), with optional minification.
   - When targeting Bun, allow `--compile` to delegate to `bun build --compile` and generate a self-contained binary. Bun bundling requires staging the template inside the package tree so dependencies resolve even when invoked from empty directories.
   - Otherwise, leave as TypeScript/ESM and document how to run (`node path/to/cli.js` or `bun path/to/cli.ts`).
6. **Testing**
   - Add generator unit tests (snapshot the emitted CLI for known schemas).
   - Add integration tests that run the generated script against a mock MCP server.
7. **Docs/Examples**
   - Document usage in README.
   - Provide an example generated CLI under `examples/generated/<server>.ts` (if we keep an examples directory).

## Notes
- Generated CLI depends on the latest `commander` for argument parsing.
- Default timeout for tool calls is 30 seconds, overridable via `--timeout`.
- Runtime flag remains (`--runtime bun`) to tailor shebang/usage instructions, but Node.js is the default.
- Generated CLI embeds the resolved server definition and always targets that snapshot (no external `--config` or `--server` overrides at runtime).

## Usage Examples

> Note: These examples are hypothetical and may not be implemented in the Craft fork.

```bash
# Minimal: infer the name from the Craft URL and emit TypeScript (optionally bundle)
craft generate-cli \
  --url https://mcp.craft.do/links/XXX/mcp \
  --minify

# Provide explicit name/description and compile a Bun binary (falls back to Node if Bun missing)
craft generate-cli \
  --name work \
  --url https://mcp.craft.do/links/XXX/mcp \
  --description "Work documents CLI" \
  --runtime bun \
  --compile

chmod +x work
./work
  # show the embedded help + tool list

# Use an existing connection from config
craft generate-cli work --bundle dist/work.js

- `--minify` shrinks the bundled output via the selected bundler (output defaults to `<connection>.js`).
- `--compile [path]` implies bundling and invokes `bun build --compile` to create the native executable (Bun only). When you omit the path, the compiled binary inherits the connection name.
- Use `--connection <name>` to reference an existing Craft connection from `~/.craft/config.json`.
- Omit `--name` to let the CLI infer it from the connection name or URL.
- When targeting an existing connection, you can pass the name as a positional argument:
  `craft generate-cli work --bundle dist/work.js`.
```



## Artifact Metadata & Regeneration

> Note: This section describes potential behavior if the feature is implemented.

- Every generated artifact would embed its metadata (generator version, resolved Craft connection, invocation flags). A hidden `__craft_inspect` subcommand could print the payload without contacting the MCP server, so binaries remain self-describing even after being copied to another machine.
- `craft inspect-cli <artifact>` could shell out to that embedded command and print a human summary (pass `--json` for raw output). The summary would include a ready-to-run `generate-cli` command you can reuse directly.
- `craft generate-cli --from <artifact>` could replay the stored invocation against the latest Craft MCP CLI build. `--connection`, `--runtime`, `--timeout`, `--minify/--no-minify`, `--bundle`, `--compile`, `--output`, and `--dry-run` would let you override specific pieces of the stored metadata when necessary.
- Because the metadata would live inside the artifact, any template, bundle, or compiled binary could be refreshed after a generator upgrade without juggling sidecar files.



## Status

> Note: This feature may not be implemented in the Craft fork, as it's focused on direct Craft document interaction rather than generating standalone CLIs.

If implemented:
- `generate-cli` subcommand would implement schema-aware proxy generation.
- Craft connection resolution from `~/.craft/config.json` would be wired up.
- Bundling via Rolldown by default (or Bun automatically when the runtime is Bun, with `--bundler` available for overrides) plus optional minification and Bun bytecode compilation.
- Integration tests would cover bundling, minification, compiled binaries, and metadata/regeneration flows against Craft MCP servers.

Potential next steps:
1. Add optional shell completion scaffolding if demand arises.
2. Explore templated TypeScript definitions for generated CLIs to improve editor tooling.
