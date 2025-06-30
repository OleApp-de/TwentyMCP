import express, { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import winston from 'winston';
import cors from 'cors';

import { TwentyCRMClient } from './twenty-client.js';
import { registerPeopleTools } from './tools/people.js';
import { registerCompanyTools } from './tools/companies.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerTaskTargetTools } from './tools/task-targets.js';
import { registerNotesTools } from './tools/notes.js';
import { registerNoteTargetTools } from './tools/note-targets.js';
import { setupPromptHandlers } from './handlers.js';
import { ApiKeyOAuthProvider, createOAuthMiddleware } from './auth/api-key-oauth-provider.js';
import { createApiKeyOAuthRouter } from './auth/api-key-oauth-router.js';

dotenv.config();

// Transport type
type TransportType = 'stdio' | 'sse' | 'streamable-http';

// Determine transport from CLI args
const transport: TransportType = (process.argv[2] as TransportType) || 'stdio';

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

// Session management for per-session authentication
const sessions = new Map<string, { apiKey: string; client: TwentyCRMClient; userId?: string }>();

// Global authenticated client for Bearer token auth
let globalAuthenticatedClient: TwentyCRMClient | null = null;

// Request-scoped authentication for streamable-http
let currentRequestClient: TwentyCRMClient | null = null;

// Create and configure MCP server
const createServer = (authenticatedClient?: TwentyCRMClient) => {
  const server = new McpServer({
    name: 'twenty-crm-mcp',
    version: '1.0.0'
  }, { 
    capabilities: { 
      logging: {},
      prompts: {},
      resources: {}
    } 
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
          capabilities: ['people', 'companies', 'tasks', 'task-targets', 'notes', 'note-targets', 'prompts', 'resources'],
          multiUser: true,
          requiresAuthentication: true,
          authMethods: ['api-key-tool', 'oauth-bearer'],
          oauthEnabled: transport !== 'stdio',
          endpoints: transport !== 'stdio' ? {
            oauth_metadata: '/.well-known/oauth-protected-resource',
            oauth_register: '/oauth/register',
            oauth_authorize: '/oauth/authorize',
            oauth_token: '/oauth/token'
          } : null
        }, null, 2)
      }]
    })
  );


  // Helper to get client
  const getClient = (sessionId: string = 'default'): TwentyCRMClient => {
    logger.debug(`getClient called with sessionId: ${sessionId}`, {
      hasAuthenticatedClient: !!authenticatedClient,
      hasCurrentRequestClient: !!currentRequestClient,
      sessionsCount: sessions.size,
      sessionExists: sessions.has(sessionId)
    });
    
    // Try authenticated client first (Bearer token pre-auth)
    if (authenticatedClient) {
      logger.debug('Using pre-authenticated client');
      return authenticatedClient;
    }
    
    // Try current request client (for streamable-http OAuth)
    if (currentRequestClient) {
      logger.debug('Using current request client');
      return currentRequestClient;
    }
    
    // Then try session-based client
    const session = sessions.get(sessionId);
    if (session) {
      logger.debug(`Using session-based client for session: ${sessionId}`);
      return session.client;
    }
    
    // Try to find any session with a client (fallback)
    for (const [sid, sessionData] of sessions.entries()) {
      logger.debug(`Found session ${sid} with client`);
      return sessionData.client;
    }
    
    logger.error(`No authentication found`, {
      sessionId,
      sessionsAvailable: Array.from(sessions.keys()),
      hasCurrentRequestClient: !!currentRequestClient,
      hasAuthenticatedClient: !!authenticatedClient
    });
    
    throw new Error(`Not authenticated. Please use Bearer token authentication or the authenticate tool first. Session: ${sessionId}`);
  };

  // Register all tool categories
  registerPeopleTools(server, getClient, logger);
  registerCompanyTools(server, getClient, logger);
  registerTaskTools(server, getClient, logger);
  registerTaskTargetTools(server, getClient, logger);
  registerNotesTools(server, getClient, logger);
  registerNoteTargetTools(server, getClient, logger);

  // Register prompt and resource handlers
  setupPromptHandlers(server);

  return server;
};

const MCP_PORT = parseInt(process.env.PORT || '3000');

