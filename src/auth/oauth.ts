import { Router, Request, Response, NextFunction } from 'express';
import { Client as StytchClient } from 'stytch';
import { getApiKeyForUser, cacheToken, checkTokenCache } from './database.js';

const STYTCH_PROJECT_ID = process.env.STYTCH_PROJECT_ID;
const STYTCH_SECRET = process.env.STYTCH_SECRET;
const STYTCH_ISSUER = `https://api.stytch.com/v1/public/${STYTCH_PROJECT_ID}`;

let stytchClient: StytchClient | null = null;

if (STYTCH_PROJECT_ID && STYTCH_SECRET) {
  stytchClient = new StytchClient({
    project_id: STYTCH_PROJECT_ID,
    secret: STYTCH_SECRET,
  });
}

export const oauthRouter = Router();

// Protected Resource Metadata (RFC 9728)
oauthRouter.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json({
    resource: process.env.MCP_SERVER_URL || 'https://localhost:3000',
    authorization_servers: [STYTCH_ISSUER],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://docs.twenty.com/mcp",
    resource_signing_alg_values_supported: ["RS256"]
  });
});

// Fallback: Authorization Server Metadata (falls direkt angefragt)
oauthRouter.get('/.well-known/oauth-authorization-server', (req, res) => {
  // Redirect zu Stytch's Authorization Server Metadata
  res.redirect(301, `${STYTCH_ISSUER}/.well-known/openid-configuration`);
});

export interface AuthenticatedRequest extends Request {
  userId: string;
  twentyApiKey: string;
}

export async function validateOAuthToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'unauthorized',
      error_description: 'Missing or invalid Authorization header'
    });
  }

  const token = authHeader.substring(7);

  try {
    // Check token cache first (performance optimization)
    const cached = await checkTokenCache(token);
    if (cached) {
      (req as AuthenticatedRequest).userId = cached.userId;
      (req as AuthenticatedRequest).twentyApiKey = cached.twentyApiKey;
      return next();
    }

    // If no Stytch client configured, fall back to treating token as API key
    if (!stytchClient) {
      // For testing/development - treat the bearer token as the API key directly
      (req as AuthenticatedRequest).userId = 'dev-user';
      (req as AuthenticatedRequest).twentyApiKey = token;
      return next();
    }

    // Validate token with Stytch
    const sessionResp = await stytchClient.sessions.authenticate({
      session_token: token,
    });

    const userId = sessionResp.user.user_id;
    
    // Get Twenty API key for this user
    const twentyApiKey = await getApiKeyForUser(userId);
    
    if (!twentyApiKey) {
      return res.status(403).json({
        error: 'forbidden',
        error_description: 'No Twenty CRM access configured for this user'
      });
    }

    // Cache for performance
    const expiresAt = sessionResp.session.expires_at 
      ? new Date(sessionResp.session.expires_at)
      : new Date(Date.now() + 60 * 60 * 1000); // Default 1 hour
    await cacheToken(token, userId, twentyApiKey, expiresAt);

    // Add to request
    (req as AuthenticatedRequest).userId = userId;
    (req as AuthenticatedRequest).twentyApiKey = twentyApiKey;
    
    next();
  } catch (error) {
    console.error('Token validation error:', error);
    
    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'The access token is invalid or expired'
    });
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req as AuthenticatedRequest).userId) {
    return res.status(401).json({
      error: 'unauthorized',
      error_description: 'Authentication required'
    });
  }
  next();
} 