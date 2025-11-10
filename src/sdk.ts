/**
 * Craft MCP SDK - Public API
 *
 * This module provides the public SDK for interacting with Craft documents via MCP
 *
 * @example
 * ```typescript
 * import {
 *   craftCallOnce,
 *   createCraftClient,
 *   addConnection
 * } from 'craft-mcp-cli';
 *
 * // Add a connection
 * await addConnection('work', 'https://mcp.craft.do/links/XXX/mcp');
 *
 * // Call a tool once
 * const result = await craftCallOnce({
 *   connection: 'work',
 *   tool: 'collections_list'
 * });
 *
 * // Create a persistent client
 * const client = await createCraftClient('work');
 * const tools = await client.listTools();
 * await client.close();
 * ```
 */

// ============================================================================
// Connection Management
// ============================================================================

export {
  addConnection,
  getConnection,
  getDefaultConnection,
  listConnections,
  removeConnection,
  resolveConnection,
  useConnection as setDefaultConnection,
} from './craft-config.js';

// ============================================================================
// Craft-Specific Runtime
// ============================================================================

export { craftCallOnce, createCraftClient } from './craft-runtime.js';

// ============================================================================
// Validation
// ============================================================================

export { validateCraftUrl } from './craft-validation.js';

// ============================================================================
// Generic Runtime (for generate-cli)
// ============================================================================

export { createRuntime, callOnce } from './runtime.js';
export { createServerProxy } from './server-proxy.js';
export { wrapCallResult, createCallResult } from './result-utils.js';

// ============================================================================
// Types
// ============================================================================

export type {
  CraftConfig,
  CraftConnection,
  CraftConnectionType,
} from './craft-config.js';

export type { Runtime, RuntimeOptions, CallOptions } from './runtime.js';
export type { CallResult } from './result-utils.js';
