import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import winston from 'winston';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { TwentyCRMClient } from './twenty-client.js';
import { registerSimpleTools } from './tools/simple-tools.js';
import { initializeDatabase } from './auth/database.js';
import { oauthRouter, validateOAuthToken, AuthenticatedRequest } from './auth/oauth.js';
import { adminRouter } from './auth/admin-api.js';

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
      stderrLevels: ['error', 'warn', 'info', 'debug']
    })
  ]
});

// Session management
interface Session {
  apiKey: string;
  userId?: string;
  client: TwentyCRMClient;
}

// Create and configure MCP server
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'twenty-crm-mcp-oauth',
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
          name: 'twenty-crm-mcp-oauth',
          version: '1.0.0',
          transport,
          capabilities: ['people'],
          multiUser: true,
          requiresAuthentication: true,
          oauthEnabled: !!process.env.STYTCH_PROJECT_ID,
          endpoints: {
            oauth_metadata: '/.well-known/oauth-protected-resource',
            admin_api: '/admin',
            health: '/admin/health'
          }
        }, null, 2)
      }]
    })
  );

  // Register authentication tool (for backwards compatibility with API key auth)
  server.registerTool(
    'authenticate',
    {
      description: 'Set API key for Twenty CRM authentication (REQUIRED for stdio mode)',
      inputSchema: {
        apiKey: z.string().describe('Twenty CRM API key (Bearer token)')
      }
    },
    async ({ apiKey }: { apiKey: string }, extra) => {
      const sessionId = String(extra?.requestId || 'default');
      const client = new TwentyCRMClient(apiKey, logger);
      
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

  // Helper to get client from session
  const getClient = (sessionId: string = 'default'): TwentyCRMClient => {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error(`Not authenticated. Please use the authenticate tool first. Session: ${sessionId}`);
    }
    return session.client;
  };

  // Register simplified tools
  registerSimpleTools(server, getClient, logger);

  return server;
}

// Helper to create authenticated client from request
function createClientFromRequest(req: AuthenticatedRequest): TwentyCRMClient {
  return new TwentyCRMClient(req.twentyApiKey, logger);
}

// Main function based on transport
async function main() {
  // Initialize database for OAuth
  if (process.env.STYTCH_PROJECT_ID) {
    await initializeDatabase();
    logger.info('OAuth database initialized');
  }

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
    
    // Add OAuth endpoints first
    app.use(oauthRouter);
    
    // Add admin API
    app.use('/admin', adminRouter);
    
    // Store transports
    const transports: Record<string, StreamableHTTPServerTransport | SSEServerTransport> = {};
    
    if (transport === 'streamable-http') {
      // Streamable HTTP endpoint with OAuth support
      app.all('/mcp', async (req, res) => {
        logger.info(`Received ${req.method} request to /mcp`);
        
        try {
          // Check for OAuth token
          const authHeader = req.headers.authorization;
          let sessionId = req.headers['mcp-session-id'] as string;
          let authenticatedUser: { userId: string; twentyApiKey: string } | null = null;
          
          // Try OAuth authentication if token present
          if (authHeader?.startsWith('Bearer ')) {
            try {
              await validateOAuthToken(req, res, () => {});
              const authReq = req as AuthenticatedRequest;
              if (authReq.userId && authReq.twentyApiKey) {
                authenticatedUser = {
                  userId: authReq.userId,
                  twentyApiKey: authReq.twentyApiKey
                };
                sessionId = authReq.userId; // Use user ID as session ID for OAuth
              }
            } catch (error) {
              logger.warn('OAuth authentication failed, falling back to session-based auth');
            }
          }
          
          let transport: StreamableHTTPServerTransport;
          
          if (sessionId && transports[sessionId]) {
            transport = transports[sessionId] as StreamableHTTPServerTransport;
          } else {
            // Create new transport and server for new session
            const server = createMcpServer();
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => sessionId || randomUUID()
            });
            
            const newSessionId = transport.sessionId || sessionId || randomUUID();
            transports[newSessionId] = transport;
            
            // If OAuth authenticated, create session with client
            if (authenticatedUser) {
              const client = new TwentyCRMClient(authenticatedUser.twentyApiKey, logger);
              sessions.set(newSessionId, {
                apiKey: authenticatedUser.twentyApiKey,
                userId: authenticatedUser.userId,
                client
              });
            }
            
            res.on('close', () => {
              delete transports[newSessionId];
              sessions.delete(newSessionId);
            });
            
            await server.connect(transport);
          }
          
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
      
    } else if (transport === 'sse') {
      // SSE endpoint with OAuth support
      app.get('/mcp/sse', async (req, res) => {
        logger.info('New SSE connection');
        
        try {
          // Check for OAuth token
          const authHeader = req.headers.authorization;
          let authenticatedUser: { userId: string; twentyApiKey: string } | null = null;
          
          if (authHeader?.startsWith('Bearer ')) {
            try {
              await validateOAuthToken(req, res, () => {});
              const authReq = req as AuthenticatedRequest;
              if (authReq.userId && authReq.twentyApiKey) {
                authenticatedUser = {
                  userId: authReq.userId,
                  twentyApiKey: authReq.twentyApiKey
                };
              }
            } catch (error) {
              logger.warn('OAuth authentication failed for SSE');
              return res.status(401).json({ error: 'Authentication required' });
            }
          }
          
          const server = createMcpServer();
          const transport = new SSEServerTransport('/mcp/messages', res);
          const sessionId = randomUUID();
          
          // If OAuth authenticated, create session with client
          if (authenticatedUser) {
            const client = new TwentyCRMClient(authenticatedUser.twentyApiKey, logger);
            sessions.set(sessionId, {
              apiKey: authenticatedUser.twentyApiKey,
              userId: authenticatedUser.userId,
              client
            });
          }
          
          req.on('close', () => {
            sessions.delete(sessionId);
          });
          
          await server.connect(transport);
        } catch (error) {
          logger.error('Error handling SSE connection:', error);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
          }
        }
      });

      app.post('/mcp/messages', express.text(), async (req, res) => {
        // This would handle SSE messages - implementation depends on SSE setup
        res.status(200).send('OK');
      });
    }
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      logger.info(`Twenty CRM MCP Server running at http://localhost:${PORT}`);
      logger.info(`Transport: ${transport}`);
      if (process.env.STYTCH_PROJECT_ID) {
        logger.info(`OAuth metadata: http://localhost:${PORT}/.well-known/oauth-protected-resource`);
        logger.info(`Admin API: http://localhost:${PORT}/admin`);
      }
      logger.info(`Health check: http://localhost:${PORT}/admin/health`);
    });
  }
}

main().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
}); 