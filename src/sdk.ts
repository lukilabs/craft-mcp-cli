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
  removeConnection,
  listConnections,
  getConnection,
  useConnection as setDefaultConnection,
  getDefaultConnection,
  resolveConnection,
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
// Types
// ============================================================================

export type {
  CraftConnection,
  CraftConnectionType,
  CraftConfig,
} from './craft-config.js';
