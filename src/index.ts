import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import winston from 'winston';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { TwentyCRMClient } from './twenty-client.js';
import { registerPeopleTools } from './tools/people.js';
import { registerCompanyTools } from './tools/companies.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerNoteTools } from './tools/notes.js';
import { registerOpportunityTools } from './tools/opportunities.js';
import { ApiKeyOAuthProvider, createOAuthMiddleware } from './auth/api-key-oauth-provider.js';
import { createApiKeyOAuthRouter } from './auth/api-key-oauth-router.js';

dotenv.config();

// Transport type
type TransportType = 'stdio' | 'sse' | 'streamable-http';

// Determine transport from CLI args
const transport: TransportType = (process.argv[2] as TransportType) || 'stdio';
const sessions = new Map<string, Session>();

// Logger setup - nur für HTTP-Modi, nicht für stdio
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: transport === 'stdio' ? [] : [
    new winston.transports.Console({
      format: winston.format.simple(),
      stderrLevels: ['error', 'warn', 'info', 'debug'] // Alles auf stderr
    })
  ]
});

// Session management
interface Session {
  apiKey: string;
  userId?: string;
  client: TwentyCRMClient;
}

// Global authenticated clients - nicht session-basiert für Bearer tokens
const authenticatedClients = new Map<string, TwentyCRMClient>();

