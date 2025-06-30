import { Request, Response } from 'express';
import winston from 'winston';
import { randomUUID } from 'crypto';
import { TwentyCRMClient } from '../twenty-client.js';

// OAuth Provider interface following RFC standards
export interface OAuthToken {
  access_token: string;
  token_type: 'Bearer';
  expires_in?: number;
  scope?: string;
  client_id?: string;
}

export interface TokenInfo {
  token: string;
  clientId: string;
  scopes: string[];
  expiresAt?: Date;
  twentyApiKey: string;
}

export interface ClientInfo {
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  scope?: string;
  contacts?: string[];
  tos_uri?: string;
  policy_uri?: string;
}

export interface AuthorizeParams {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  state: string;
  scope?: string;
}

export interface TokenParams {
  grant_type: string;
  api_key?: string;
  code?: string;
  redirect_uri?: string;
  client_id?: string;
  refresh_token?: string;
}

// Token and client cache
const tokenCache = new Map<string, TokenInfo>();
const registeredClients = new Map<string, ClientInfo>();
const authorizationCodes = new Map<string, { apiKey: string; clientId: string; expiresAt: Date; sessionId?: string }>();
const sessionTokens = new Map<string, string>(); // Map session IDs to API keys
const clientApiKeys = new Map<string, string>(); // Map client IDs to API keys

export class ApiKeyOAuthProvider {
  private logger: winston.Logger;
  
  constructor(logger: winston.Logger) {
    this.logger = logger;
  }

  /**
   * Register a new OAuth client (Dynamic Client Registration)
   */
  async registerClient(clientData: Partial<ClientInfo>): Promise<ClientInfo> {
    const clientId = randomUUID();
    const clientSecret = randomUUID();
    
    const client: ClientInfo = {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: clientData.redirect_uris || ['http://localhost:3000/callback'],
      grant_types: clientData.grant_types || ['authorization_code', 'api_key'],
      response_types: clientData.response_types || ['code', 'token'],
      client_name: clientData.client_name || 'MCP Client',
      scope: clientData.scope || 'read write'
    };
    
    registeredClients.set(clientId, client);
    this.logger.info(`Registered new OAuth client: ${clientId}`);
    
    return client;
  }

  /**
   * Get registered client info
   */
  async getClient(clientId: string): Promise<ClientInfo | null> {
    // Check if it's already registered
    const registered = registeredClients.get(clientId);
    if (registered) {
      return registered;
    }
    
    // Known Claude Web client IDs - auto-accept these
    const knownClaudeClients = [
      '3c3f95df-539b-4e16-b383-87d870159c21',
      // Add more as needed
    ];
    
    if (knownClaudeClients.includes(clientId)) {
      // Auto-register known Claude client
      const client: ClientInfo = {
        client_id: clientId,
        client_secret: undefined, // Claude uses PKCE, no secret needed
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        client_name: 'Claude Web',
        scope: 'read write'
      };
      
      // Store for this session
      registeredClients.set(clientId, client);
      this.logger.info(`Auto-registered known Claude client: ${clientId}`);
      
      return client;
    }
    
    return null;
  }

  /**
   * Validate an API key and return token info
   */
  async verifyAccessToken(token: string): Promise<TokenInfo> {
    this.logger.debug(`Verifying access token`, { 
      tokenLength: token.length, 
      tokenStart: token.substring(0, 10),
      isJWT: token.startsWith('eyJ'),
      tokenChars: token.split('').map(c => c.charCodeAt(0)).slice(0, 10)
    });

    // Check cache first
    const cached = tokenCache.get(token);
    if (cached && (!cached.expiresAt || cached.expiresAt > new Date())) {
      return cached;
    }

    // Handle JWT tokens differently
    if (token.startsWith('eyJ')) {
      // This is a JWT token - try to decode it or accept it as valid OAuth token
      try {
        // For now, accept JWT tokens without validation and extract API key from payload
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        this.logger.debug('JWT payload:', { payload });
        
        // If JWT contains an API key, use that
        if (payload.api_key || payload.apiKey || payload.twenty_api_key) {
          const apiKey = payload.api_key || payload.apiKey || payload.twenty_api_key;
          const client = new TwentyCRMClient(apiKey, this.logger);
          await client.testConnection();
          
          const tokenInfo: TokenInfo = {
            token,
            clientId: payload.client_id || `jwt-user-${token.substring(0, 8)}`,
            scopes: payload.scope ? payload.scope.split(' ') : ['read', 'write'],
            expiresAt: payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000),
            twentyApiKey: apiKey
          };
          
          tokenCache.set(token, tokenInfo);
          return tokenInfo;
        }
        
        // If no API key in JWT, this is probably a Twenty CRM JWT token
        // We need to accept it as valid but can't validate against Twenty API directly
        if (payload.type === 'API_KEY' && payload.workspaceId) {
          this.logger.info('Twenty CRM JWT token detected, accepting without Twenty API validation');
          
          const tokenInfo: TokenInfo = {
            token,
            clientId: payload.sub || `twenty-workspace-${payload.workspaceId}`,
            scopes: ['read', 'write'],
            expiresAt: payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000),
            twentyApiKey: token // Keep JWT as identifier, but mark it as such
          };
          
          tokenCache.set(token, tokenInfo);
          return tokenInfo;
        }
        
        // If no API key in JWT and not a Twenty CRM token, treat as generic OAuth token
        this.logger.warn('Generic JWT token without API key field, accepting without validation');
        
        const tokenInfo: TokenInfo = {
          token,
          clientId: payload.client_id || payload.sub || `jwt-user-${token.substring(0, 8)}`,
          scopes: payload.scope ? payload.scope.split(' ') : ['read', 'write'],
          expiresAt: payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000),
          twentyApiKey: token // Use JWT as API key (will likely fail but allows testing)
        };
        
