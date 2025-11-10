---
summary: 'Tmux-based manual testing recipe for exercising craft against real MCP servers.'
read_when:
  - 'Need to reproduce a bug or verify CLI output by hand'
---

# Manual Testing Harness

When we need to sanity-check CLI flows against real MCP servers (or reproduce bugs by hand), use this repeatable harness. Everything runs under `tmux` so long-running commands can be inspected without blocking the current shell.

## Prerequisites

- `pnpm install` ran recently.
- Credentials exist for any auth-required servers you plan to exercise.
- `tmux` is installed (we rely on it below).

## Discover live servers

Start every session by listing all configured servers so you can pick a healthy target:

```bash
tmux new-session -d -s list-all 'pnpm exec tsx src/cli.ts list --timeout 1000 > /tmp/list-all.log 2>&1; sleep 5'
sleep 2
cat /tmp/list-all.log
```

The summary shows which connections are healthy, require auth, or are offline. Choose one of the "healthy" entries for the manual checks below.

## Test matrix

For each connection under test, run the following commands, adjusting `CONNECTION`, `TOOL`, and arguments as needed. Each command writes to `/tmp` so logs are easy to share.

### List command

```bash
tmux new-session -d -s list-CONNECTION \
  'pnpm exec tsx src/cli.ts list CONNECTION --timeout 2000 > /tmp/list-CONNECTION.log 2>&1; sleep 5'
sleep 2
cat /tmp/list-CONNECTION.log
```

Verify:
- Header shows the right name/transport and the new metadata line (`tools · duration · transport`).
- Timeouts produce the footer block: `Tools: <timed out after ...>` and `Reason: ...`.

### Call command

```bash
tmux new-session -d -s call-CONNECTION \
  'pnpm exec tsx src/cli.ts CONNECTION toolName key=value --timeout 2000 > /tmp/call-CONNECTION.log 2>&1; sleep 5'
sleep 2
cat /tmp/call-CONNECTION.log
```

Checks:
- Successful calls print the payload; failures reuse the shared hinting (`SSE error ...`, auto-correct messages, etc.).
- For HTTP selectors (`https://.../mcp.tool` or `https://.../mcp.tool(args)`), ensure no OAuth prompt appears and the request hits the configured server.

### Auth command

For OAuth connections:

```bash
tmux new-session -d -s auth-CONNECTION \
  'pnpm exec tsx src/cli.ts auth CONNECTION --reset > /tmp/auth-CONNECTION.log 2>&1; sleep 5'
sleep 2
cat /tmp/auth-CONNECTION.log
```

Expectations:
- If a token cache exists, log should mention the cleared directory.
- Failed auths emit the unified message (`Failed to authorize 'CONNECTION': ...`).

## Tips

- To exercise error paths, point at a placeholder endpoint and use `--timeout 1000` (e.g., `https://example.com/mcp.listStuff`).
- Kill tmux sessions before reusing a name: `tmux kill-session -t session-name`.
- To watch live output instead of dumping the log at the end, attach via `tmux attach -t session-name` and detach (`Ctrl+B`, then `D`) when done.
