import { Router, Request, Response } from 'express';
import { ApiKeyOAuthProvider } from './api-key-oauth-provider.js';
import winston from 'winston';
import express from 'express';
import { randomUUID } from 'crypto';

export interface OAuthRouterOptions {
  provider: ApiKeyOAuthProvider;
  issuerUrl: URL;
  baseUrl: URL;
  serviceDocumentationUrl?: URL;
}

export function createApiKeyOAuthRouter(options: OAuthRouterOptions): Router {
  const router = Router();
  const { provider, issuerUrl, baseUrl, serviceDocumentationUrl } = options;
  
  // OAuth 2.1 Protected Resource Metadata (RFC 9728)
  router.get('/.well-known/oauth-protected-resource', (req: Request, res: Response) => {
    res.json({
      resource: issuerUrl.toString(),
      authorization_servers: [issuerUrl.toString()],
      bearer_methods_supported: ['header'],
      resource_documentation: serviceDocumentationUrl?.toString() || 'https://docs.twenty.com/mcp',
      resource_signing_alg_values_supported: ['RS256', 'HS256'],
      scopes_supported: ['read', 'write'],
      // Custom extension for API key support
      custom_grant_types_supported: ['api_key']
    });
  });

  // OAuth 2.0 Authorization Server Metadata (RFC 8414)
  router.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
    const metadata = {
      issuer: issuerUrl.toString(),
      authorization_endpoint: new URL('/oauth/authorize', baseUrl).toString(),
      token_endpoint: new URL('/oauth/token', baseUrl).toString(),
      registration_endpoint: new URL('/oauth/register', baseUrl).toString(),
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      response_types_supported: ['code', 'token'],
      grant_types_supported: ['authorization_code', 'api_key', 'refresh_token'],
      scopes_supported: ['read', 'write'],
      code_challenge_methods_supported: ['S256'],
      // Streamable HTTP support signals
      dpop_signing_alg_values_supported: ['RS256', 'ES256'],
      tls_client_certificate_bound_access_tokens: false,
      // Custom extensions
      api_key_endpoint: new URL('/oauth/api-key', baseUrl).toString(),
      service_documentation: serviceDocumentationUrl?.toString()
    };
    
    res.json(metadata);
  });

  // Dynamic Client Registration Endpoint (RFC 7591)
  router.post('/oauth/register', express.json(), async (req: Request, res: Response) => {
    try {
      const clientData = req.body;
      
      // Register the client
      const client = await provider.registerClient(clientData);
      
      // Return client information
      res.status(201).json({
        client_id: client.client_id,
        client_secret: client.client_secret,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_secret_expires_at: 0, // Never expires
        redirect_uris: client.redirect_uris,
        grant_types: client.grant_types,
        response_types: client.response_types,
        client_name: client.client_name,
        scope: client.scope
      });
    } catch (error) {
      res.status(400).json({
        error: 'invalid_client_metadata',
        error_description: error instanceof Error ? error.message : 'Client registration failed'
      });
    }
  });

  // Authorization endpoint
  router.get('/oauth/authorize', async (req: Request, res: Response) => {
    const { 
      client_id, 
      redirect_uri, 
      response_type, 
      state, 
      scope,
      code_challenge,
      code_challenge_method,
      resource 
    } = req.query;
    
    // State is optional in OAuth 2.1 with PKCE
    if (!client_id || !redirect_uri || !response_type) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters: client_id, redirect_uri, response_type'
      });
    }
    
    // Verify client exists
    const client = await provider.getClient(String(client_id));
    if (!client) {
      return res.status(400).json({
        error: 'invalid_client',
        error_description: 'Unknown client'
      });
    }
    
    try {
      // Extract session ID from various sources
      let sessionId: string | undefined;
      
      // Try to get from state parameter (common pattern)
      if (state) {
        try {
          const stateData = JSON.parse(decodeURIComponent(String(state)));
          sessionId = stateData.session_id || stateData.sessionId;
        } catch {
          // State might not be JSON, try direct value
          if (String(state).includes('session_')) {
            sessionId = String(state);
          }
        }
      }
      
      // Try to extract from redirect URI
      if (!sessionId) {
        try {
          const redirectUrl = new URL(String(redirect_uri));
          sessionId = redirectUrl.searchParams.get('session_id') || 
                     redirectUrl.searchParams.get('sessionId') ||
                     redirectUrl.pathname.match(/session[_-]([a-zA-Z0-9-]+)/)?.[1];
        } catch {}
      }
      
      // Try from query params
      if (!sessionId && req.query.session_id) {
        sessionId = String(req.query.session_id);
      }
      
      // For web flow, redirect to API key input page
      const apiKeyInputUrl = new URL('/oauth/api-key-input', baseUrl);
      apiKeyInputUrl.searchParams.set('client_id', String(client_id));
      apiKeyInputUrl.searchParams.set('redirect_uri', String(redirect_uri));
      if (state) apiKeyInputUrl.searchParams.set('state', String(state));
      apiKeyInputUrl.searchParams.set('response_type', String(response_type));
      if (scope) apiKeyInputUrl.searchParams.set('scope', String(scope));
      if (code_challenge) apiKeyInputUrl.searchParams.set('code_challenge', String(code_challenge));
      if (code_challenge_method) apiKeyInputUrl.searchParams.set('code_challenge_method', String(code_challenge_method));
      if (sessionId) apiKeyInputUrl.searchParams.set('session_id', sessionId);
      
      res.redirect(apiKeyInputUrl.toString());
    } catch (error) {
      res.status(500).json({
        error: 'server_error',
        error_description: 'Authorization failed'
      });
    }
  });

  // API Key input page (simple HTML form)
  router.get('/oauth/api-key-input', (req: Request, res: Response) => {
    const { client_id, redirect_uri, state, response_type, scope, code_challenge, code_challenge_method, session_id } = req.query;
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Twenty CRM API Key Authentication</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 500px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          h1 {
            color: #333;
            margin-bottom: 20px;
          }
          .form-group {
            margin-bottom: 20px;
          }
          label {
            display: block;
            margin-bottom: 5px;
            color: #666;
          }
          input[type="password"] {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 16px;
            box-sizing: border-box;
          }
          button {
            background: #4CAF50;
            color: white;
            padding: 12px 30px;
            border: none;
            border-radius: 4px;
            font-size: 16px;
            cursor: pointer;
            width: 100%;
          }
          button:hover {
            background: #45a049;
          }
          .info {
            background: #e3f2fd;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
            color: #1976d2;
          }
          .error {
            background: #ffebee;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
            color: #c62828;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Twenty CRM Authentication</h1>
          <div class="info">
            Enter your Twenty CRM API key to authorize access. Your API key will be securely stored.
          </div>
          <form method="POST" action="/oauth/api-key-submit">
            <input type="hidden" name="client_id" value="${client_id}">
            <input type="hidden" name="redirect_uri" value="${redirect_uri}">
            ${state ? `<input type="hidden" name="state" value="${state}">` : ''}
            <input type="hidden" name="response_type" value="${response_type}">
            <input type="hidden" name="scope" value="${scope || 'read write'}">
            ${code_challenge ? `<input type="hidden" name="code_challenge" value="${code_challenge}">` : ''}
            ${code_challenge_method ? `<input type="hidden" name="code_challenge_method" value="${code_challenge_method}">` : ''}
            ${session_id ? `<input type="hidden" name="session_id" value="${session_id}">` : ''}
            <div class="form-group">
              <label for="api_key">API Key:</label>
              <input type="password" id="api_key" name="api_key" required 
                     placeholder="Enter your Twenty CRM API key" autofocus>
            </div>
            <button type="submit">Authorize Access</button>
          </form>
        </div>
      </body>
      </html>
    `);
  });

  // Handle API key submission
  router.post('/oauth/api-key-submit', express.urlencoded({ extended: true }), async (req: Request, res: Response) => {
    const { api_key, client_id, redirect_uri, state, response_type, code_challenge, code_challenge_method, session_id } = req.body;
    
    if (!api_key) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'API key is required'
      });
    }
    
    try {
      // Validate API key
      await provider.verifyAccessToken(api_key);
      
      const redirectUrl = new URL(redirect_uri);
      let code = '';
      
      if (response_type === 'code') {
        // Authorization code flow
        code = randomUUID();
        provider.storeAuthorizationCode(code, api_key, client_id, session_id);
        
        // If we have a session ID, link it immediately
        if (session_id) {
          provider.linkSessionToApiKey(session_id, api_key);
        }
        
        // Set a secure cookie with the session ID
        res.cookie('mcp_session', session_id || randomUUID(), {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
        
        redirectUrl.searchParams.set('code', code);
        if (state) redirectUrl.searchParams.set('state', state);
      } else if (response_type === 'token') {
        // Implicit flow (not recommended but supported)
        redirectUrl.searchParams.set('access_token', api_key);
        redirectUrl.searchParams.set('token_type', 'Bearer');
        redirectUrl.searchParams.set('expires_in', '86400');
        if (state) redirectUrl.searchParams.set('state', state);
      }
      
      // For MCP Inspector compatibility, show success page with instructions
      if (redirect_uri.includes('localhost:6274') || redirect_uri.includes('debug')) {
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Authentication Successful</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                max-width: 800px;
                margin: 50px auto;
                padding: 20px;
                background: #f5f5f5;
              }
              .container {
                background: white;
                padding: 30px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
              h1 { color: #4CAF50; }
              .token-box {
                background: #f5f5f5;
                padding: 15px;
                border-radius: 4px;
                font-family: monospace;
                word-break: break-all;
                margin: 20px 0;
              }
              .instructions {
                background: #e3f2fd;
                padding: 20px;
                border-radius: 4px;
                margin: 20px 0;
              }
              .step { margin: 10px 0; }
              button {
                background: #2196F3;
                color: white;
                padding: 10px 20px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
              }
              button:hover { background: #1976D2; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>✅ Authentication Successful!</h1>
              <p>Your OAuth authentication was successful. However, MCP Inspector requires one more step.</p>
              
              <div class="instructions">
                <h3>Next Steps for MCP Inspector:</h3>
                <div class="step">1. <strong>Disconnect</strong> your current connection in MCP Inspector</div>
                <div class="step">2. <strong>Connect again</strong> with these settings:</div>
                <ul>
                  <li>Transport: <strong>HTTP</strong></li>
                  <li>URL: <strong>${options.baseUrl}/mcp</strong></li>
                  <li>Click "Headers" and add:</li>
                </ul>
                <div class="step">3. <strong>Add this Authorization header:</strong></div>
              </div>
              
              <div class="token-box">
                Authorization: Bearer ${api_key}
              </div>
              
              <button onclick="copyToClipboard()">Copy Authorization Header</button>
              
              <p style="margin-top: 20px; color: #666;">
                <strong>Why this extra step?</strong> MCP Inspector's OAuth implementation doesn't automatically 
                apply the received token to subsequent requests. This is a known limitation.
              </p>
              
              <hr style="margin: 30px 0;">
              
              <details>
                <summary>Technical Details</summary>
                <pre style="background: #f5f5f5; padding: 10px; overflow: auto;">
Authorization Code: ${code}
State: ${state || 'none'}
Session ID: ${session_id || 'none'}
                </pre>
              </details>
            </div>
            
            <script>
              function copyToClipboard() {
                navigator.clipboard.writeText('Authorization: Bearer ${api_key}');
                alert('Authorization header copied to clipboard!');
              }
              
              // Auto-redirect after showing the message
              setTimeout(() => {
                window.location.href = '${redirectUrl.toString()}';
              }, 10000); // 10 seconds
            </script>
          </body>
          </html>
        `);
      } else {
        // Normal redirect for other clients
        res.redirect(redirectUrl.toString());
      }
    } catch (error) {
      // Show error page
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Failed</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 500px;
              margin: 50px auto;
              padding: 20px;
              background: #f5f5f5;
            }
            .container {
              background: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            h1 { color: #c62828; }
            .error { color: #666; margin: 20px 0; }
            a {
              display: inline-block;
              background: #2196F3;
              color: white;
              padding: 10px 20px;
              text-decoration: none;
              border-radius: 4px;
              margin-top: 20px;
            }
            a:hover { background: #1976D2; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Authentication Failed</h1>
            <p class="error">The API key you provided is invalid. Please check your key and try again.</p>
            <a href="javascript:history.back()">Go Back</a>
          </div>
        </body>
        </html>
      `);
    }
  });

  // Token endpoint
  router.post('/oauth/token', express.urlencoded({ extended: true }), async (req: Request, res: Response) => {
    try {
      const token = await provider.token(req.body);
      
      // Try to link session from cookie or custom header
      const sessionId = req.cookies?.mcp_session || 
                       req.headers['x-mcp-session-id'] as string;
      
      if (sessionId && token.access_token) {
        provider.linkSessionToApiKey(sessionId, token.access_token);
        
        // Set/refresh cookie
        res.cookie('mcp_session', sessionId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
      }
      
      res.json(token);
    } catch (error) {
      res.status(400).json({
        error: 'invalid_grant',
        error_description: error instanceof Error ? error.message : 'Token generation failed'
      });
    }
  });

  // Direct API key exchange endpoint (custom extension)
  router.post('/oauth/api-key', express.json(), async (req: Request, res: Response) => {
    const { api_key } = req.body;
    
    if (!api_key) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'API key is required'
      });
    }
    
    try {
      const token = await provider.token({
        grant_type: 'api_key',
        api_key
      });
      res.json(token);
    } catch (error) {
      res.status(401).json({
        error: 'invalid_client',
        error_description: 'Invalid API key'
      });
    }
  });

  return router;
} 