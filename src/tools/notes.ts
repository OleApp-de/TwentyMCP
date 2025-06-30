import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TwentyCRMClient } from '../twenty-client.js';
import { z } from 'zod';
import { Logger } from 'winston';

export function registerNotesTools(
  server: McpServer,
  getClient: (sessionId?: string) => TwentyCRMClient,
  logger: Logger
): void {

  // 1. List Notes Tool
  server.registerTool(
    'list-notes',
    {
      description: 'List and search notes in Twenty CRM with advanced filtering and pagination',
      inputSchema: {
        orderBy: z.string().optional().describe('Sort order (e.g. "createdAt", "title", "updatedAt")'),
        filter: z.string().optional().describe('Filter criteria as JSON string (e.g. \'{"title":{"ilike":"*demo*"}}\''),
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
        
        logger.info(`Listing notes with params:`, { orderBy, filter, limit, depth });
        
        const queryParams = new URLSearchParams();
        if (orderBy) queryParams.append('orderBy', orderBy);
        if (filter) queryParams.append('filter', filter);
        queryParams.append('limit', limit.toString());
        queryParams.append('depth', depth.toString());
        if (startingAfter) queryParams.append('startingAfter', startingAfter);
        if (endingBefore) queryParams.append('endingBefore', endingBefore);
        
        const response = await client.makeRequest('GET', `/notes?${queryParams.toString()}`);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              notes: response.data?.notes || [],
              pageInfo: response.pageInfo || {},
              totalCount: response.totalCount || 0,
              query: { orderBy, filter, limit, depth, startingAfter, endingBefore }
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error listing notes:', error);
        return {
          content: [{
            type: 'text',
            text: `Error listing notes: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 2. Get Note Tool
  server.registerTool(
    'get-note',
    {
      description: 'Get detailed information about a specific note by ID',
      inputSchema: {
        id: z.string().describe('UUID of the note to retrieve'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include (0-3, default 1)')
      }
    },
    async ({ id, depth = 1 }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Getting note ${id} with depth ${depth}`);
        
        const queryParams = new URLSearchParams();
        queryParams.append('depth', depth.toString());
        
        const response = await client.makeRequest('GET', `/notes/${id}?${queryParams.toString()}`);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              note: response.data?.note || null
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error getting note:', error);
        return {
          content: [{
            type: 'text',
            text: `Error getting note: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 3. Create Note Tool
  server.registerTool(
    'create-note',
    {
      description: 'Create a new note in Twenty CRM',
      inputSchema: {
        title: z.string().optional().describe('Note title (optional)'),
        content: z.string().optional().describe('Note content/text (will be converted to markdown format automatically)'),
        position: z.number().optional().describe('Position/order for sorting'),
        createdBySource: z.enum(['EMAIL', 'CALENDAR', 'WORKFLOW', 'API', 'IMPORT', 'MANUAL', 'SYSTEM', 'WEBHOOK']).optional().describe('Source of creation'),
        linkToCompanyId: z.string().optional().describe('UUID of company to link this note to (creates NoteTarget automatically)'),
        linkToPersonId: z.string().optional().describe('UUID of person to link this note to (creates NoteTarget automatically)')
      }
    },
    async (params, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Creating note: ${params.title}`);
        
        const noteData: any = {};

        // Add title if provided (API docs show minimal request is {})
        if (params.title) {
          noteData.title = params.title;
        }

        // Add content automatically as bodyV2.markdown if provided
        if (params.content && params.content.trim()) {
          noteData.bodyV2 = {
            markdown: params.content.trim(),
            blocknote: "" // API erwartet beide Felder, generiert automatisch blocknote aus markdown
          };
        }

        // Add optional fields
        if (params.position !== undefined) noteData.position = params.position;

        // Add creation source if provided (correct structure)
        if (params.createdBySource) {
          noteData.createdBy = {
            source: params.createdBySource
          };
        }
        
        logger.debug('Final noteData being sent to API:', noteData);
        
        const response = await client.makeRequest('POST', '/notes', noteData);
        const createdNote = response.data?.createNote;
        
        if (!createdNote?.id) {
          throw new Error('Note creation failed - no note ID returned');
        }

        const results: any = {
          success: true,
          note: createdNote,
          message: 'Note created successfully',
          linkedTargets: []
        };

        // Automatisches Linking mit Company falls linkToCompanyId angegeben
        if (params.linkToCompanyId) {
          try {
            logger.info(`Creating NoteTarget for note ${createdNote.id} -> company ${params.linkToCompanyId}`);
            const targetResponse = await client.makeRequest('POST', '/noteTargets', {
              noteId: createdNote.id,
              companyId: params.linkToCompanyId
            });
            results.linkedTargets.push({
              type: 'company',
              targetId: params.linkToCompanyId,
              noteTarget: targetResponse.data?.createNoteTarget || null
            });
            logger.info(`NoteTarget created successfully: note -> company`);
          } catch (linkError) {
            logger.error(`Failed to link note to company ${params.linkToCompanyId}:`, linkError);
            results.linkingErrors = results.linkingErrors || [];
            results.linkingErrors.push({
              type: 'company',
              targetId: params.linkToCompanyId,
              error: linkError instanceof Error ? linkError.message : 'Unknown error'
            });
          }
        }

        // Automatisches Linking mit Person falls linkToPersonId angegeben
        if (params.linkToPersonId) {
          try {
            logger.info(`Creating NoteTarget for note ${createdNote.id} -> person ${params.linkToPersonId}`);
            const targetResponse = await client.makeRequest('POST', '/noteTargets', {
              noteId: createdNote.id,
              personId: params.linkToPersonId
            });
            results.linkedTargets.push({
              type: 'person',
              targetId: params.linkToPersonId,
              noteTarget: targetResponse.data?.createNoteTarget || null
            });
            logger.info(`NoteTarget created successfully: note -> person`);
          } catch (linkError) {
            logger.error(`Failed to link note to person ${params.linkToPersonId}:`, linkError);
            results.linkingErrors = results.linkingErrors || [];
            results.linkingErrors.push({
              type: 'person',
              targetId: params.linkToPersonId,
              error: linkError instanceof Error ? linkError.message : 'Unknown error'
            });
          }
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error creating note:', error);
        return {
          content: [{
            type: 'text',
            text: `Error creating note: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 4. Update Note Tool
  server.registerTool(
    'update-note',
    {
      description: 'Update an existing note in Twenty CRM',
      inputSchema: {
        id: z.string().describe('UUID of the note to update'),
        title: z.string().optional().describe('Note title'),
        content: z.string().optional().describe('Note content/text (will be converted to markdown format automatically)'),
        position: z.number().optional().describe('Position/order for sorting'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include in response (0-3, default 1)')
      }
    },
    async (params, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Updating note ${params.id}`);
        
        const updateData: any = {};

        // Update basic fields
        if (params.title !== undefined) updateData.title = params.title;
        if (params.position !== undefined) updateData.position = params.position;

        // Update content if provided (automatically converted to bodyV2.markdown)
        if (params.content !== undefined) {
          updateData.bodyV2 = {
            markdown: params.content || "",
            blocknote: "" // API erwartet beide Felder
          };
        }

        const queryParams = new URLSearchParams();
        if (params.depth !== undefined) {
          queryParams.append('depth', params.depth.toString());
        }
        
        const response = await client.makeRequest('PATCH', `/notes/${params.id}?${queryParams.toString()}`, updateData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              note: response.data?.updateNote || null,
              message: 'Note updated successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error updating note:', error);
        return {
          content: [{
            type: 'text',
            text: `Error updating note: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 5. Delete Note Tool
  server.registerTool(
    'delete-note',
    {
      description: 'Delete a note from Twenty CRM',
      inputSchema: {
        id: z.string().describe('UUID of the note to delete')
      }
    },
    async ({ id }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Deleting note ${id}`);
        
        const response = await client.makeRequest('DELETE', `/notes/${id}`);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              deletedId: response.data?.deleteNote?.id || id,
              message: 'Note deleted successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error deleting note:', error);
        return {
          content: [{
            type: 'text',
            text: `Error deleting note: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 6. Batch Create Notes Tool
  server.registerTool(
    'batch-create-notes',
    {
      description: 'Create multiple notes at once in Twenty CRM',
      inputSchema: {
        notes: z.array(z.object({
          title: z.string(),
          content: z.string().optional(),
          position: z.number().optional()
        })).describe('Array of notes to create')
      }
    },
    async ({ notes }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Batch creating ${notes.length} notes`);
        
        const notesData = notes.map(note => {
          const noteData: any = {
            title: note.title
          };
          
          if (note.content && note.content.trim()) {
            noteData.bodyV2 = { 
              markdown: note.content.trim(),
              blocknote: "" // API benötigt beide Felder
            };
          }
          if (note.position !== undefined) noteData.position = note.position;
          
          return noteData;
        });
        
        const response = await client.makeRequest('POST', '/batch/notes', notesData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              notes: response.data?.createNotes || [],
              message: `${notes.length} notes created successfully`
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error batch creating notes:', error);
        return {
          content: [{
            type: 'text',
            text: `Error batch creating notes: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 7. Find Note Duplicates Tool
  server.registerTool(
    'find-note-duplicates',
    {
      description: 'Find duplicate notes in Twenty CRM based on provided data or IDs',
      inputSchema: {
        data: z.array(z.object({
          title: z.string(),
          body: z.string().optional()
        })).optional().describe('Array of note data to check for duplicates'),
        ids: z.array(z.string()).optional().describe('Array of note IDs to check for duplicates')
      }
    },
    async ({ data, ids }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Finding note duplicates`);
        
        const requestBody: any = {};
        if (data) {
          requestBody.data = data.map(note => ({
            title: note.title,
            ...(note.body && { body: note.body })
          }));
        }
        if (ids) {
          requestBody.ids = ids;
        }
        
        const response = await client.makeRequest('POST', '/notes/duplicates', requestBody);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              duplicates: response.data || [],
              message: 'Duplicate search completed'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error finding note duplicates:', error);
        return {
          content: [{
            type: 'text',
            text: `Error finding note duplicates: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );
}