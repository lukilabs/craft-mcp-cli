import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { CallToolRequest, ListResourcesRequest } from '@modelcontextprotocol/sdk/types.js';
import { loadServerDefinitions, type ServerDefinition } from './config.js';
import { resolveEnvValue, withEnvOverrides } from './env.js';
import { createPrefixedConsoleLogger, type Logger, type LogLevel, resolveLogLevelFromEnv } from './logging.js';
import { createOAuthSession, type OAuthSession } from './oauth.js';
import { materializeHeaders } from './runtime-header-utils.js';
import { isUnauthorizedError, maybeEnableOAuth } from './runtime-oauth-support.js';
import { closeTransportAndWait } from './runtime-process-utils.js';
import './sdk-patches.js';
import { VERSION } from './version.js';

const PACKAGE_NAME = 'craft';
const CLIENT_VERSION = VERSION;
const DEFAULT_OAUTH_CODE_TIMEOUT_MS = 60_000;
const OAUTH_CODE_TIMEOUT_MS = parseOAuthTimeout(
  process.env.MCPORTER_OAUTH_TIMEOUT_MS ?? process.env.MCPORTER_OAUTH_TIMEOUT
);
export const MCPORTER_VERSION = CLIENT_VERSION;

// isCraftUrl checks if a URL belongs to a Craft MCP server (craft.do or luki.io domains).
function isCraftUrl(url: URL): boolean {
  return url.hostname.endsWith('.craft.do') || url.hostname.endsWith('.luki.io');
}

function parseOAuthTimeout(raw: string | undefined): number {
  if (!raw) {
    return DEFAULT_OAUTH_CODE_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_OAUTH_CODE_TIMEOUT_MS;
  }
  return parsed;
}

export interface RuntimeOptions {
  readonly configPath?: string;
  readonly servers?: ServerDefinition[];
  readonly rootDir?: string;
  readonly clientInfo?: {
    name: string;
    version: string;
  };
  readonly logger?: RuntimeLogger;
  readonly oauthTimeoutMs?: number;
}

export type RuntimeLogger = Logger;

export interface CallOptions {
  readonly args?: CallToolRequest['params']['arguments'];
}

export interface ListToolsOptions {
  readonly includeSchema?: boolean;
  readonly autoAuthorize?: boolean;
}

interface ConnectOptions {
  readonly maxOAuthAttempts?: number;
  readonly skipCache?: boolean;
}

export interface Runtime {
  listServers(): string[];
  getDefinitions(): ServerDefinition[];
  getDefinition(server: string): ServerDefinition;
  registerDefinition(definition: ServerDefinition, options?: { overwrite?: boolean }): void;
  listTools(server: string, options?: ListToolsOptions): Promise<ServerToolInfo[]>;
  callTool(server: string, toolName: string, options?: CallOptions): Promise<unknown>;
  listResources(server: string, options?: Partial<ListResourcesRequest['params']>): Promise<unknown>;
  connect(server: string): Promise<ClientContext>;
  close(server?: string): Promise<void>;
}

export interface ServerToolInfo {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
  readonly outputSchema?: unknown;
}

interface ClientContext {
  readonly client: Client;
  readonly transport: Transport & { close(): Promise<void> };
  readonly definition: ServerDefinition;
  readonly oauthSession?: OAuthSession;
}

// createRuntime spins up a pooled MCP runtime from config JSON or provided definitions.
export async function createRuntime(options: RuntimeOptions = {}): Promise<Runtime> {
  // Build the runtime with either the provided server list or the config file contents.
  const servers =
    options.servers ??
    (await loadServerDefinitions({
      configPath: options.configPath,
      rootDir: options.rootDir,
    }));

  const runtime = new McpRuntime(servers, options);
  return runtime;
}

// callOnce connects to a server, invokes a single tool, and disposes the connection immediately.
export async function callOnce(params: {
  server: string;
  toolName: string;
  args?: Record<string, unknown>;
  configPath?: string;
}): Promise<unknown> {
  const runtime = await createRuntime({ configPath: params.configPath });
  try {
    return await runtime.callTool(params.server, params.toolName, {
      args: params.args,
    });
  } finally {
    await runtime.close(params.server);
  }
}

class McpRuntime implements Runtime {
  private readonly definitions: Map<string, ServerDefinition>;
  private readonly clients = new Map<string, Promise<ClientContext>>();
  private readonly logger: RuntimeLogger;
  private readonly clientInfo: { name: string; version: string };
  private readonly oauthTimeoutMs?: number;

  constructor(servers: ServerDefinition[], options: RuntimeOptions = {}) {
    this.definitions = new Map(servers.map((entry) => [entry.name, entry]));
    this.logger = options.logger ?? createConsoleLogger();
    this.clientInfo = options.clientInfo ?? {
      name: PACKAGE_NAME,
      version: CLIENT_VERSION,
    };
    this.oauthTimeoutMs = options.oauthTimeoutMs;
  }