// Main function based on transport
async function main() {
  logger.info(`Starting Twenty CRM MCP Server with ${transport} transport`);

  if (transport === 'stdio') {
    // STDIO transport
    const apiKey = process.env.TWENTY_API_KEY;
    let authenticatedClient: TwentyCRMClient | undefined;
    
    if (apiKey) {
      authenticatedClient = new TwentyCRMClient(apiKey, logger);
      try {
        await authenticatedClient.testConnection();
        logger.info('Pre-authenticated with API key from environment');
      } catch (error) {
        logger.warn('API key from environment is invalid, will require authenticate tool');
        authenticatedClient = undefined;
      }
    }
    
    const server = createServer(authenticatedClient);
    const transport = new StdioServerTransport();
    
    await server.connect(transport);
    logger.info('Twenty CRM MCP Server running on stdio');
    
     } else if (transport === 'sse') {
     // SSE transport
     const app = express();
     app.use(express.json());
     app.use(cors({
       origin: true,
       credentials: true,
       methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
       allowedHeaders: ['Content-Type', 'Authorization', 'mcp-session-id']
     }));
     
     // Initialize OAuth provider and middleware
     const oauthProvider = new ApiKeyOAuthProvider(logger);
     const oauthMiddleware = createOAuthMiddleware(oauthProvider);
     
     // Setup OAuth routes
     const baseUrl = new URL(process.env.BASE_URL || `http://localhost:${MCP_PORT}`);
     const oauthRouter = createApiKeyOAuthRouter({
       provider: oauthProvider,
       issuerUrl: baseUrl,
       baseUrl,
       serviceDocumentationUrl: new URL('https://docs.twenty.com/mcp')
     });
    app.use(oauthRouter);
    
    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ status: 'healthy', transport: 'sse' });
    });
    
         // SSE endpoint with OAuth middleware
     app.get('/sse', oauthMiddleware, async (req: Request, res: Response) => {
       // Create authenticated client from OAuth middleware result
       let authenticatedClient: TwentyCRMClient | undefined;
       const authData = (req as any).authenticatedClient;
       if (authData?.apiKey) {
         authenticatedClient = new TwentyCRMClient(authData.apiKey, logger);
       }
       
       const server = createServer(authenticatedClient);
       const transport = new SSEServerTransport('/sse', res);
       
       await server.connect(transport);
     });
    
    app.listen(MCP_PORT, () => {
      logger.info(`Twenty CRM MCP Server listening on port ${MCP_PORT}`);
      logger.info('OAuth enabled with API Key authentication');
      logger.info('Endpoints:');
      logger.info(`  - SSE: GET http://localhost:${MCP_PORT}/sse`);
      logger.info(`  - OAuth Metadata: GET http://localhost:${MCP_PORT}/.well-known/oauth-protected-resource`);
      logger.info(`  - OAuth Register: POST http://localhost:${MCP_PORT}/oauth/register`);
      logger.info(`  - OAuth Authorize: GET http://localhost:${MCP_PORT}/oauth/authorize`);
      logger.info(`  - OAuth Token: POST http://localhost:${MCP_PORT}/oauth/token`);
      logger.info(`  - Health check: GET http://localhost:${MCP_PORT}/health`);
    });
    
     } else if (transport === 'streamable-http') {
     // Streamable HTTP transport (nach SDK-Pattern)
     const app = express();
     app.use(express.json());
     app.use(cors({
       origin: true,
       credentials: true,
       methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
       allowedHeaders: ['Content-Type', 'Authorization', 'mcp-session-id', 'Last-Event-ID']
     }));
     
     // Initialize OAuth provider and middleware
     const oauthProvider = new ApiKeyOAuthProvider(logger);
     const oauthMiddleware = createOAuthMiddleware(oauthProvider);
     
     // Setup OAuth routes
     const baseUrl = new URL(process.env.BASE_URL || `http://localhost:${MCP_PORT}`);
     const oauthRouter = createApiKeyOAuthRouter({
       provider: oauthProvider,
       issuerUrl: baseUrl,
       baseUrl,
       serviceDocumentationUrl: new URL('https://docs.twenty.com/mcp')
     });
    app.use(oauthRouter);
    
    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ status: 'healthy', transport: 'streamable-http' });
    });
    
    // Map to store transports by session ID (nach SDK-Pattern)
    const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
    
              // MCP POST endpoint with OAuth middleware
     const mcpPostHandler = async (req: Request, res: Response) => {
       const sessionId = req.headers['mcp-session-id'] as string | undefined;
       logger.info(sessionId ? `Received POST request to /mcp` : 'Received POST request to /mcp');
       
       // Store OAuth authentication in session for reuse
       const authData = (req as any).authenticatedClient;
       if (authData?.apiKey && sessionId) {
         // Store the API key in the sessions map so getClient() can find it
         const client = new TwentyCRMClient(authData.apiKey, logger);
         sessions.set(sessionId, { 
           apiKey: authData.apiKey, 
           client, 
           userId: (req as any).userId 
         });
         // Set as current request client for this request
         currentRequestClient = client;
         logger.info(`OAuth authentication successful for session ${sessionId}`);
       }
       
       try {
         let transport: StreamableHTTPServerTransport;
         
         if (sessionId && transports[sessionId]) {
           // Reuse existing transport
           transport = transports[sessionId];
         } else if (!sessionId && isInitializeRequest(req.body)) {
           // New initialization request
           transport = new StreamableHTTPServerTransport({
             sessionIdGenerator: () => randomUUID(),
             onsessioninitialized: (sessionId) => {
               logger.info(`Session initialized with ID: ${sessionId}`);
               transports[sessionId] = transport;
               
               // Store OAuth auth for the new session if available
               if (authData?.apiKey) {
                 const client = new TwentyCRMClient(authData.apiKey, logger);
                 sessions.set(sessionId, { 
                   apiKey: authData.apiKey, 
                   client, 
                   userId: (req as any).userId 
                 });
                 // Set as current request client for this request
                 currentRequestClient = client;
                 logger.info(`OAuth authentication successful for new session ${sessionId}`);
               }
             }
           });
           
           // Set up onclose handler to clean up transport
           transport.onclose = () => {
             const sid = transport.sessionId;
             if (sid && transports[sid]) {
               logger.info(`Transport closed for session ${sid}, removing from transports map`);
               delete transports[sid];
               sessions.delete(sid);
             }
           };
           
           // Connect the transport to the MCP server
           const server = createServer();
           await server.connect(transport);
           
           await transport.handleRequest(req, res, req.body);
           return;
         } else {
           // Invalid request
           res.status(400).json({
             jsonrpc: '2.0',
             error: {
               code: -32000,
               message: 'Bad Request: No valid session ID provided',
             },
             id: null,
           });
           return;
         }
         
                  // Handle the request with existing transport
         await transport.handleRequest(req, res, req.body);
       } catch (error) {
         logger.error('Error handling MCP request:', error);
         if (!res.headersSent) {
           res.status(500).json({
             jsonrpc: '2.0',
             error: {
               code: -32603,
               message: 'Internal server error',
             },
             id: null,
           });
         }
       } finally {
         // Reset current request client after each request
         currentRequestClient = null;
       }
     };
    
    // MCP GET endpoint for SSE streams
    const mcpGetHandler = async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      
      // Check for Last-Event-ID header for resumability
      const lastEventId = req.headers['last-event-id'] as string | undefined;
      if (lastEventId) {
        logger.info(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
      } else {
        logger.info(`Establishing new SSE stream for session ${sessionId}`);
      }
      
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    };
    
    // MCP DELETE endpoint for session termination
    const mcpDeleteHandler = async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      
      logger.info(`Received DELETE request to /mcp`);
      
      try {
        const transport = transports[sessionId];
        await transport.handleRequest(req, res);
      } catch (error) {
        logger.error('Error handling session termination:', error);
        if (!res.headersSent) {
          res.status(500).send('Error processing session termination');
        }
      }
    };
    
    // Setup routes with OAuth middleware
    app.post('/mcp', oauthMiddleware, mcpPostHandler);
    app.get('/mcp', oauthMiddleware, mcpGetHandler);
    app.delete('/mcp', oauthMiddleware, mcpDeleteHandler);
    
    app.listen(MCP_PORT, () => {
      logger.info(`Twenty CRM MCP Server listening on port ${MCP_PORT}`);
      logger.info('OAuth enabled with API Key authentication');
      logger.info('Endpoints:');
      logger.info(`  - MCP: POST/GET/DELETE http://localhost:${MCP_PORT}/mcp`);
      logger.info(`  - OAuth Metadata: GET http://localhost:${MCP_PORT}/.well-known/oauth-protected-resource`);
      logger.info(`  - OAuth Register: POST http://localhost:${MCP_PORT}/oauth/register`);
      logger.info(`  - OAuth Authorize: GET http://localhost:${MCP_PORT}/oauth/authorize`);
      logger.info(`  - OAuth Token: POST http://localhost:${MCP_PORT}/oauth/token`);
      logger.info(`  - Health check: GET http://localhost:${MCP_PORT}/health`);
    });
    
    // Handle server shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down Twenty CRM MCP Server...');
      
      // Close all active transports
      for (const sessionId in transports) {
        try {
          logger.info(`Closing transport for session ${sessionId}`);
          await transports[sessionId].close();
          delete transports[sessionId];
        } catch (error) {
          logger.error(`Error closing transport for session ${sessionId}:`, error);
        }
      }
      logger.info('Server shutdown complete');
      process.exit(0);
    });
  }
}

// Start the server
main().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});