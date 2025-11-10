import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { URL } from 'node:url';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { ServerDefinition } from './config.js';
import { readJsonFile, writeJsonFile } from './fs-json.js';
import {
  discoverAuthorizationServerMetadata,
  discoverProtectedResourceMetadata,
  selectScopes,
} from './oauth-discovery.js';

const CALLBACK_HOST = '127.0.0.1';
const CALLBACK_PATH = '/callback';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

// createDeferred produces a minimal promise wrapper for async coordination.
function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// openExternal attempts to launch the system browser cross-platform.
function openExternal(url: string) {
  const platform = process.platform;
  const stdio = 'ignore';
  try {
    if (platform === 'darwin') {
      const child = spawn('open', [url], { stdio, detached: true });
      child.unref();
    } else if (platform === 'win32') {
      const child = spawn('cmd', ['/c', 'start', '""', url], {
        stdio,
        detached: true,
      });
      child.unref();
    } else {
      const child = spawn('xdg-open', [url], { stdio, detached: true });
      child.unref();
    }
  } catch {
    // best-effort: fall back to printing URL
  }
}

// ensureDirectory guarantees a directory exists before writing JSON blobs.
async function ensureDirectory(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

// discoverOAuthScope performs OAuth discovery to determine the correct scope to use.
async function discoverOAuthScope(serverUrl: URL, logger: OAuthLogger): Promise<string | undefined> {
  logger.info(`Discovering OAuth metadata for ${serverUrl.toString()}...`);

  try {
    // Step 1: Discover Protected Resource Metadata (RFC 9728)
    const resourceMetadata = await discoverProtectedResourceMetadata(serverUrl, logger);
    if (!resourceMetadata) {
      logger.warn('Failed to discover Protected Resource Metadata, falling back to default scope');
      return undefined;
    }

    // Step 2: Get the first authorization server
    if (!resourceMetadata.authorization_servers || resourceMetadata.authorization_servers.length === 0) {
      logger.warn('No authorization servers found in Protected Resource Metadata');
      return undefined;
    }

    const authServerUrl = resourceMetadata.authorization_servers[0];
    if (!authServerUrl) {
      logger.warn('Authorization server URL is empty');
      return undefined;
    }
    logger.info(`Discovered authorization server: ${authServerUrl}`);

    // Step 3: Discover Authorization Server Metadata (RFC 8414 / OpenID Connect)
    const authServerMetadata = await discoverAuthorizationServerMetadata(authServerUrl, logger);
    if (!authServerMetadata) {
      logger.warn('Failed to discover Authorization Server Metadata');
      return undefined;
    }

    // Step 4: Verify PKCE support (required by MCP spec)
    if (
      !authServerMetadata.code_challenge_methods_supported ||
      authServerMetadata.code_challenge_methods_supported.length === 0
    ) {
      logger.warn('Authorization server does not advertise PKCE support (code_challenge_methods_supported)');
      // MCP spec requires PKCE, but we'll try anyway
    }

    // Step 5: Select scopes according to MCP spec scope selection strategy
    const selectedScopes = selectScopes({
      scopesSupported: authServerMetadata.scopes_supported,
      protectedResourceScopes: resourceMetadata.scopes_supported,
    });

    if (!selectedScopes || selectedScopes.length === 0) {
      logger.info('No scopes discovered, omitting scope parameter as per MCP spec');
      return undefined;
    }

    const scopeString = selectedScopes.join(' ');
    logger.info(`Discovered OAuth scopes: ${scopeString}`);
    return scopeString;
  } catch (error) {
    logger.warn(`OAuth discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

// FileOAuthClientProvider persists OAuth session artifacts to disk and captures callback redirects.
class FileOAuthClientProvider implements OAuthClientProvider {
  private readonly tokenPath: string;
  private readonly clientInfoPath: string;
  private readonly codeVerifierPath: string;
  private readonly statePath: string;
  private readonly metadata: OAuthClientMetadata;
  private readonly logger: OAuthLogger;
  private redirectUrlValue: URL;
  private authorizationDeferred: Deferred<string> | null = null;
  private server?: http.Server;

  private constructor(
    private readonly definition: ServerDefinition,
    tokenCacheDir: string,
    redirectUrl: URL,
    logger: OAuthLogger,
    scopeOverride?: string
  ) {
    this.tokenPath = path.join(tokenCacheDir, 'tokens.json');
    this.clientInfoPath = path.join(tokenCacheDir, 'client.json');
    this.codeVerifierPath = path.join(tokenCacheDir, 'code_verifier.txt');
    this.statePath = path.join(tokenCacheDir, 'state.txt');
    this.redirectUrlValue = redirectUrl;
    this.logger = logger;
    this.metadata = {
      client_name: definition.clientName ?? `Craft CLI (${definition.name})`,
      redirect_uris: [this.redirectUrlValue.toString()],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: scopeOverride ?? 'mcp:tools',
    };
  }

  static async create(
    definition: ServerDefinition,
    logger: OAuthLogger
  ): Promise<{
    provider: FileOAuthClientProvider;
    close: () => Promise<void>;
  }> {
    const tokenDir = definition.tokenCacheDir ?? path.join(os.homedir(), '.craft', definition.name);
    await ensureDirectory(tokenDir);

    // Perform OAuth discovery if this is an HTTP server
    let discoveredScope: string | undefined;
    if (definition.command.kind === 'http') {
      discoveredScope = await discoverOAuthScope(definition.command.url, logger);
    }

    // Check if we have existing client information with a registered redirect URI
    const clientInfoPath = path.join(tokenDir, 'client.json');
    const existingClient = await readJsonFile<OAuthClientInformationMixed>(clientInfoPath);
    const existingRedirectUri =
      existingClient && 'redirect_uris' in existingClient ? existingClient.redirect_uris?.[0] : undefined;

    const server = http.createServer();
    const overrideRedirect = definition.oauthRedirectUrl ? new URL(definition.oauthRedirectUrl) : null;

    // If we have an existing redirect URI and no override, reuse it to avoid "unregistered redirect uri" errors
    const reuseExisting = existingRedirectUri && !overrideRedirect;
    const existingUrl = reuseExisting ? new URL(existingRedirectUri) : null;

    const listenHost = overrideRedirect?.hostname ?? existingUrl?.hostname ?? CALLBACK_HOST;
    const desiredPort = overrideRedirect?.port
      ? Number.parseInt(overrideRedirect.port, 10)
      : existingUrl?.port
        ? Number.parseInt(existingUrl.port, 10)
        : undefined;
    const callbackPath =
      overrideRedirect?.pathname && overrideRedirect.pathname !== '/'
        ? overrideRedirect.pathname
        : existingUrl?.pathname && existingUrl.pathname !== '/'
          ? existingUrl.pathname
          : CALLBACK_PATH;

    const port = await new Promise<number>((resolve, reject) => {
      server.listen(desiredPort ?? 0, listenHost, () => {
        const address = server.address();
        if (typeof address === 'object' && address && 'port' in address) {
          resolve(address.port);
        } else {
          reject(new Error('Failed to determine callback port'));
        }
      });
      server.once('error', (error) => reject(error));
    });

    const redirectUrl = overrideRedirect
      ? new URL(overrideRedirect.toString())
      : existingUrl
        ? new URL(existingUrl.toString())
        : new URL(`http://${listenHost}:${port}${callbackPath}`);

    if (!overrideRedirect && !existingUrl) {
      redirectUrl.port = String(port);
      redirectUrl.pathname = callbackPath;
    } else if (!overrideRedirect || overrideRedirect.port === '') {
      redirectUrl.port = String(port);
    }
    if (!overrideRedirect || overrideRedirect.pathname === '/' || overrideRedirect.pathname === '') {
      redirectUrl.pathname = callbackPath;
    }

    const provider = new FileOAuthClientProvider(definition, tokenDir, redirectUrl, logger, discoveredScope);
    provider.attachServer(server);
    return {
      provider,
      close: async () => {
        await provider.close();
      },
    };
  }

  // attachServer listens for the OAuth redirect and resolves/rejects the deferred code promise.
  private attachServer(server: http.Server) {
    this.server = server;
    server.on('request', async (req, res) => {
      try {
        const url = req.url ?? '';
        if (!url.startsWith('/callback')) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        const parsed = new URL(url, this.redirectUrlValue);
        const code = parsed.searchParams.get('code');
        const error = parsed.searchParams.get('error');
        if (code) {
          this.logger.info(`Received OAuth authorization code for ${this.definition.name}`);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html');
          res.end('<html><body><h1>Authorization successful</h1><p>You can return to the CLI.</p></body></html>');
          this.authorizationDeferred?.resolve(code);
          this.authorizationDeferred = null;
        } else if (error) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'text/html');
          res.end(`<html><body><h1>Authorization failed</h1><p>${error}</p></body></html>`);
          this.authorizationDeferred?.reject(new Error(`OAuth error: ${error}`));
          this.authorizationDeferred = null;
        } else {
          res.statusCode = 400;
          res.end('Missing authorization code');
          this.authorizationDeferred?.reject(new Error('Missing authorization code'));
          this.authorizationDeferred = null;
        }
      } catch (error) {
        this.authorizationDeferred?.reject(error);
        this.authorizationDeferred = null;
      }
    });
  }

  get redirectUrl(): string | URL {
    return this.redirectUrlValue;
  }

  get clientMetadata(): OAuthClientMetadata {
    return this.metadata;
  }

  async state(): Promise<string> {
    const existing = await readJsonFile<string>(this.statePath);
    if (existing) {
      return existing;
    }
    const state = randomUUID();
    await writeJsonFile(this.statePath, state);
    return state;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    return readJsonFile<OAuthClientInformationMixed>(this.clientInfoPath);
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed): Promise<void> {
    await writeJsonFile(this.clientInfoPath, clientInformation);
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return readJsonFile<OAuthTokens>(this.tokenPath);
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await writeJsonFile(this.tokenPath, tokens);
    this.logger.info(`Saved OAuth tokens for ${this.definition.name} to ${this.tokenPath}`);
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this.logger.info(`Authorization required for ${this.definition.name}. Opening browser...`);
    this.authorizationDeferred = createDeferred<string>();
    openExternal(authorizationUrl.toString());
    this.logger.info(`If the browser did not open, visit ${authorizationUrl.toString()} manually.`);

    // Don't wait here - the callback will resolve authorizationDeferred when the user completes OAuth
    // Callers should use waitForAuthorizationCode() to wait for the authorization code
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await fs.writeFile(this.codeVerifierPath, codeVerifier, 'utf8');
  }

  async codeVerifier(): Promise<string> {
    const value = await fs.readFile(this.codeVerifierPath, 'utf8');
    return value.trim();
  }

  // invalidateCredentials removes cached files to force the next OAuth flow.
  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier'): Promise<void> {
    const removals: string[] = [];
    if (scope === 'all' || scope === 'tokens') {
      removals.push(this.tokenPath);
    }
    if (scope === 'all' || scope === 'client') {
      removals.push(this.clientInfoPath);
    }
    if (scope === 'all' || scope === 'verifier') {
      removals.push(this.codeVerifierPath);
    }
    await Promise.all(
      removals.map(async (file) => {
        try {
          await fs.unlink(file);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
          }
        }
      })
    );
  }

  // waitForAuthorizationCode resolves once the local callback server captures a redirect.
  async waitForAuthorizationCode(): Promise<string> {
    if (!this.authorizationDeferred) {
      this.authorizationDeferred = createDeferred<string>();
    }
    return this.authorizationDeferred.promise;
  }

  // close stops the temporary callback server created for the OAuth session.
  async close(): Promise<void> {
    if (this.authorizationDeferred) {
      // If the CLI is tearing down mid-flow, silently resolve the pending promise
      // Don't reject - that could cause unhandled errors during cleanup
      this.authorizationDeferred = null;
    }
    if (!this.server) {
      return;
    }

    // Close the HTTP server with a timeout to prevent hanging
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
      }, 2000);

      this.server?.close((err) => {
        clearTimeout(timeout);
        if (err) {
          this.logger.warn(`Error closing OAuth callback server: ${err.message}`);
        }
        resolve();
      });
    });
    this.server = undefined;
  }
}

export interface OAuthSession {
  provider: OAuthClientProvider & {
    waitForAuthorizationCode: () => Promise<string>;
  };
  waitForAuthorizationCode: () => Promise<string>;
  close: () => Promise<void>;
}

// createOAuthSession spins up a file-backed OAuth provider and callback server for the target definition.
export async function createOAuthSession(definition: ServerDefinition, logger: OAuthLogger): Promise<OAuthSession> {
  const { provider, close } = await FileOAuthClientProvider.create(definition, logger);
  const waitForAuthorizationCode = () => provider.waitForAuthorizationCode();
  return {
    provider,
    waitForAuthorizationCode,
    close,
  };
}
export interface OAuthLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}
