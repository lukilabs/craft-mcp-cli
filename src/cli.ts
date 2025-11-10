#!/usr/bin/env node
import fsPromises from 'node:fs/promises';

import type { EphemeralServerSpec } from './cli/adhoc-server.js';
import { handleCall as runHandleCall } from './cli/call-command.js';
import { inferCommandRouting } from './cli/command-inference.js';
import { handleCompletions } from './cli/completion-command.js';
import { handleConfigCli } from './cli/config-command.js';
import { handleEmitTs } from './cli/emit-ts-command.js';
import { extractEphemeralServerFlags } from './cli/ephemeral-flags.js';
import { prepareEphemeralServerTarget } from './cli/ephemeral-target.js';
import { CliUsageError } from './cli/errors.js';
import { extractFlags } from './cli/flag-utils.js';
import { handleGenerateCli } from './cli/generate-cli-runner.js';
import { looksLikeHttpUrl } from './cli/http-utils.js';
import { handleInspectCli } from './cli/inspect-cli-command.js';
import { buildConnectionIssueEnvelope } from './cli/json-output.js';
import { handleList, printListHelp } from './cli/list-command.js';
import { getActiveLogger, getActiveLogLevel, logError, logInfo, logWarn, setLogLevel } from './cli/logger-context.js';
import { consumeOutputFormat } from './cli/output-format.js';
import { DEBUG_HANG, dumpActiveHandles, terminateChildProcesses } from './cli/runtime-debug.js';
import { boldText, dimText, extraDimText, supportsAnsiColor } from './cli/terminal.js';
import {
  addConnection,
  getConnection,
  getDefaultConnection,
  listConnections,
  removeConnection,
  useConnection,
} from './craft-config.js';
import { createCraftRuntime } from './craft-runtime.js';
import { analyzeConnectionError } from './error-classifier.js';
import { parseLogLevel } from './logging.js';
import { createRuntime, MCPORTER_VERSION } from './runtime.js';

export { parseCallArguments } from './cli/call-arguments.js';
export { handleCall } from './cli/call-command.js';
export { handleGenerateCli } from './cli/generate-cli-runner.js';
export { handleInspectCli } from './cli/inspect-cli-command.js';
export { extractListFlags, handleList } from './cli/list-command.js';
export { resolveCallTimeout } from './cli/timeouts.js';