  // listServers returns configured names sorted alphabetically for stable CLI output.
  listServers(): string[] {
    return [...this.definitions.keys()].sort((a, b) => a.localeCompare(b));
  }

  // getDefinitions exposes raw server metadata to consumers such as the CLI.
  getDefinitions(): ServerDefinition[] {
    return [...this.definitions.values()];
  }

  // getDefinition throws when the caller requests an unknown server name.
  getDefinition(server: string): ServerDefinition {
    const definition = this.definitions.get(server);
    if (!definition) {
      throw new Error(`Unknown MCP server '${server}'.`);
    }
    return definition;
  }

  registerDefinition(definition: ServerDefinition, options: { overwrite?: boolean } = {}): void {
    if (!options.overwrite && this.definitions.has(definition.name)) {
      throw new Error(`MCP server '${definition.name}' already exists.`);
    }
    this.definitions.set(definition.name, definition);
    this.clients.delete(definition.name);
  }

  // listTools queries tool metadata and optionally includes schemas when requested.
  async listTools(server: string, options: ListToolsOptions = {}): Promise<ServerToolInfo[]> {
    // Toggle auto authorization so list can run without forcing OAuth flows.
    const autoAuthorize = options.autoAuthorize !== false;
    const context = await this.connect(server, {
      maxOAuthAttempts: autoAuthorize ? undefined : 0,
      // Allow using cached connections even when not auto-authorizing
      // This way already-authenticated connections work in batch listings
      skipCache: false,
    });
    const response = await context.client.listTools({ server: {} });
    return (response.tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description ?? undefined,
      inputSchema: options.includeSchema ? tool.inputSchema : undefined,
      outputSchema: options.includeSchema ? tool.outputSchema : undefined,
    }));
  }

  // callTool executes a tool using the args provided by the caller.
  async callTool(server: string, toolName: string, options: CallOptions = {}): Promise<unknown> {
    const { client } = await this.connect(server);
    const params: CallToolRequest['params'] = {
      name: toolName,
      arguments: options.args ?? {},
    };
    return client.callTool(params);
  }

  // listResources delegates to the MCP resources/list method with passthrough params.
  async listResources(server: string, options: Partial<ListResourcesRequest['params']> = {}): Promise<unknown> {
    const { client } = await this.connect(server);
    return client.listResources(options as ListResourcesRequest['params']);
  }

  // connect lazily instantiates a client context per server and memoizes it.
  async connect(server: string, options: ConnectOptions = {}): Promise<ClientContext> {
    // Reuse cached connections unless the caller explicitly opted out.
    const normalized = server.trim();

    // Use cache unless explicitly skipped. Allow maxOAuthAttempts: 0 to use cached auth connections.
    const useCache = options.skipCache !== true;

    if (useCache) {
      const existing = this.clients.get(normalized);
      if (existing) {
        return existing;
      }
    }

    const definition = this.definitions.get(normalized);
    if (!definition) {
      throw new Error(`Unknown MCP server '${normalized}'.`);
    }

    const connection = this.createClient(definition, options);

    if (useCache) {
      this.clients.set(normalized, connection);
      try {
        return await connection;
      } catch (error) {
        this.clients.delete(normalized);
        throw error;
      }
    }

    return connection;
  }

  // close tears down transports (and OAuth sessions) for a single server or all servers.
  async close(server?: string): Promise<void> {
    if (server) {
      const normalized = server.trim();
      const context = await this.clients.get(normalized);
      if (!context) {
        return;
      }
      await context.client.close().catch(() => {});
      await closeTransportAndWait(this.logger, context.transport).catch(() => {});
      await context.oauthSession?.close().catch(() => {});
      this.clients.delete(normalized);
      return;
    }

    for (const [name, promise] of this.clients.entries()) {
      try {
        const context = await promise;
        await context.client.close().catch(() => {});
        await closeTransportAndWait(this.logger, context.transport).catch(() => {});
        await context.oauthSession?.close().catch(() => {});
      } finally {
        this.clients.delete(name);
      }
    }
  }

  // createClient wires up transports, optional OAuth sessions, and connects the MCP client.
  private async createClient(definition: ServerDefinition, options: ConnectOptions = {}): Promise<ClientContext> {
    // Create a fresh MCP client context for the target server.
    const client = new Client(this.clientInfo);
    let activeDefinition = definition;

    return withEnvOverrides(activeDefinition.env, async () => {
      if (activeDefinition.command.kind === 'stdio') {
        const resolvedEnv =
          activeDefinition.env && Object.keys(activeDefinition.env).length > 0
            ? Object.fromEntries(
                Object.entries(activeDefinition.env)
                  .map(([key, raw]) => [key, resolveEnvValue(raw)])
                  .filter(([, value]) => value !== '')
              )
            : undefined;
        const transport = new StdioClientTransport({
          command: activeDefinition.command.command,
          args: activeDefinition.command.args,
          cwd: activeDefinition.command.cwd,
          env: resolvedEnv,
        });
        await client.connect(transport);
        return { client, transport, definition: activeDefinition, oauthSession: undefined };
      }

      // HTTP transports may need to retry once OAuth is auto-enabled.
      // Track OAuth session across retries to avoid port conflicts
      let existingOAuthSession: OAuthSession | undefined;
      while (true) {
        const command = activeDefinition.command;
        if (command.kind !== 'http') {
          throw new Error(`Server '${activeDefinition.name}' is not configured for HTTP transport.`);
        }
        // Reuse OAuth session across retries to avoid port conflicts
        let oauthSession: OAuthSession | undefined = existingOAuthSession;

        // Create OAuth session if we don't have one yet and:
        // 1. auth is explicitly 'oauth', OR
        // 2. It's a Craft URL (always create to use cached tokens if available)
        // We always create sessions for Craft URLs to load cached tokens,
        // but only trigger interactive auth flow when maxOAuthAttempts !== 0.
        if (!oauthSession) {
          const isCraftConnection = isCraftUrl(command.url);
          const shouldEstablishOAuth = activeDefinition.auth === 'oauth' || isCraftConnection;
          if (shouldEstablishOAuth) {
            oauthSession = await createOAuthSession(activeDefinition, this.logger);
            existingOAuthSession = oauthSession; // Save for next retry
          }
        }

        const resolvedHeaders = materializeHeaders(command.headers, activeDefinition.name);

        const requestInit: RequestInit | undefined = resolvedHeaders
          ? { headers: resolvedHeaders as HeadersInit }
          : undefined;

        // Always pass authProvider if we have an OAuth session
        // This allows the SDK to use cached tokens during discovery
        // Interactive auth flow is controlled by maxOAuthAttempts in connectWithAuth
        const baseOptions = {
          requestInit,
          authProvider: oauthSession?.provider,
        };

        const attemptConnect = async () => {
          const streamableTransport = new StreamableHTTPClientTransport(command.url, baseOptions);
          try {
            const finalSession = await this.connectWithAuth(
              client,
              streamableTransport,
              oauthSession,
              activeDefinition.name,
              activeDefinition,
              options.maxOAuthAttempts
            );
            return {
              client,
              transport: streamableTransport,
              definition: activeDefinition,
              oauthSession: finalSession,
            } as ClientContext;
          } catch (error) {
            await closeTransportAndWait(this.logger, streamableTransport).catch(() => {});
            throw error;
          }
        };

        try {
          return await attemptConnect();
        } catch (primaryError) {
          // If OAuth tokens were just refreshed, retry the connection with fresh tokens
          if (primaryError instanceof OAuthTokensRefreshedError) {
            continue;
          }

          if (isUnauthorizedError(primaryError)) {
            const promoted = maybeEnableOAuth(activeDefinition, this.logger);
            if (promoted && options.maxOAuthAttempts !== 0) {
              // Don't close session on promotion - it should be undefined anyway
              activeDefinition = promoted;
              this.definitions.set(promoted.name, promoted);
              continue;
            }
            // Only close session if we're not retrying
            await oauthSession?.close().catch(() => {});
          }
          // For non-auth errors, don't close the session - let it continue or fail naturally
          if (primaryError instanceof OAuthTimeoutError) {
            await oauthSession?.close().catch(() => {});
            throw primaryError;
          }
          // Craft connections only support streamable HTTP, not SSE.
          // Skip SSE fallback for Craft URLs and throw the original error.
          if (isCraftUrl(command.url)) {
            await oauthSession?.close().catch(() => {});
            throw primaryError;
          }
          if (primaryError instanceof Error) {
            this.logger.info(`Falling back to SSE transport for '${activeDefinition.name}': ${primaryError.message}`);
          }
          const sseTransport = new SSEClientTransport(command.url, {
            ...baseOptions,
          });
          try {
            const finalSession = await this.connectWithAuth(
              client,
              sseTransport,
              oauthSession,
              activeDefinition.name,
              activeDefinition,
              options.maxOAuthAttempts
            );
            return { client, transport: sseTransport, definition: activeDefinition, oauthSession: finalSession };
          } catch (sseError) {
            await closeTransportAndWait(this.logger, sseTransport).catch(() => {});
            await oauthSession?.close().catch(() => {});
            if (sseError instanceof OAuthTimeoutError) {
              throw sseError;
            }
            if (isUnauthorizedError(sseError) && options.maxOAuthAttempts !== 0) {
              const promoted = maybeEnableOAuth(activeDefinition, this.logger);
              if (promoted) {
                activeDefinition = promoted;
                this.definitions.set(promoted.name, promoted);
                continue;
              }
            }
            throw sseError;
          }
        }
      }
    });
  }

  // connectWithAuth handles initial connection and OAuth flow if needed.
  private async connectWithAuth(
    client: Client,
    transport: Transport & {
      close(): Promise<void>;
      finishAuth?: (authorizationCode: string) => Promise<void>;
    },
    session: OAuthSession | undefined,
    serverName: string | undefined,
    definition: ServerDefinition,
    maxOAuthAttempts: number | undefined
  ): Promise<OAuthSession | undefined> {
    try {
      // Try to connect - if OAuth is needed and we have cached tokens, they'll be used automatically
      await client.connect(transport);
      return session;
    } catch (error) {
      // If we got an authorization error, we need OAuth
      if (isUnauthorizedError(error) && transport.finishAuth && maxOAuthAttempts !== 0) {
        const name = serverName ? `server '${serverName}'` : 'server';

        // Create OAuth session on-demand if we don't have one yet
        let oauthSession: OAuthSession;
        if (!session) {
          this.logger.info(`Creating OAuth session on-demand for ${name}...`);
          oauthSession = await createOAuthSession(definition, this.logger);
        } else {
          oauthSession = session;
        }

        // The SDK tried to use cached tokens that are now invalid
        // We need to clear them and start a fresh OAuth flow
        if ('invalidateCredentials' in oauthSession.provider) {
          await (
            oauthSession.provider as { invalidateCredentials: (scope: 'all' | 'tokens' | 'client' | 'verifier') => Promise<void> }
          ).invalidateCredentials('all');
        }

        // Close only the transport (not the client - we'll reconnect it)
        await transport.close().catch(() => {});

        // Create a new transport with the OAuth provider (credentials already invalidated)
        const command = definition.command;
        if (command.kind !== 'http') {
          throw new Error('Expected HTTP command');
        }
        const newTransport = new StreamableHTTPClientTransport(command.url, {
          authProvider: oauthSession.provider,
        }) as typeof transport;

        // Connect with the new transport - this will trigger OAuth flow
        try {
          await client.connect(newTransport);
          return oauthSession;
        } catch (retryError) {
          // OAuth was triggered but user needs to complete it
          if (isUnauthorizedError(retryError) && newTransport.finishAuth) {
            const authorizationCode = await oauthSession.waitForAuthorizationCode();

            await newTransport.finishAuth(authorizationCode);

            // After finishAuth(), the tokens are saved to disk
            // Throw a special error to signal the runtime to retry the entire connection
            // from scratch with the new tokens
            throw new OAuthTokensRefreshedError('OAuth tokens refreshed, retry connection');
          }
          throw retryError;
        }
      } else {
        throw error;
      }
    }
  }
}

class OAuthTokensRefreshedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthTokensRefreshedError';
  }
}

class OAuthTimeoutError extends Error {
  public readonly timeoutMs: number;
  public readonly serverName: string;

  constructor(serverName: string, timeoutMs: number) {
    const seconds = Math.round(timeoutMs / 1000);
    super(`OAuth authorization for '${serverName}' timed out after ${seconds}s; aborting.`);
    this.name = 'OAuthTimeoutError';
    this.timeoutMs = timeoutMs;
    this.serverName = serverName;
  }
}

export const __test = {
  maybeEnableOAuth,
  isUnauthorizedError,
  waitForAuthorizationCodeWithTimeout,
  OAuthTimeoutError,
};

// Race the pending OAuth browser handshake so the runtime can't sit on an unresolved promise forever.
function waitForAuthorizationCodeWithTimeout(
  session: OAuthSession,
  logger: RuntimeLogger,
  serverName?: string,
  timeoutMs = OAUTH_CODE_TIMEOUT_MS
): Promise<string> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return session.waitForAuthorizationCode();
  }
  const displayName = serverName ?? 'unknown';
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new OAuthTimeoutError(displayName, timeoutMs);
      logger.warn(error.message);
      reject(error);
    }, timeoutMs);
    session.waitForAuthorizationCode().then(
      (code) => {
        clearTimeout(timer);
        resolve(code);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// createConsoleLogger produces the default runtime logger honoring MCPORTER_LOG_LEVEL.
function createConsoleLogger(level: LogLevel = resolveLogLevelFromEnv()): RuntimeLogger {
  return createPrefixedConsoleLogger('craft', level);
}

export { readJsonFile, writeJsonFile } from './fs-json.js';
