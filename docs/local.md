---
summary: 'How to run craft directly from the repo (tsx, tsx --watch, built artifacts) without npx.'
read_when:
  - 'Setting up a local development loop for this repo'
---

# Running craft Locally

You don't need `npx` every time—here are the three local entry points we use while developing craft itself.

## 1. Direct TypeScript entry (no build step)

All commands can be executed with `tsx` straight from `src/cli.ts`:

```bash
# list servers (text)
pnpm exec tsx src/cli.ts list

# list servers as JSON
pnpm exec tsx src/cli.ts list --json

# call a tool (auto formatted)
pnpm exec tsx src/cli.ts <connection> <tool> key=value

# call a tool but emit structured JSON on success/failure
pnpm exec tsx src/cli.ts <connection> <tool> key=value --output json

# auth flow
pnpm exec tsx src/cli.ts auth <connection>
```

These invocations match the `pnpm craft` script and are ideal when you're iterating on TypeScript without rebuilding.

## 2. Compiled CLI from `dist/`

When you want the same behaviour the published package ships with:

```bash
pnpm build          # emits dist/...
node dist/cli.js list
node dist/cli.js <connection> <tool>
```

Set flags exactly as you would in production:

```bash
MCPORTER_DEBUG_HANG=1 node dist/cli.js list
MCPORTER_NO_FORCE_EXIT=1 node dist/cli.js <connection> <tool> key=value
```

## 3. Workspace executables

After `pnpm add craft-mcp-cli` in your project (or inside this repo), the binary is available:

```bash
pnpm craft list
pnpm craft <connection> <tool> key=value
```

## Debug flags recap

- `MCPORTER_DEBUG_HANG=1` – dumps active handles around shutdown (pairs well with tmux; see `docs/hang-debug.md`).
- `MCPORTER_NO_FORCE_EXIT=1` – keeps the process alive even after cleanup (useful while inspecting debug output).
- `MCPORTER_FORCE_EXIT=1` – force termination even if the above is set.
- `MCPORTER_STDIO_LOGS=1` – print the buffered stderr output from stdio MCP servers (handy when debugging noisy backends).

All three entry points honour the same `--config`, `--root`, and `--log-level` flags as the published CLI.
