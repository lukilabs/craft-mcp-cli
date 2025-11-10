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

export { createCallResult, wrapCallResult } from './result-utils.js';
export { callOnce, createRuntime } from './runtime.js';
export { createServerProxy } from './server-proxy.js';

// ============================================================================
// Types
// ============================================================================

export type {
  CraftConfig,
  CraftConnection,
  CraftConnectionType,
} from './craft-config.js';

export type { CallResult } from './result-utils.js';
export type { CallOptions, Runtime, RuntimeOptions } from './runtime.js';
