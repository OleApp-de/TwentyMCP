import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TwentyCRMClient } from '../twenty-client.js';
import { z } from 'zod';
import { Logger } from 'winston';

export function registerNoteTargetTools(
  server: McpServer,
  getClient: (sessionId?: string) => TwentyCRMClient,
  logger: Logger
): void {

  // 1. List NoteTargets Tool
  server.registerTool(
    'twenty-crm-list-note-targets',
    {
      description: 'Twenty CRM: List and search note targets (note-entity relationships) in Twenty CRM',
      inputSchema: {
        orderBy: z.string().optional().describe('Sort order (e.g. "createdAt", "noteId")'),
        filter: z.string().optional().describe('Filter criteria as JSON string (e.g. \'{"companyId":{"eq":"uuid"}}\''),
        limit: z.number().min(1).max(60).optional().describe('Number of results to return (max 60, default 20)'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include (0-3, default 1)'),
        startingAfter: z.string().optional().describe('Cursor for pagination - start after this ID'),
        endingBefore: z.string().optional().describe('Cursor for pagination - end before this ID')
      }
    },
    async ({ orderBy, filter, limit = 20, depth = 1, startingAfter, endingBefore }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Listing note targets with params:`, { orderBy, filter, limit, depth });
        
        const queryParams = new URLSearchParams();
        if (orderBy) queryParams.append('orderBy', orderBy);
        if (filter) queryParams.append('filter', filter);
        queryParams.append('limit', limit.toString());
        queryParams.append('depth', depth.toString());
        if (startingAfter) queryParams.append('startingAfter', startingAfter);
        if (endingBefore) queryParams.append('endingBefore', endingBefore);
        
        const response = await client.makeRequest('GET', `/noteTargets?${queryParams.toString()}`);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              noteTargets: response.data?.noteTargets || [],
              pageInfo: response.pageInfo || {},
              totalCount: response.totalCount || 0,
              query: { orderBy, filter, limit, depth, startingAfter, endingBefore }
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error listing note targets:', error);
        return {
          content: [{
            type: 'text',
            text: `Error listing note targets: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 2. Get NoteTarget Tool
  server.registerTool(
    'twenty-crm-get-note-target',
    {
      description: 'Twenty CRM: Get detailed information about a specific note target by ID',
      inputSchema: {
        id: z.string().describe('UUID of the note target to retrieve'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include (0-3, default 1)')
      }
    },
    async ({ id, depth = 1 }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Getting note target ${id} with depth ${depth}`);
        
        const queryParams = new URLSearchParams();
        queryParams.append('depth', depth.toString());
        
        const response = await client.makeRequest('GET', `/noteTargets/${id}?${queryParams.toString()}`);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              noteTarget: response.data?.noteTarget || null
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error getting note target:', error);
        return {
          content: [{
            type: 'text',
            text: `Error getting note target: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 3. Create NoteTarget Tool
  server.registerTool(
    'twenty-crm-create-note-target',
    {
      description: 'Twenty CRM: Create a new note target (link note to person, company, etc.) in Twenty CRM',
      inputSchema: {
        noteId: z.string().describe('UUID of the note to link'),
        personId: z.string().optional().describe('UUID of the person to link to'),
        companyId: z.string().optional().describe('UUID of the company to link to'),
        opportunityId: z.string().optional().describe('UUID of the opportunity to link to'),
        neusDatenmodelId: z.string().optional().describe('UUID of the neusDatenmodel to link to')
      }
    },
    async (params, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Creating note target for note ${params.noteId}`);
        
        const noteTargetData: any = {
          noteId: params.noteId
        };

        // Add target entity IDs
        if (params.personId) noteTargetData.personId = params.personId;
        if (params.companyId) noteTargetData.companyId = params.companyId;
        if (params.opportunityId) noteTargetData.opportunityId = params.opportunityId;
        if (params.neusDatenmodelId) noteTargetData.neusDatenmodelId = params.neusDatenmodelId;

        // Validate at least one target is provided
        const targetCount = [params.personId, params.companyId, params.opportunityId, params.neusDatenmodelId].filter(Boolean).length;
        if (targetCount === 0) {
          throw new Error('At least one target ID (personId, companyId, opportunityId, or neusDatenmodelId) must be provided');
        }
        
        const response = await client.makeRequest('POST', '/noteTargets', noteTargetData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              noteTarget: response.data?.createNoteTarget || null,
              message: 'Note target created successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error creating note target:', error);
        return {
          content: [{
            type: 'text',
            text: `Error creating note target: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 4. Update NoteTarget Tool
  server.registerTool(
    'twenty-crm-update-note-target',
    {
      description: 'Twenty CRM: Update an existing note target in Twenty CRM',
      inputSchema: {
        id: z.string().describe('UUID of the note target to update'),
        noteId: z.string().optional().describe('UUID of the note'),
        personId: z.string().nullable().optional().describe('UUID of the person (null to remove)'),
        companyId: z.string().nullable().optional().describe('UUID of the company (null to remove)'),
        opportunityId: z.string().nullable().optional().describe('UUID of the opportunity (null to remove)'),
        neusDatenmodelId: z.string().nullable().optional().describe('UUID of the neusDatenmodel (null to remove)'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include in response (0-3, default 1)')
      }
    },
    async (params, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Updating note target ${params.id}`);
        
        const updateData: any = {};

        // Update fields
        if (params.noteId !== undefined) updateData.noteId = params.noteId;
        if (params.personId !== undefined) updateData.personId = params.personId;
        if (params.companyId !== undefined) updateData.companyId = params.companyId;
        if (params.opportunityId !== undefined) updateData.opportunityId = params.opportunityId;
        if (params.neusDatenmodelId !== undefined) updateData.neusDatenmodelId = params.neusDatenmodelId;

        const queryParams = new URLSearchParams();
        if (params.depth !== undefined) {
          queryParams.append('depth', params.depth.toString());
        }
        
        const response = await client.makeRequest('PATCH', `/noteTargets/${params.id}?${queryParams.toString()}`, updateData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              noteTarget: response.data?.updateNoteTarget || null,
              message: 'Note target updated successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error updating note target:', error);
        return {
          content: [{
            type: 'text',
            text: `Error updating note target: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 5. Delete NoteTarget Tool
  server.registerTool(
    'twenty-crm-delete-note-target',
    {
      description: 'Twenty CRM: Delete a note target from Twenty CRM',
      inputSchema: {
        id: z.string().describe('UUID of the note target to delete')
      }
    },
    async ({ id }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Deleting note target ${id}`);
        
        const response = await client.makeRequest('DELETE', `/noteTargets/${id}`);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              deletedId: response.data?.deleteNoteTarget?.id || id,
              message: 'Note target deleted successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error deleting note target:', error);
        return {
          content: [{
            type: 'text',
            text: `Error deleting note target: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 6. Batch Create NoteTargets Tool
  server.registerTool(
    'twenty-crm-batch-create-note-targets',
    {
      description: 'Twenty CRM: Create multiple note targets at once in Twenty CRM',
      inputSchema: {
        noteTargets: z.array(z.object({
          noteId: z.string(),
          personId: z.string().optional(),
          companyId: z.string().optional(),
          opportunityId: z.string().optional(),
          neusDatenmodelId: z.string().optional()
        })).describe('Array of note targets to create')
      }
    },
    async ({ noteTargets }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Batch creating ${noteTargets.length} note targets`);
        
        const noteTargetsData = noteTargets.map(noteTarget => {
          const data: any = {
            noteId: noteTarget.noteId
          };
          
          if (noteTarget.personId) data.personId = noteTarget.personId;
          if (noteTarget.companyId) data.companyId = noteTarget.companyId;
          if (noteTarget.opportunityId) data.opportunityId = noteTarget.opportunityId;
          if (noteTarget.neusDatenmodelId) data.neusDatenmodelId = noteTarget.neusDatenmodelId;
          
          return data;
        });
        
        const response = await client.makeRequest('POST', '/batch/noteTargets', noteTargetsData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              noteTargets: response.data?.createNoteTargets || [],
              message: `${noteTargets.length} note targets created successfully`
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error batch creating note targets:', error);
        return {
          content: [{
            type: 'text',
            text: `Error batch creating note targets: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 7. Get Notes for Company/Person Tool (Convenience)
  server.registerTool(
    'twenty-crm-get-notes-for-entity',
    {
      description: 'Twenty CRM: Get all notes linked to a specific company or person',
      inputSchema: {
        companyId: z.string().optional().describe('UUID of the company to get notes for'),
        personId: z.string().optional().describe('UUID of the person to get notes for'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include (0-3, default 2)')
      }
    },
    async ({ companyId, personId, depth = 2 }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        if (!companyId && !personId) {
          throw new Error('Either companyId or personId must be provided');
        }
        
        const entityType = companyId ? 'company' : 'person';
        const entityId = companyId || personId;
        
        logger.info(`Getting notes for ${entityType} ${entityId}`);
        
        // Build filter for the specific entity
        const filter = companyId 
          ? `{"companyId":{"eq":"${companyId}"}}`
          : `{"personId":{"eq":"${personId}"}}`;
        
        const queryParams = new URLSearchParams();
        queryParams.append('filter', filter);
        queryParams.append('depth', depth.toString());
        
        const response = await client.makeRequest('GET', `/noteTargets?${queryParams.toString()}`);
        
        // Extract notes from the noteTargets
        const noteTargets = response.data?.noteTargets || [];
        const notes = noteTargets.map((target: any) => target.note).filter(Boolean);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              entityType,
              entityId,
              notesCount: notes.length,
              notes: notes,
              noteTargets: noteTargets, // Include full targets for reference
              message: `Found ${notes.length} notes for ${entityType} ${entityId}`
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error getting notes for entity:', error);
        return {
          content: [{
            type: 'text',
            text: `Error getting notes for entity: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );
}