// Create and configure MCP server
function createMcpServer(defaultClient?: TwentyCRMClient): McpServer {
  const server = new McpServer({
    name: 'twenty-crm-mcp',
    version: '1.0.0'
  });

  // Register server info tool
  server.registerTool(
    'get-server-info',
    {
      description: 'Get information about the MCP server',
      inputSchema: {}
    },
    async () => ({
      content: [{
        type: 'text',
        text: JSON.stringify({
          name: 'twenty-crm-mcp',
          version: '1.0.0',
          transport,
          capabilities: ['people', 'companies', 'tasks', 'notes', 'opportunities'],
          multiUser: true,
          requiresAuthentication: true,
          authMethods: ['api-key-tool', 'oauth-bearer'],
          oauthEnabled: true,
          endpoints: {
            oauth_metadata: '/.well-known/oauth-protected-resource',
            oauth_register: '/oauth/register',
            oauth_authorize: '/oauth/authorize',
            oauth_token: '/oauth/token'
          }
        }, null, 2)
      }]
    })
  );

  // Register authentication tool (REQUIRED for multi-user)
  server.registerTool(
    'authenticate',
    {
      description: 'Set API key for Twenty CRM authentication (REQUIRED for each user session)',
      inputSchema: {
        apiKey: z.string().describe('Twenty CRM API key (Bearer token)')
      }
    },
    async ({ apiKey }, extra) => {
      // Use request ID or generate session ID for multi-user
      const sessionId = String(extra?.requestId || 'default');
      const client = new TwentyCRMClient(apiKey, logger);
      
      // Test the API key
      try {
        await client.testConnection();
        sessions.set(sessionId, { apiKey, client });
        
        return {
          content: [{
            type: 'text',
            text: `Authentication successful! Session ${sessionId} is now authenticated. You can now use Twenty CRM tools.`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // Helper to get client from session OR default client (for Bearer auth)
  const getClient = (sessionId: string = 'default'): TwentyCRMClient => {
    // First try session-based client
    const session = sessions.get(sessionId);
    if (session) {
      return session.client;
    }
    
    // Then try default client (for Bearer token auth)
    if (defaultClient) {
      return defaultClient;
    }
    
    throw new Error(`Not authenticated. Please use Bearer token authentication or the authenticate tool first. Session: ${sessionId}`);
  };

  // Register all tool categories
  registerPeopleTools(server, getClient, logger);
  registerCompanyTools(server, getClient, logger);
  registerTaskTools(server, getClient, logger);
  registerNoteTools(server, getClient, logger);
  registerOpportunityTools(server, getClient, logger);

  return server;
}

// Main function based on transport
async function main() {
  logger.info(`Starting Twenty CRM MCP Server with ${transport} transport`);

  if (transport === 'stdio') {
    // STDIO transport
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    
    await server.connect(transport);
    logger.info('Twenty CRM MCP Server running on stdio');
    
  } else if (transport === 'sse' || transport === 'streamable-http') {
    // HTTP-based transports
    const app = express();
    app.use(express.json());
    app.use(cookieParser(process.env.SESSION_SECRET || 'dev-secret-change-in-production'));
    
    // CORS configuration for production
    const corsOptions = {
      origin: (origin: any, callback: any) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        
        // In production, you might want to restrict this
        // For now, allow all origins but log them
        logger.debug(`CORS request from origin: ${origin}`);
        callback(null, true);
      },
      credentials: true,
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'mcp-session-id'],
      exposedHeaders: ['Set-Cookie']
    };
    
    app.use(cors(corsOptions));
    
    // Initialize OAuth provider
    const oauthProvider = new ApiKeyOAuthProvider(logger);
    
    // Setup OAuth routes
    const baseUrl = new URL(process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`);
    const oauthRouter = createApiKeyOAuthRouter({
      provider: oauthProvider,
      issuerUrl: baseUrl,
      baseUrl,
      serviceDocumentationUrl: new URL('https://docs.twenty.com/mcp')
    });
    app.use(oauthRouter);
    
    // Store SSE transports only
    const sseTransports: Record<string, SSEServerTransport> = {};
    
    if (transport === 'streamable-http') {
      // Streamable HTTP endpoint with OAuth support
      app.all('/mcp', async (req, res) => {
        logger.info(`Received ${req.method} request to /mcp`);
        
        try {
          // Try OAuth authentication
          const authHeader = req.headers.authorization;
          // Try to get session ID from various sources
          let sessionId = req.headers['mcp-session-id'] as string || 
                        req.cookies?.mcp_session ||
                        randomUUID();
          let authenticated = false;
          let defaultClient: TwentyCRMClient | undefined;
          
          logger.debug('MCP Request details:', {
            method: req.method,
            authorization: authHeader ? 'Bearer ***' : 'none',
            'mcp-session-id': sessionId,
            'cookie-session': req.cookies?.mcp_session || 'none',
            'content-type': req.headers['content-type'],
            'user-agent': req.headers['user-agent']
          });
          
          // Check Bearer token authentication first (works independently of sessions)
          if (authHeader?.startsWith('Bearer ')) {
            try {
              const token = authHeader.substring(7);
              logger.debug('Validating OAuth/Bearer token...');
              
              // Try OAuth token first
              try {
                const tokenInfo = await oauthProvider.verifyAccessToken(token);
                defaultClient = new TwentyCRMClient(tokenInfo.twentyApiKey, logger);
                await defaultClient.testConnection(); // Verify it works
                authenticated = true;
                logger.info(`OAuth authentication successful for session: ${sessionId}`);
              } catch (oauthError) {
                // If OAuth fails, try direct API key
                logger.debug('OAuth token validation failed, trying direct API key...');
                defaultClient = new TwentyCRMClient(token, logger);
                await defaultClient.testConnection(); // Verify it works
                authenticated = true;
                logger.info(`Direct API key authentication successful for session: ${sessionId}`);
              }
            } catch (error) {
              logger.warn('Bearer token authentication failed:', error);
              defaultClient = undefined;
            }
          }
          
          // Fall back to session-based authentication
          if (!authenticated) {
            const sessionApiKey = oauthProvider.getApiKeyForSession(sessionId);
            if (sessionApiKey) {
              logger.info('Found linked session:', sessionId);
              if (!sessions.has(sessionId)) {
                const client = new TwentyCRMClient(sessionApiKey, logger);
                sessions.set(sessionId, {
                  apiKey: sessionApiKey,
                  userId: `session-${sessionId}`,
                  client
                });
              }
              authenticated = true;
              
              // Set/refresh cookie
              res.cookie('mcp_session', sessionId, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 24 * 60 * 60 * 1000 // 24 hours
              });
            } else {
              logger.debug('No authentication found for session:', sessionId);
            }
          }
          
          let transport: StreamableHTTPServerTransport;
          let server: McpServer;
          
          // Always create new server and transport for each request
          // This ensures proper initialization and avoids session conflicts
          if (defaultClient) {
            // Bearer token auth - create server with authenticated client
            server = createMcpServer(defaultClient);
          } else {
            // No auth - create server without client
            server = createMcpServer();
          }
          
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => sessionId
          });
          
          await server.connect(transport);
          await transport.handleRequest(req, res, req.body);
        } catch (error) {
          logger.error('Error handling MCP request:', error);
          if (!res.headersSent) {
            res.status(500).json({
              jsonrpc: '2.0',
              error: {
                code: -32603,
                message: 'Internal server error'
              },
              id: null
            });
          }
        }
      });
      
    } else {
      // SSE transport (deprecated but supported for backwards compatibility)
      app.get('/sse', async (req, res) => {
        logger.info('Received GET request to /sse');
        
        // Check for Bearer token authentication
        const authHeader = req.headers.authorization;
        let defaultClient: TwentyCRMClient | undefined;
        
        if (authHeader?.startsWith('Bearer ')) {
          try {
            const token = authHeader.substring(7);
            logger.debug('Validating OAuth/Bearer token for SSE...');
            
            // Try OAuth token first
            try {
              const tokenInfo = await oauthProvider.verifyAccessToken(token);
              defaultClient = new TwentyCRMClient(tokenInfo.twentyApiKey, logger);
              await defaultClient.testConnection(); // Verify it works
              logger.info(`OAuth authentication successful for SSE`);
            } catch (oauthError) {
              // If OAuth fails, try direct API key
              logger.debug('OAuth token validation failed, trying direct API key...');
              defaultClient = new TwentyCRMClient(token, logger);
              await defaultClient.testConnection(); // Verify it works
              logger.info(`Direct API key authentication successful for SSE`);
            }
          } catch (error) {
            logger.warn('Bearer token authentication failed for SSE:', error);
            defaultClient = undefined;
          }
        }
        
        // Create server with or without defaultClient
        const server = createMcpServer(defaultClient);
        const transport = new SSEServerTransport('/messages', res);
        const sessionId = transport.sessionId;
        
        if (sessionId) {
          sseTransports[sessionId] = transport;
          
          res.on('close', () => {
            delete sseTransports[sessionId];
            sessions.delete(sessionId);
          });
        }
        
        await server.connect(transport);
      });
      
      app.post('/messages', async (req, res) => {
        const sessionId = req.query.sessionId as string;
        const transport = sseTransports[sessionId];
        
        if (transport && transport instanceof SSEServerTransport) {
          await transport.handlePostMessage(req, res, req.body);
        } else {
          res.status(400).send('No transport found for sessionId');
        }
      });
    }
    
    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', transport, sessions: sessions.size });
    });
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      logger.info(`Twenty CRM MCP Server listening on port ${PORT}`);
      logger.info('OAuth enabled with API Key authentication');
      
      if (transport === 'streamable-http') {
        logger.info('Endpoints:');
        logger.info(`  - MCP: POST/GET/DELETE http://localhost:${PORT}/mcp`);
        logger.info(`  - OAuth Metadata: GET http://localhost:${PORT}/.well-known/oauth-protected-resource`);
        logger.info(`  - OAuth Register: POST http://localhost:${PORT}/oauth/register`);
        logger.info(`  - OAuth Authorize: GET http://localhost:${PORT}/oauth/authorize`);
        logger.info(`  - OAuth Token: POST http://localhost:${PORT}/oauth/token`);
      } else {
        logger.info('SSE endpoints:');
        logger.info(`  - SSE stream: GET http://localhost:${PORT}/sse`);
        logger.info(`  - Messages: POST http://localhost:${PORT}/messages?sessionId=<id>`);
      }
      logger.info(`  - Health check: GET http://localhost:${PORT}/health`);
    });
    
  } else {
    logger.error(`Unknown transport: ${transport}`);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  logger.info('Shutting down Twenty CRM MCP Server...');
  process.exit(0);
});

// Start the server
main().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});