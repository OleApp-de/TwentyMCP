import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TwentyCRMClient } from '../twenty-client.js';
import { z } from 'zod';
import { Logger } from 'winston';

export function registerSimpleTools(
  server: McpServer,
  getClient: (sessionId?: string) => TwentyCRMClient,
  logger: Logger
): void {
  
  // List users (people) tool
  server.registerTool(
    'list_users',
    {
      description: 'List all users/people in Twenty CRM',
      inputSchema: {
        limit: z.number().optional().describe('Maximum number of users to return (default: 20)')
      }
    },
    async ({ limit = 20 }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        const cappedLimit = Math.min(limit, 100); // Cap at 100
        
        logger.info(`Listing users with limit: ${cappedLimit}`);
        
        const response = await client.findManyPeople({ limit: cappedLimit });
        
        if (!response.data?.people) {
          throw new Error('No people data in response');
        }
        
        const users = response.data.people;
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              users,
              pagination: {
                total: response.totalCount,
                limit: cappedLimit,
                returned: users.length
              }
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error listing users:', error);
        
        return {
          content: [{
            type: 'text',
            text: `Error listing users: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // Create user tool
  server.registerTool(
    'create_user',
    {
      description: 'Create a new user/person in Twenty CRM',
      inputSchema: {
        firstName: z.string().describe('First name of the person'),
        lastName: z.string().describe('Last name of the person'),
        email: z.string().email().optional().describe('Email address'),
        phone: z.string().optional().describe('Phone number')
      }
    },
    async ({ firstName, lastName, email, phone }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        const personData = {
          name: {
            firstName,
            lastName
          },
          ...(email && { email }),
          ...(phone && { phone })
        };
        
        logger.info(`Creating user: ${firstName} ${lastName}`);
        
        const response = await client.createOnePerson(personData);
        
        if (!response.data?.people) {
          throw new Error('Failed to create person');
        }
        
        const createdUser = response.data.people;
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'User created successfully',
              user: createdUser
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error creating user:', error);
        
        return {
          content: [{
            type: 'text',
            text: `Error creating user: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // Get server tools info
  server.registerTool(
    'get_tools',
    {
      description: 'Get list of available tools and their descriptions',
      inputSchema: {}
    },
    async () => {
      const toolsInfo = {
        available_tools: [
          {
            name: 'list_users',
            description: 'List all users/people in Twenty CRM',
            parameters: ['limit (optional)', 'offset (optional)']
          },
          {
            name: 'create_user',
            description: 'Create a new user/person in Twenty CRM',
            parameters: ['firstName', 'lastName', 'email (optional)', 'phone (optional)']
          },
          {
            name: 'get_tools',
            description: 'Get list of available tools and their descriptions',
            parameters: []
          },
          {
            name: 'authenticate',
            description: 'Set API key for Twenty CRM authentication (required for each session)',
            parameters: ['apiKey']
          },
          {
            name: 'get-server-info',
            description: 'Get information about the MCP server',
            parameters: []
          }
        ],
        total_tools: 5,
        authentication_required: true,
        oauth_enabled: true
      };
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(toolsInfo, null, 2)
        }]
      };
    }
  );
} 