export async function runCli(argv: string[]): Promise<void> {
  const args = [...argv];
  if (args.length === 0) {
    printHelp();
    process.exit(1);
    return;
  }

  const globalFlags = extractFlags(args, ['--config', '--root', '--log-level', '--oauth-timeout']);
  if (globalFlags['--log-level']) {
    try {
      const parsedLevel = parseLogLevel(globalFlags['--log-level'], getActiveLogLevel());
      setLogLevel(parsedLevel);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(message, error instanceof Error ? error : undefined);
      process.exit(1);
      return;
    }
  }
  let oauthTimeoutOverride: number | undefined;
  if (globalFlags['--oauth-timeout']) {
    // Shorten/extend the OAuth browser-wait so tests (or impatient humans) are not stuck for a full minute.
    const parsed = Number.parseInt(globalFlags['--oauth-timeout'], 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      logError("Flag '--oauth-timeout' must be a positive integer (milliseconds).");
      process.exit(1);
      return;
    }
    oauthTimeoutOverride = parsed;
  }
  const command = args.shift();

  if (!command) {
    printHelp();
    process.exit(1);
    return;
  }

  if (isHelpToken(command)) {
    printHelp();
    process.exitCode = 0;
    return;
  }

  if (isVersionToken(command)) {
    await printVersion();
    return;
  }

  if (command === 'generate-cli') {
    await handleGenerateCli(args, globalFlags);
    return;
  }

  if (command === 'inspect-cli') {
    await handleInspectCli(args);
    return;
  }

  // Craft connection management commands
  if (command === 'add') {
    if (args.length < 2) {
      console.error('Usage: craft add <name> <url> [--description <desc>]');
      process.exit(1);
      return;
    }

    const name = args[0];
    const url = args[1];
    if (!name || !url) {
      console.error('Usage: craft add <name> <url> [--description <desc>]');
      process.exit(1);
      return;
    }
    const descIndex = args.indexOf('--description');
    const description = descIndex !== -1 && args[descIndex + 1] ? args[descIndex + 1] : undefined;

    try {
      await addConnection(name, url, description);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(message);
      process.exit(1);
    }
    return;
  }

  if (command === 'remove') {
    if (args.length === 0) {
      console.error('Usage: craft remove <name>');
      process.exit(1);
      return;
    }

    const name = args[0];
    if (!name) {
      console.error('Usage: craft remove <name>');
      process.exit(1);
      return;
    }
    try {
      await removeConnection(name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(message);
      process.exit(1);
    }
    return;
  }

  if (command === 'use') {
    if (args.length === 0) {
      console.error('Usage: craft use <name>');
      process.exit(1);
      return;
    }

    const name = args[0];
    if (!name) {
      console.error('Usage: craft use <name>');
      process.exit(1);
      return;
    }
    try {
      await useConnection(name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(message);
      process.exit(1);
    }
    return;
  }

  if (command === 'connections') {
    try {
      await listConnections();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(message);
      process.exit(1);
    }
    return;
  }

  // Handle _completion helper before command inference
  if (command === '_completion') {
    await handleCompletions(args);
    return;
  }

  if (command === 'completions') {
    await handleCompletions(args);
    return;
  }

  if (command === 'tools') {
    const connectionName = args[0];

    // Create Craft-only runtime (bypasses craft config loading)
    const runtime = await createCraftRuntime(connectionName, {
      logger: getActiveLogger(),
      oauthTimeoutMs: oauthTimeoutOverride,
    });

    const { handleList } = await import('./cli/list-command.js');

    // Get the connection name from the runtime
    const conn = connectionName ? await getConnection(connectionName) : await getDefaultConnection();
    if (!conn) {
      console.error('No default connection set. Use: craft use <name>');
      process.exit(1);
      return;
    }

    // Pass the connection URL as the target
    await handleList(runtime, [conn.url, ...args.slice(connectionName ? 1 : 0)], undefined);
    await runtime.close();
    return;
  }

  const runtimeOptions = {
    configPath: globalFlags['--config'],
    rootDir: globalFlags['--root'],
    logger: getActiveLogger(),
    oauthTimeoutMs: oauthTimeoutOverride,
  };

  if (command === 'config') {
    await handleConfigCli(
      {
        loadOptions: { configPath: runtimeOptions.configPath, rootDir: runtimeOptions.rootDir },
        invokeAuth: (authArgs) => invokeAuthCommand(runtimeOptions, authArgs),
      },
      args
    );
    return;
  }

  if (command === 'emit-ts') {
    const runtime = await createRuntime(runtimeOptions);
    try {
      await handleEmitTs(runtime, args);
    } finally {
      await runtime.close().catch(() => {});
    }
    return;
  }

  // Infer command without loading craft config (pass empty definitions)
  // This allows Craft connection routing to work properly
  const inference = await inferCommandRouting(command, args, []);
  if (inference.kind === 'abort') {
    process.exitCode = inference.exitCode;
    return;
  }
  const resolvedCommand = inference.command;
  const resolvedArgs = inference.args;
  const defaultConnection = inference.kind === 'command' ? inference.defaultConnection : undefined;

  // Create Craft-only runtime (bypasses craft config loading)
  const runtime = await createCraftRuntime(defaultConnection, {
    logger: getActiveLogger(),
    oauthTimeoutMs: oauthTimeoutOverride,
  });

  try {
    if (resolvedCommand === 'list') {
      if (consumeHelpTokens(resolvedArgs)) {
        printListHelp();
        process.exitCode = 0;
        return;
      }
      await handleList(runtime, resolvedArgs, defaultConnection);
      return;
    }

    if (resolvedCommand === 'tools') {
      const { handleList } = await import('./cli/list-command.js');
      if (!defaultConnection) {
        const conn = await getDefaultConnection();
        if (!conn) {
          console.error('No default connection set. Use: craft use <name>');
          process.exit(1);
          return;
        }
        await handleList(runtime, [conn.url, ...resolvedArgs], undefined);
      } else {
        const conn = await getConnection(defaultConnection);
        await handleList(runtime, [conn.url, ...resolvedArgs], undefined);
      }
      return;
    }

    if (resolvedCommand === 'call') {
      await runHandleCall(runtime, resolvedArgs, defaultConnection);
      return;
    }

    if (resolvedCommand === 'auth') {
      await handleAuth(runtime, resolvedArgs);
      return;
    }
  } finally {
    const closeStart = Date.now();
    if (DEBUG_HANG) {
      logInfo('[debug] beginning runtime.close()');
      dumpActiveHandles('before runtime.close');
    }
    try {
      await runtime.close();
      if (DEBUG_HANG) {
        const duration = Date.now() - closeStart;
        logInfo(`[debug] runtime.close() completed in ${duration}ms`);
        dumpActiveHandles('after runtime.close');
      }
    } catch (error) {
      if (DEBUG_HANG) {
        logError('[debug] runtime.close() failed', error);
      }
    } finally {
      terminateChildProcesses('runtime.finally');
      // By default we force an exit after cleanup so Node doesn't hang on lingering stdio handles
      // (see typescript-sdk#579/#780/#1049). Opt out by exporting MCPORTER_NO_FORCE_EXIT=1.
      const disableForceExit = process.env.MCPORTER_NO_FORCE_EXIT === '1';
      if (DEBUG_HANG) {
        dumpActiveHandles('after terminateChildProcesses');
        if (!disableForceExit || process.env.MCPORTER_FORCE_EXIT === '1') {
          process.exit(0);
        }
      } else {
        const scheduleExit = () => {
          if (!disableForceExit || process.env.MCPORTER_FORCE_EXIT === '1') {
            process.exit(0);
          }
        };
        setImmediate(scheduleExit);
      }
    }
  }
  printHelp(`Unknown command '${resolvedCommand}'.`);
  process.exit(1);
}

// main parses CLI flags and dispatches to list/call commands.
async function main(): Promise<void> {
  await runCli(process.argv.slice(2));
}

// printHelp explains available commands and global flags.
function printHelp(message?: string): void {
  if (message) {
    console.error(message);
    console.error('');
  }
  const colorize = supportsAnsiColor;
  const sections = buildCommandSections(colorize);
  const globalFlags = formatGlobalFlags(colorize);
  const quickStart = formatQuickStart(colorize);
  const footer = formatHelpFooter(colorize);
  const title = colorize ? `${boldText('craft')} ${dimText('— Craft MCP CLI & SDK')}` : 'craft — Craft MCP CLI & SDK';
  const lines = [
    title,
    '',
    'Usage: craft <command> [options]',
    '',
    ...sections,
    '',
    globalFlags,
    '',
    quickStart,
    '',
    footer,
  ];
  console.error(lines.join('\n'));
}

type HelpEntry = {
  name: string;
  summary: string;
  usage: string;
};

type HelpSection = {
  title: string;
  entries: HelpEntry[];
};

function buildCommandSections(colorize: boolean): string[] {
  const sections: HelpSection[] = [
    {
      title: 'Craft connections',
      entries: [
        {
          name: 'add',
          summary: 'Add a Craft MCP connection',
          usage: 'craft add <name> <url> [--description <desc>]',
        },
        {
          name: 'remove',
          summary: 'Remove a Craft MCP connection',
          usage: 'craft remove <name>',
        },
        {
          name: 'use',
          summary: 'Set default Craft connection',
          usage: 'craft use <name>',
        },
        {
          name: 'connections',
          summary: 'List all Craft connections',
          usage: 'craft connections',
        },
      ],
    },
    {
      title: 'Core commands',
      entries: [
        {
          name: 'list',
          summary: 'List Craft connections',
          usage: 'craft list',
        },
        {
          name: 'tools',
          summary: 'List tools for default or specified connection',
          usage: 'craft tools [connection]',
        },
        {
          name: '<tool>',
          summary: 'Call a tool on default connection',
          usage: 'craft <toolName> [key=value ...]',
        },
        {
          name: '<connection> <tool>',
          summary: 'Call a tool on specific connection',
          usage: 'craft <connection> <toolName> [key=value ...]',
        },
        {
          name: 'auth',
          summary: 'Complete OAuth for a connection',
          usage: 'craft auth <connection | url> [--reset]',
        },
      ],
    },
    {
      title: 'Generator & tooling',
      entries: [
        {
          name: 'generate-cli',
          summary: 'Emit a standalone CLI (supports HTTP, stdio, and inline commands)',
          usage: 'craft generate-cli --server <name> | --command <ref> [options]',
        },
        {
          name: 'inspect-cli',
          summary: 'Show metadata and regen instructions for a generated CLI',
          usage: 'craft inspect-cli <path> [--json]',
        },
        {
          name: 'emit-ts',
          summary: 'Generate TypeScript client/types for a server',
          usage: 'craft emit-ts <server> --mode client|types [options]',
        },
      ],
    },
    {
      title: 'Configuration',
      entries: [
        {
          name: 'config',
          summary: 'Inspect or edit config files (list, get, add, remove, import, login, logout)',
          usage: 'craft config <command> [options]',
        },
        {
          name: 'completions',
          summary: 'Install shell completions (auto-detects shell)',
          usage: 'craft completions',
        },
      ],
    },
  ];
  return sections.flatMap((section) => formatCommandSection(section, colorize));
}

function formatCommandSection(section: HelpSection, colorize: boolean): string[] {
  const maxNameLength = Math.max(...section.entries.map((entry) => entry.name.length));
  const header = colorize ? boldText(section.title) : section.title;
  const lines = [header];
  section.entries.forEach((entry) => {
    const paddedName = entry.name.padEnd(maxNameLength);
    const renderedName = colorize ? boldText(paddedName) : paddedName;
    const summary = colorize ? dimText(entry.summary) : entry.summary;
    lines.push(`  ${renderedName}  ${summary}`);
    lines.push(`    ${extraDimText('usage:')} ${entry.usage}`);
  });
  return [...lines, ''];
}

function formatGlobalFlags(colorize: boolean): string {
  const title = colorize ? boldText('Global flags') : 'Global flags';
  const entries = [
    {
      flag: '--config <path>',
      summary: 'Path to craft.json (defaults to ./config/craft.json)',
    },
    {
      flag: '--root <path>',
      summary: 'Working directory for stdio servers',
    },
    {
      flag: '--log-level <debug|info|warn|error>',
      summary: 'Adjust CLI logging (defaults to warn)',
    },
    {
      flag: '--oauth-timeout <ms>',
      summary: 'Time to wait for browser-based OAuth before giving up (default 60000)',
    },
  ];
  const formatted = entries.map((entry) => `  ${entry.flag.padEnd(34)}${entry.summary}`);
  return [title, ...formatted].join('\n');
}

function formatQuickStart(colorize: boolean): string {
  const title = colorize ? boldText('Quick start') : 'Quick start';
  const entries = [
    ['craft add work https://mcp.craft.do/links/XXX/mcp', 'add a Craft connection'],
    ['craft list', 'show all connections'],
    ['craft tools', 'list tools for default connection'],
    ['craft collections_list', 'call a tool on default connection'],
    ['craft work blocks_get id:123', 'call a tool on specific connection'],
  ];
  const formatted = entries.map(([cmd, note]) => {
    const comment = colorize ? dimText(`# ${note}`) : `# ${note}`;
    return `  ${cmd}\n    ${comment}`;
  });
  return [title, ...formatted].join('\n');
}

function formatHelpFooter(colorize: boolean): string {
  const pointer = 'Run `craft <command> --help` for detailed flags.';
  const autoLoad = 'craft uses Craft connections from ~/.craft/config.json (add with: craft add <name> <url>)';
  if (!colorize) {
    return `${pointer}\n${autoLoad}`;
  }
  return `${dimText(pointer)}\n${extraDimText(autoLoad)}`;
}

async function printVersion(): Promise<void> {
  console.log(await resolveCliVersion());
}

function isHelpToken(token: string): boolean {
  return token === '--help' || token === '-h' || token === 'help';
}

function consumeHelpTokens(args: string[]): boolean {
  let found = false;
  for (let index = args.length - 1; index >= 0; index -= 1) {
    const token = args[index];
    if (token && isHelpToken(token)) {
      args.splice(index, 1);
      found = true;
    }
  }
  return found;
}

function isVersionToken(token: string): boolean {
  return token === '--version' || token === '-v' || token === '-V';
}

async function resolveCliVersion(): Promise<string> {
  try {
    const packageJsonPath = new URL('../package.json', import.meta.url);
    const buffer = await fsPromises.readFile(packageJsonPath, 'utf8');
    const pkg = JSON.parse(buffer) as { version?: string };
    return pkg.version ?? MCPORTER_VERSION;
  } catch {
    return MCPORTER_VERSION;
  }
}

if (process.env.MCPORTER_DISABLE_AUTORUN !== '1') {
  main().catch((error) => {
    if (error instanceof CliUsageError) {
      logError(error.message);
      process.exit(1);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    logError(message, error instanceof Error ? error : undefined);
    process.exit(1);
  });
}
// handleAuth clears cached tokens and executes standalone OAuth flows.
export async function handleAuth(runtime: Awaited<ReturnType<typeof createRuntime>>, args: string[]): Promise<void> {
  // Peel off optional flags before we consume positional args.
  const resetIndex = args.indexOf('--reset');
  const shouldReset = resetIndex !== -1;
  if (shouldReset) {
    args.splice(resetIndex, 1);
  }
  const format = consumeOutputFormat(args, {
    defaultFormat: 'text',
    allowed: ['text', 'json'],
    enableRawShortcut: false,
    jsonShortcutFlag: '--json',
  }) as 'text' | 'json';
  const ephemeralSpec: EphemeralServerSpec | undefined = extractEphemeralServerFlags(args);
  let target = args.shift();
  const nameHints: string[] = [];
  if (ephemeralSpec && target && !looksLikeHttpUrl(target)) {
    nameHints.push(target);
  }

  const prepared = await prepareEphemeralServerTarget({
    runtime,
    target,
    ephemeral: ephemeralSpec,
    nameHints,
    reuseFromSpec: true,
  });
  target = prepared.target;

  if (!target) {
    throw new Error('Usage: craft auth <server | url> [--http-url <url> | --stdio <command>]');
  }

  const definition = runtime.getDefinition(target);
  if (shouldReset) {
    const tokenDir = definition.tokenCacheDir;
    if (tokenDir) {
      // Drop the cached credentials so the next auth run starts cleanly.
      await fsPromises.rm(tokenDir, { recursive: true, force: true });
      logInfo(`Cleared cached credentials for '${target}' at ${tokenDir}`);
    } else {
      logWarn(`Server '${target}' does not expose a token cache path.`);
    }
  }

  // Kick off the interactive OAuth flow without blocking list output. We retry once if the
  // server gets auto-promoted to OAuth mid-flight.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const tools = await runtime.listTools(target, { autoAuthorize: true });
      // Use console.log to ensure the success message is always visible
      console.log(`✓ Authorization complete. ${tools.length} tool${tools.length === 1 ? '' : 's'} available.`);
      return;
    } catch (error) {
      if (attempt === 0 && shouldRetryAuthError(error)) {
        logWarn('Server signaled OAuth after the initial attempt. Retrying with browser flow...');
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (format === 'json') {
        const payload = buildConnectionIssueEnvelope({
          server: target,
          error,
          issue: analyzeConnectionError(error),
        });
        console.log(JSON.stringify(payload, null, 2));
        process.exitCode = 1;
        return;
      }
      throw new Error(`Failed to authorize '${target}': ${message}`);
    }
  }
}

async function invokeAuthCommand(runtimeOptions: Parameters<typeof createRuntime>[0], args: string[]): Promise<void> {
  const runtime = await createRuntime(runtimeOptions);
  try {
    await handleAuth(runtime, args);
  } finally {
    await runtime.close().catch(() => {});
  }
}

function shouldRetryAuthError(error: unknown): boolean {
  return analyzeConnectionError(error).kind === 'auth';
}
