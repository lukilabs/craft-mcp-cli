# Debugging Hanging mcporter Calls

When `mcporter call` prints a tool response but the process never exits, it
usually means Node still has active handles it is waiting on. The most common
culprit is a child MCP server process that keeps the stdio transport alive.

## Quick Checklist

1. **Run under tmux** – launch the command inside tmux so you can inspect the
   pane even after Cursor or another agent times out.
2. **Enable hang diagnostics** – set `MCPORTER_DEBUG_HANG=1` when invoking the
   CLI. mcporter will dump the active handles/requests after the tool finishes
   and around the `runtime.close()` call.
3. **Inspect the handle list** – look for `ChildProcess (pid=…)` entries. If a
   child remains, mcporter will now unref and force-kill it, but the debug list
   tells you exactly what was keeping the event loop alive.
4. **Capture the pane output** – run `tmux capture-pane -p -t <session> -S
   -200` to save the diagnostic log for later review.
5. **Retry with `--timeout`** – if the tool itself hangs, use
   `--timeout <ms>` or `MCPORTER_CALL_TIMEOUT` to fail fast while still
   gathering diagnostics.

## Example Session

```bash
tmux new-session -d -s mcphang \
  'cd /path/to/project && \
   MCPORTER_DEBUG_HANG=1 \
   CHROME_DEVTOOLS_MCP_BROWSER_URL=http://127.0.0.1:9222 \
   pnpm --dir "$HOME/projects/mcporter" exec tsx \
   "$HOME/projects/mcporter/src/cli.ts" call \
   --config "$PWD/config/mcporter.json" \
   --root "$PWD" \
   chrome-devtools --tool list_pages'

sleep 5
tmux capture-pane -p -t mcphang -S -200
```

Sample diagnostic output (abridged):

```
[mcporter] [debug] after call (object result): 6 active handle(s), 0 request(s)
[mcporter] [debug] handle => ChildProcess (pid=78480)
[mcporter] [debug] beginning runtime.close()
[mcporter] [debug] after runtime.close: 6 active handle(s), 0 request(s)
[mcporter] [debug] forcibly killed child pid=78480 (runtime.finally)
```

This confirms the CLI response completed and that the lingering handle was a
child process, which mcporter will now terminate during shutdown.

## Notes

- The diagnostics only appear when `MCPORTER_DEBUG_HANG=1` is set.
- Killing residual children is best-effort; if you see repeated `kill-failed`
  messages, manually terminate the PID listed in the log.
- Always keep tmux sessions tidy after debugging: `tmux kill-session -t
  <session>`.