        tokenCache.set(token, tokenInfo);
        return tokenInfo;
        
      } catch (jwtError) {
        this.logger.error('JWT parsing failed:', jwtError);
        throw new Error('Invalid JWT token');
      }
    }

    // Direct API key validation (existing logic)
    try {
      const client = new TwentyCRMClient(token, this.logger);
      await client.testConnection();
      
      // Create token info
      const tokenInfo: TokenInfo = {
        token,
        clientId: `twenty-user-${token.substring(0, 8)}`,
        scopes: ['read', 'write'],
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        twentyApiKey: token
      };
      
      // Cache for performance
      tokenCache.set(token, tokenInfo);
      
      return tokenInfo;
    } catch (error) {
      this.logger.error('API key validation failed:', error);
      throw new Error('Invalid API key');
    }
  }

  /**
   * OAuth authorize endpoint
   */
  async authorize(params: AuthorizeParams): Promise<{ redirect_uri: string }> {
    const code = randomUUID();
    
    // For now, we'll assume the API key comes through a separate flow
    // In production, this would redirect to a UI for API key input
    return {
      redirect_uri: `${params.redirect_uri}?code=${code}&state=${params.state}`
    };
  }

  /**
   * OAuth token endpoint
   */
  async token(params: TokenParams): Promise<OAuthToken> {
    if (params.grant_type === 'api_key' && params.api_key) {
      // Custom grant type for direct API key exchange
      const tokenInfo = await this.verifyAccessToken(params.api_key);
      
      return {
        access_token: params.api_key,
        token_type: 'Bearer',
        expires_in: 86400, // 24 hours
        scope: tokenInfo.scopes.join(' ')
      };
    }
    
    if (params.grant_type === 'authorization_code' && params.code) {
      // Handle authorization code flow
      const codeInfo = authorizationCodes.get(params.code);
      
      if (!codeInfo || codeInfo.expiresAt < new Date()) {
        throw new Error('Invalid or expired authorization code');
      }
      
      authorizationCodes.delete(params.code);
      
      // Link session if available
      if (codeInfo.sessionId) {
        this.linkSessionToApiKey(codeInfo.sessionId, codeInfo.apiKey);
      }
      
      return {
        access_token: codeInfo.apiKey,
        token_type: 'Bearer',
        expires_in: 86400,
        scope: 'read write'
      };
    }
    
    throw new Error(`Unsupported grant type: ${params.grant_type}`);
  }

  /**
   * Store authorization code for later exchange
   */
  storeAuthorizationCode(code: string, apiKey: string, clientId: string, sessionId?: string): void {
    authorizationCodes.set(code, {
      apiKey,
      clientId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      sessionId
    });
  }
  
  /**
   * Link a session to an API key after successful OAuth
   */
  linkSessionToApiKey(sessionId: string, apiKey: string): void {
    sessionTokens.set(sessionId, apiKey);
    this.logger.info(`Linked session ${sessionId} to API key`);
  }
  
  /**
   * Link a client to an API key after successful OAuth
   */
  linkClientToApiKey(clientId: string, apiKey: string): void {
    clientApiKeys.set(clientId, apiKey);
    this.logger.info(`Linked client ${clientId} to API key`);
  }
  
  /**
   * Get API key for a session
   */
  getApiKeyForSession(sessionId: string): string | undefined {
    return sessionTokens.get(sessionId);
  }

  /**
   * Clear expired tokens from cache
   */
  cleanupCache(): void {
    const now = new Date();
    for (const [token, info] of tokenCache.entries()) {
      if (info.expiresAt && info.expiresAt < now) {
        tokenCache.delete(token);
      }
    }
  }
}

/**
 * Express middleware for OAuth token validation
 */
export function createOAuthMiddleware(provider: ApiKeyOAuthProvider) {
  return async (req: Request & { twentyApiKey?: string; userId?: string; authenticatedClient?: any }, res: Response, next: Function) => {
    const authHeader = req.headers.authorization;
    
    console.debug(`OAuth middleware received headers`, {
      authorization: authHeader ? `Bearer ${authHeader.substring(7, 17)}...` : 'none',
      'content-type': req.headers['content-type'],
      'mcp-session-id': req.headers['mcp-session-id']
    });
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'unauthorized',
        error_description: 'Missing or invalid Authorization header'
      });
    }
    
    const token = authHeader.substring(7);
    
    try {
      const tokenInfo = await provider.verifyAccessToken(token);
      
      // Add to request - we already validated the client in verifyAccessToken
      req.twentyApiKey = tokenInfo.twentyApiKey;
      req.userId = tokenInfo.clientId;
      
      // Create TwentyCRMClient here to avoid circular dependency
      // We'll pass the API key and let the handler create the client
      req.authenticatedClient = { apiKey: tokenInfo.twentyApiKey };
      
      next();
    } catch (error) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'The access token is invalid or expired'
      });
    }
  };
} 