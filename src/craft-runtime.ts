/**
 * Craft MCP SDK Runtime
 *
 * Provides programmatic API for calling Craft MCP tools using connection names
 */

import os from 'node:os';
import path from 'node:path';
import type { ServerDefinition } from './config.js';
import { getConnection, getDefaultConnection, resolveConnection } from './craft-config.js';
import { validateCraftUrl } from './craft-validation.js';
import { createRuntime, type Runtime, type RuntimeOptions } from './runtime.js';

/**
 * Create a Craft-only runtime that bypasses craft config loading
 *
 * This ensures only Craft connections from ~/.craft/config.json are loaded,
 * preventing conflicts with editor MCP imports.
 *
 * @param connectionName - Optional connection name (uses default if not provided)
 * @param options - Optional runtime options (logger, oauth timeout, etc.)
 * @returns Runtime configured with only the specified Craft connection
 *
 * @example
 * ```typescript
 * // Create runtime for default connection
 * const runtime = await createCraftRuntime();
 *
 * // Create runtime for specific connection
 * const runtime = await createCraftRuntime('work-docs');
 *
 * // Use the runtime
 * const tools = await runtime.listTools('work-docs');
 * await runtime.close();
 * ```
 */
export async function createCraftRuntime(
  connectionName?: string,
  options: Omit<RuntimeOptions, 'servers'> = {}
): Promise<Runtime> {
  // Resolve connection name to actual connection
  const conn = connectionName ? await getConnection(connectionName) : await getDefaultConnection();

  if (!conn) {
    throw new Error(
      connectionName ? `Connection '${connectionName}' not found` : 'No default connection set. Use: craft use <name>'
    );
  }

  validateCraftUrl(conn.url);

  // Create server definition for the Craft connection
  // All Craft URLs require OAuth, so pre-configure it
  const serverDef: ServerDefinition = {
    name: conn.name,
    command: {
      kind: 'http' as const,
      url: new URL(conn.url),
    },
    description: conn.description,
    auth: 'oauth',
    tokenCacheDir: path.join(os.homedir(), '.craft', conn.name),
  };

  // Create runtime with ONLY this server (bypasses config loading)
  return createRuntime({
    ...options,
    servers: [serverDef],
  });
}

/**
 * Call a Craft MCP tool once and close the connection
 *
 * @example
 * ```typescript
 * const result = await craftCallOnce({
 *   connection: 'work-docs',
 *   tool: 'collections_list'
 * });
 * ```
 */
export async function craftCallOnce(params: {
  connection: string;
  tool: string;
  args?: Record<string, unknown>;
}): Promise<unknown> {
  const conn = await resolveConnection(params.connection);
  validateCraftUrl(conn.url);

  // Create ephemeral server definition
  // All Craft URLs require OAuth, so pre-configure it
  const serverDef: ServerDefinition = {
    name: conn.name,
    command: {
      kind: 'http' as const,
      url: new URL(conn.url),
    },
    description: conn.description,
    auth: 'oauth',
    tokenCacheDir: path.join(os.homedir(), '.craft', conn.name),
  };

  const runtime = await createRuntime({
    servers: [serverDef],
  });

  try {
    return await runtime.callTool(serverDef.name, params.tool, {
      args: params.args,
    });
  } finally {
    await runtime.close(serverDef.name);
  }
}

/**
 * Create a persistent Craft MCP client for a connection
 *
 * @example
 * ```typescript
 * const client = await createCraftClient('work-docs');
 *
 * const tools = await client.listTools();
 * const result = await client.callTool('collections_list');
 *
 * await client.close();
 * ```
 */
export async function createCraftClient(connectionName: string) {
  const conn = await resolveConnection(connectionName);
  validateCraftUrl(conn.url);

  // Create server definition
  // All Craft URLs require OAuth, so pre-configure it
  const serverDef: ServerDefinition = {
    name: conn.name,
    command: {
      kind: 'http' as const,
      url: new URL(conn.url),
    },
    description: conn.description,
    auth: 'oauth',
    tokenCacheDir: path.join(os.homedir(), '.craft', conn.name),
  };

  const runtime = await createRuntime({
    servers: [serverDef],
  });

  return {
    /**
     * Call a tool on this connection
     */
    callTool: (tool: string, args?: Record<string, unknown>) => runtime.callTool(conn.name, tool, { args }),

    /**
     * List available tools on this connection
     */
    listTools: () => runtime.listTools(conn.name),

    /**
     * Close the connection
     */
    close: async () => {
      await runtime.close(conn.name);
    },

    /**
     * Get the underlying runtime (advanced usage)
     */
    getRuntime: (): Runtime => runtime,

    /**
     * Get connection metadata
     */
    getConnection: () => conn,
  };
}
