import type { OAuthLogger } from './oauth.js';

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728)
 */
export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported?: string[];
  bearer_methods_supported?: string[];
  resource_signing_alg_values_supported?: string[];
  resource_documentation?: string;
}

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414)
 * and OpenID Connect Discovery 1.0
 */
export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported: string[];
  grant_types_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  code_challenge_methods_supported?: string[];
  // OpenID Connect specific
  userinfo_endpoint?: string;
  jwks_uri?: string;
}

/**
 * Parsed WWW-Authenticate header
 */
export interface WWWAuthenticateChallenge {
  scheme: string;
  resourceMetadata?: string;
  scope?: string;
  error?: string;
  errorDescription?: string;
}

/**
 * Discovers OAuth Protected Resource Metadata for an MCP server.
 * Implements RFC 9728 discovery mechanism.
 */
export async function discoverProtectedResourceMetadata(
  serverUrl: URL,
  logger?: OAuthLogger
): Promise<ProtectedResourceMetadata | null> {
  // Try well-known URIs according to RFC 9728
  const wellKnownPaths = buildProtectedResourceWellKnownPaths(serverUrl);

  for (const url of wellKnownPaths) {
    try {
      logger?.info(`Trying Protected Resource Metadata discovery at ${url}`);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const metadata = (await response.json()) as ProtectedResourceMetadata;
        logger?.info(`Successfully discovered Protected Resource Metadata at ${url}`);
        return metadata;
      }
    } catch (error) {
      logger?.info(
        `Failed to fetch Protected Resource Metadata from ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return null;
}

/**
 * Discovers OAuth Authorization Server Metadata for an authorization server.
 * Implements RFC 8414 and OpenID Connect Discovery 1.0.
 */
export async function discoverAuthorizationServerMetadata(
  issuerUrl: string,
  logger?: OAuthLogger
): Promise<AuthorizationServerMetadata | null> {
  const issuer = new URL(issuerUrl);
  const wellKnownPaths = buildAuthorizationServerWellKnownPaths(issuer);

  for (const url of wellKnownPaths) {
    try {
      logger?.info(`Trying Authorization Server Metadata discovery at ${url}`);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const metadata = (await response.json()) as AuthorizationServerMetadata;
        logger?.info(`Successfully discovered Authorization Server Metadata at ${url}`);
        return metadata;
      }
    } catch (error) {
      logger?.info(
        `Failed to fetch Authorization Server Metadata from ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return null;
}

/**
 * Parses WWW-Authenticate header to extract OAuth challenge parameters.
 * Implements RFC 6750 Section 3.
 */
export function parseWWWAuthenticateHeader(headerValue: string): WWWAuthenticateChallenge | null {
  const parts = headerValue.trim().split(/\s+/);
  if (parts.length === 0) {
    return null;
  }

  const scheme = parts[0];
  if (!scheme || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  const challenge: WWWAuthenticateChallenge = { scheme };

  // Parse challenge parameters
  const paramString = parts.slice(1).join(' ');
  const paramRegex = /(\w+)="([^"]*)"/g;
  let match: RegExpExecArray | null = paramRegex.exec(paramString);

  while (match !== null) {
    const [, key, value] = match;
    if (!key || !value) {
      match = paramRegex.exec(paramString);
      continue;
    }

    switch (key.toLowerCase()) {
      case 'resource_metadata':
        challenge.resourceMetadata = value;
        break;
      case 'scope':
        challenge.scope = value;
        break;
      case 'error':
        challenge.error = value;
        break;
      case 'error_description':
        challenge.errorDescription = value;
        break;
    }

    match = paramRegex.exec(paramString);
  }

  return challenge;
}

/**
 * Builds well-known URI paths for Protected Resource Metadata discovery.
 * Implements RFC 9728 Section 3.
 */
function buildProtectedResourceWellKnownPaths(serverUrl: URL): string[] {
  const paths: string[] = [];
  const origin = `${serverUrl.protocol}//${serverUrl.host}`;

  // If the server has a path component, try path-specific discovery first
  if (serverUrl.pathname && serverUrl.pathname !== '/' && serverUrl.pathname !== '') {
    paths.push(`${origin}/.well-known/oauth-protected-resource${serverUrl.pathname}`);
  }

  // Always try the root well-known URI
  paths.push(`${origin}/.well-known/oauth-protected-resource`);

  return paths;
}

/**
 * Builds well-known URI paths for Authorization Server Metadata discovery.
 * Implements RFC 8414 Section 3.1 and OpenID Connect Discovery 1.0.
 */
function buildAuthorizationServerWellKnownPaths(issuerUrl: URL): string[] {
  const paths: string[] = [];
  const origin = `${issuerUrl.protocol}//${issuerUrl.host}`;
  const pathComponent = issuerUrl.pathname.replace(/\/$/, ''); // Remove trailing slash

  if (pathComponent && pathComponent !== '') {
    // For issuer URLs with path components, try path insertion first (RFC 8414)
    paths.push(`${origin}/.well-known/oauth-authorization-server${pathComponent}`);
    // OpenID Connect Discovery with path insertion
    paths.push(`${origin}/.well-known/openid-configuration${pathComponent}`);
    // OpenID Connect Discovery with path appending
    paths.push(`${origin}${pathComponent}/.well-known/openid-configuration`);
  } else {
    // For issuer URLs without path components
    paths.push(`${origin}/.well-known/oauth-authorization-server`);
    paths.push(`${origin}/.well-known/openid-configuration`);
  }

  return paths;
}

/**
 * Determines the canonical resource URI for an MCP server.
 * Implements RFC 8707 resource identifier requirements.
 */
export function buildCanonicalResourceUri(serverUrl: URL): string {
  const protocol = serverUrl.protocol.toLowerCase();
  const host = serverUrl.hostname.toLowerCase();
  const port = serverUrl.port;
  const path = serverUrl.pathname;

  // Build canonical URI (lowercase protocol and host)
  let canonical = `${protocol}//${host}`;

  // Only include port if it's non-standard
  if (port && ((protocol === 'https:' && port !== '443') || (protocol === 'http:' && port !== '80'))) {
    canonical += `:${port}`;
  }

  // Include path if present and not just root
  if (path && path !== '/' && path !== '') {
    canonical += path.replace(/\/$/, ''); // Remove trailing slash for consistency
  }

  return canonical;
}

/**
 * Selects scopes according to MCP OAuth spec scope selection strategy.
 * Priority: challenged scope > scopes_supported > omit scope parameter
 */
export function selectScopes(options: {
  challengedScope?: string;
  scopesSupported?: string[];
  protectedResourceScopes?: string[];
}): string[] | undefined {
  const { challengedScope, scopesSupported, protectedResourceScopes } = options;

  // Priority 1: Use challenged scope from WWW-Authenticate header
  if (challengedScope) {
    return challengedScope.split(' ').filter((s) => s.length > 0);
  }

  // Priority 2: Use scopes_supported from Authorization Server Metadata
  if (scopesSupported && scopesSupported.length > 0) {
    return scopesSupported;
  }

  // Priority 3: Use scopes from Protected Resource Metadata
  if (protectedResourceScopes && protectedResourceScopes.length > 0) {
    return protectedResourceScopes;
  }

  // No scopes specified - omit scope parameter
  return undefined;
}
