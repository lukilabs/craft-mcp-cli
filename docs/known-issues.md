---
summary: 'Living list of craft limitations, hosted MCP quirks, and upstream gaps.'
read_when:
  - 'Triaging a bug that might already be documented'
---

# Known Issues

This file tracks limitations that users regularly run into. Most of these require upstream cooperation or larger refactors—feel free to reference this when triaging bugs.

## Hosted OAuth servers with custom scopes
Some hosted MCP servers reject the standard `mcp:tools` scope and only accept provider-specific scopes. Because they do not expose OAuth discovery metadata or scope negotiation, craft cannot auto-register or complete the flow. Examples:
- Supabase's hosted MCP server only accepts Supabase-specific scopes (`projects:read`, `database:write`, ...). Workarounds:
  - Use Supabase's supported clients (Cursor, Windsurf).
  - Self-host their MCP server and configure PAT headers / custom OAuth.
  - Ask Supabase to accept the MCP scope or publish their scope list.
- GitHub's MCP endpoint (`https://api.githubcopilot.com/mcp/`) returns "does not support dynamic client registration" when craft attempts to connect. Copilot's backend expects pre-registered client credentials. Until GitHub publishes a dynamic-registration API (or client secrets), craft cannot interact with their hosted server.

## Output schemas missing/buggy on many servers
- The MCP spec allows servers to omit `outputSchema`. In practice, many hosted MCPs return empty or inconsistent schemas, so features that rely on return types (TypeScript signatures, generated CLIs, `createServerProxy` return helpers) may degrade to `unknown`.
- Workarounds: inspect the server's README / manual docs for output details, or wrap the tool via `createServerProxy` and handle the raw envelope manually.
- Potential improvement: allow user-provided schema overrides (e.g., `craft config patch`, CLI flag to load schema JSON) so we can fill gaps on a per-tool basis.
