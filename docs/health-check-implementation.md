# Connection Health Checks Implementation Plan

## Overview
Add a `craft health` command to check the status of all Craft connections, reporting connectivity, authentication status, and response times.

## Command Structure
```bash
craft health [connection] [--json] [--timeout <ms>]
```

- No args: Check all connections
- `[connection]`: Check specific connection
- `--json`: Output JSON format
- `--timeout`: Override default timeout (default: 5000ms)

## Implementation

### 1. Add health command to CLI
- Add `health` case in `src/cli.ts` (after `tools` command)
- Route to `src/cli/health-command.ts`

### 2. Health check logic
- Load connections from `craft-config.ts`
- For each connection:
  1. Create ephemeral runtime with connection URL
  2. Call `runtime.listTools(serverName, { autoAuthorize: false })`
  3. Measure response time
  4. Catch errors and classify with `analyzeConnectionError()`
  5. Categorize status: `healthy`, `auth-required`, `offline`, `http-error`, `error`

### 3. Status categories
Reuse existing `ConnectionIssue` types from `error-classifier.ts`:
- `healthy`: Successfully listed tools
- `auth-required`: `issue.kind === 'auth'`
- `offline`: `issue.kind === 'offline'`
- `http-error`: `issue.kind === 'http'`
- `error`: Other errors

### 4. Output format

#### Text format (default)
```
Checking 3 connections...

✓ work (doc)          healthy    45ms
⚠ personal (doc)      auth required   120ms
✗ old-connection      offline    5000ms (timeout)

Summary: 1 healthy, 1 auth required, 1 offline
```

#### JSON format (`--json`)
```json
{
  "connections": [
    {
      "name": "work",
      "type": "doc",
      "status": "healthy",
      "durationMs": 45,
      "toolCount": 12
    },
    {
      "name": "personal",
      "type": "doc",
      "status": "auth-required",
      "durationMs": 120,
      "issue": {
        "kind": "auth",
        "rawMessage": "..."
      },
      "authCommand": "craft auth personal"
    },
    {
      "name": "old-connection",
      "status": "offline",
      "durationMs": 5000,
      "issue": {
        "kind": "offline",
        "rawMessage": "Connection refused"
      }
    }
  ],
  "summary": {
    "total": 3,
    "healthy": 1,
    "authRequired": 1,
    "offline": 1,
    "errors": 0
  }
}
```

### 5. Integration with existing code
- Reuse `createCraftRuntime()` for connection testing
- Use `analyzeConnectionError()` from `error-classifier.ts`
- Use `withTimeout()` from `timeouts.ts` for timeout handling
- Use `buildAuthCommandHint()` from `list-output.ts` for auth hints

### 6. Exit codes
- `0`: All connections healthy (or no connections)
- `1`: At least one connection has issues

## Example Usage
```bash
# Check all connections
craft health

# Check specific connection
craft health work

# JSON output
craft health --json

# Custom timeout
craft health --timeout 10000
```

## Future Enhancements
- `--fix`: Automatically attempt to fix auth issues (run `craft auth` for connections that need it)
- `--watch`: Continuously monitor connections
- Cache results with TTL
- Health check endpoint for monitoring tools

