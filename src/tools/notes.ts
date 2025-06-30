import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Logger } from 'winston';
import { TwentyCRMClient } from '../twenty-client.js';

export function registerNoteTools(
  server: McpServer,
  getClient: (sessionId?: string) => TwentyCRMClient,
  logger: Logger
) {
  // List notes
  server.registerTool(
    'list-notes',
    {

      description: 'Find and list notes in Twenty CRM',
      inputSchema: {
        orderBy: z.string().optional().describe('Field to order by (e.g., "createdAt", "title")'),
        filter: z.record(z.any()).optional().describe('Filter criteria as JSON object'),
        limit: z.number().min(1).max(60).optional().default(20).describe('Number of records to return'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include'),
        startingAfter: z.string().optional().describe('Cursor for pagination - starting after'),
        endingBefore: z.string().optional().describe('Cursor for pagination - ending before'),
        search: z.string().optional().describe('Search in note title or body')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        
        // Build filter
        let filter = params.filter || {};
        if (params.search) {
          filter = {
            or: [
              { title: { ilike: `%${params.search}%` } },
              { body: { ilike: `%${params.search}%` } }
            ]
          };
        }

        const response = await client.findManyNotes({
          orderBy: params.orderBy || 'createdAt',
          filter,
          limit: params.limit,
          depth: params.depth,
          startingAfter: params.startingAfter,
          endingBefore: params.endingBefore
        });

        const notes = response.data.notes || [];
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: notes.length,
              totalCount: response.totalCount,
              hasMore: response.pageInfo?.hasNextPage,
              notes: notes.map(n => ({
                id: n.id,
                title: n.title,
                body: n.body ? n.body.substring(0, 100) + (n.body.length > 100 ? '...' : '') : null,
                createdAt: n.createdAt,
                updatedAt: n.updatedAt
              }))
            }, null, 2)
          }]
        };
      } catch (error) {
        logger.error('Error listing notes:', error);
        return {
          content: [{
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // Create note
  server.registerTool(
    'create-note',
    {

      description: 'Create a new note in Twenty CRM',
      inputSchema: {
        title: z.string().describe('Note title'),
        body: z.string().describe('Note content/body'),
        position: z.number().optional().describe('Note position/order')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        
        const data: any = {
          title: params.title,
          body: params.body,
          position: params.position
        };

        await client.createOneNote(data);

        return {
          content: [{
            type: 'text',
            text: `Created note: "${params.title}"`
          }]
        };
      } catch (error) {
        logger.error('Error creating note:', error);
        return {
          content: [{
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );
}