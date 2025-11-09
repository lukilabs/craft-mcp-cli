import type { ServerDefinition } from '../config.js';
import { loadCraftConfig } from '../craft-config.js';
import { looksLikeHttpUrl, splitHttpToolSelector } from './http-utils.js';
import { chooseClosestIdentifier, renderIdentifierResolutionMessages } from './identifier-helpers.js';
import { dimText, yellowText } from './terminal.js';

type CommandResult =
  | { kind: 'command'; command: string; args: string[]; defaultConnection?: string }
  | { kind: 'abort'; exitCode: number };

const CALL_TOKEN_PATTERN = /[.(]/;

export async function inferCommandRouting(
  token: string,
  args: string[],
  definitions: readonly ServerDefinition[]
): Promise<CommandResult> {
  if (!token) {
    return { kind: 'command', command: token, args };
  }

  // Check for Craft connection routing first
  try {
    const craftConfig = await loadCraftConfig();
    const connectionMatch = craftConfig.connections.find((c) => c.name === token);

    if (connectionMatch) {
      // Connection name found: craft <connection> <command/tool>
      const nextToken = args[0];
      if (!nextToken) {
        // No command after connection name, list tools by default
        return { kind: 'command', command: 'list', args: [], defaultConnection: token };
      }

      const remainingArgs = args.slice(1);

      // Check if it's an explicit command (list, tools, call, auth, etc.)
      if (isExplicitCommand(nextToken)) {
        return { kind: 'command', command: nextToken, args: remainingArgs, defaultConnection: token };
      }

      // Otherwise, treat it as a tool call: craft <connection> <toolName> <args...>
      return { kind: 'command', command: 'call', args: [nextToken, ...remainingArgs], defaultConnection: token };
    }
  } catch (error) {
    // If Craft config fails to load, continue with normal routing
  }

  if (isExplicitCommand(token)) {
    return { kind: 'command', command: token, args };
  }

  if (isHttpToolToken(token)) {
    return { kind: 'command', command: 'call', args: [token, ...args] };
  }

  if (isUrlToken(token)) {
    return { kind: 'command', command: 'list', args: [token, ...args] };
  }

  if (isCallLikeToken(token)) {
    return { kind: 'command', command: 'call', args: [token, ...args] };
  }

  if (definitions.length === 0) {
    // No mcporter definitions - check if there's a default Craft connection
    try {
      const craftConfig = await loadCraftConfig();
      if (craftConfig.defaultConnection) {
        // craft <toolName> -> call tool on default connection
        return { kind: 'command', command: 'call', args: [token, ...args], defaultConnection: craftConfig.defaultConnection };
      }
    } catch (error) {
      // Ignore and continue with normal error handling
    }

    return { kind: 'command', command: token, args };
  }

  const serverNames = definitions.map((entry) => entry.name);
  if (serverNames.includes(token)) {
    return { kind: 'command', command: 'list', args: [token, ...args] };
  }

  const resolution = chooseClosestIdentifier(token, serverNames);
  if (!resolution) {
    // Before giving up, check if there's a default Craft connection
    // If so, treat this as a tool call on the default connection
    try {
      const craftConfig = await loadCraftConfig();
      if (craftConfig.defaultConnection) {
        // craft <toolName> -> call tool on default connection
        return { kind: 'command', command: 'call', args: [token, ...args], defaultConnection: craftConfig.defaultConnection };
      }
    } catch (error) {
      // Ignore and continue with normal error handling
    }

    return { kind: 'command', command: token, args };
  }

  const messages = renderIdentifierResolutionMessages({
    entity: 'server',
    attempted: token,
    resolution,
  });

  if (resolution.kind === 'auto' && messages.auto) {
    console.log(dimText(messages.auto));
    return { kind: 'command', command: 'list', args: [resolution.value, ...args] };
  }

  if (messages.suggest) {
    console.error(yellowText(messages.suggest));
  }
  console.error(`Unknown MCP server '${token}'.`);
  return { kind: 'abort', exitCode: 1 };
}

function isCallLikeToken(token: string): boolean {
  if (!token) {
    return false;
  }
  if (looksLikeHttpUrl(token)) {
    return false;
  }
  return CALL_TOKEN_PATTERN.test(token);
}

function isExplicitCommand(token: string): boolean {
  return token === 'list' || token === 'call' || token === 'auth' || token === 'tools';
}

function isUrlToken(token: string): boolean {
  return looksLikeHttpUrl(token);
}

function isHttpToolToken(token: string): boolean {
  if (!token) {
    return false;
  }
  return splitHttpToolSelector(token) !== null;
}
