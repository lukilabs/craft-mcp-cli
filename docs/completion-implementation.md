# Shell Completions Implementation

## Overview
Shell completion support for bash, zsh, and fish shells with auto-detection and auto-installation.

## Command Structure
```bash
craft completions  # Auto-detect shell and install completions
craft _completion connections  # Internal helper for dynamic connection name completions
```

## Implementation

### 1. Add completions command to CLI
- Add `completions` case in `src/cli.ts`
- Route to `src/cli/completion-command.ts`

### 2. Static completions (commands, flags)
- Commands: `add`, `remove`, `use`, `connections`, `tools`, `list`, `call`, `auth`, `generate-cli`, `inspect-cli`, `emit-ts`, `config`, `completions`
- Global flags: `--config`, `--root`, `--log-level`, `--oauth-timeout`
- Command-specific flags: `--json`, `--schema`, `--all-parameters`, `--timeout`, etc.

### 3. Dynamic completions (connections, tools)
- Use internal `_completion` command that outputs JSON
- Connections: Read from `~/.craft/config.json` via `loadCraftConfig()`
- Tools: Call `runtime.listTools()` for a connection (requires connection name context)

### 4. Shell-specific generators
- **Bash**: Use `complete -W` for static, `COMPREPLY` for dynamic
- **Zsh**: Use `_arguments` and `compadd` with `_describe`
- **Fish**: Use `complete -c craft` with `-a` for static, `-f` for dynamic

### 5. Auto-installation
- Detects shell from `$SHELL` environment variable or shell-specific env vars (`$ZSH_VERSION`, `$BASH_VERSION`, `$FISH_VERSION`)
- Installs to appropriate location:
  - **zsh**: `~/.zsh/functions/_craft` (function-based, more modern)
  - **bash**: `~/.bash_completion.d/craft`
  - **fish**: `~/.config/fish/completions/craft.fish`
- Provides instructions for reloading shell after installation

## Example Usage
```bash
# Auto-detect and install completions
craft completions

# Output:
# ✓ Installed zsh completion to ~/.zsh/functions/_craft
# 
# Restart your shell or run:
#   source ~/.zshrc
```

## Dynamic Completion Examples
```bash
# Completing connection names
craft use <TAB>  # Shows: work, personal, etc.

# Completing tool names (requires connection context)
craft work <TAB>  # Shows: collections_list, blocks_get, etc.

# Completing flags
craft list --<TAB>  # Shows: --json, --schema, --timeout, etc.
```

