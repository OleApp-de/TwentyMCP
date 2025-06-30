import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TwentyCRMClient } from '../twenty-client.js';
import { z } from 'zod';
import { Logger } from 'winston';

export function registerTaskTools(
  server: McpServer,
  getClient: (sessionId?: string) => TwentyCRMClient,
  logger: Logger
): void {

  // 1. List Tasks Tool
  server.registerTool(
    'list-tasks',
    {
      description: 'List and search tasks in Twenty CRM with advanced filtering and pagination',
      inputSchema: {
        orderBy: z.string().optional().describe('Sort order (e.g. "createdAt", "dueAt", "status", "title")'),
        filter: z.string().optional().describe('Filter criteria as JSON string (e.g. \'{"status":{"eq":"TODO"}}\')'),
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
        
        logger.info(`Listing tasks with params:`, { orderBy, filter, limit, depth });
        
        const queryParams = new URLSearchParams();
        if (orderBy) queryParams.append('orderBy', orderBy);
        if (filter) queryParams.append('filter', filter);
        queryParams.append('limit', limit.toString());
        queryParams.append('depth', depth.toString());
        if (startingAfter) queryParams.append('startingAfter', startingAfter);
        if (endingBefore) queryParams.append('endingBefore', endingBefore);
        
        const response = await client.makeRequest('GET', `/tasks?${queryParams.toString()}`);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              tasks: response.data?.tasks || [],
              pageInfo: response.pageInfo || {},
              totalCount: response.totalCount || 0,
              query: { orderBy, filter, limit, depth, startingAfter, endingBefore }
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error listing tasks:', error);
        return {
          content: [{
            type: 'text',
            text: `Error listing tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 2. Get Task Tool
  server.registerTool(
    'get-task',
    {
      description: 'Get detailed information about a specific task by ID',
      inputSchema: {
        id: z.string().describe('UUID of the task to retrieve'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include (0-3, default 1)')
      }
    },
    async ({ id, depth = 1 }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Getting task ${id} with depth ${depth}`);
        
        const queryParams = new URLSearchParams();
        queryParams.append('depth', depth.toString());
        
        const response = await client.makeRequest('GET', `/tasks/${id}?${queryParams.toString()}`);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              task: response.data?.task || null
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error getting task:', error);
        return {
          content: [{
            type: 'text',
            text: `Error getting task: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 3. Create Task Tool
  server.registerTool(
    'create-task',
    {
      description: 'Create a new task in Twenty CRM',
      inputSchema: {
        title: z.string().describe('Task title'),
        body: z.string().optional().describe('Task description/body (plain text)'),
        bodyMarkdown: z.string().optional().describe('Task description in markdown format'),
        bodyBlocknote: z.string().optional().describe('Task description in blocknote format'),
        status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional().describe('Task status (default: TODO)'),
        dueAt: z.string().optional().describe('Due date in ISO 8601 format (e.g. "2025-06-30T23:59:00.000Z")'),
        assigneeId: z.string().optional().describe('UUID of the user assigned to this task'),
        position: z.number().optional().describe('Position/order for sorting'),
        createdBySource: z.enum(['EMAIL', 'CALENDAR', 'WORKFLOW', 'API', 'IMPORT', 'MANUAL', 'SYSTEM', 'WEBHOOK']).optional().describe('Source of creation'),
        linkToCompanyId: z.string().optional().describe('UUID of company to link this task to (creates TaskTarget automatically)'),
        linkToPersonId: z.string().optional().describe('UUID of person to link this task to (creates TaskTarget automatically)')
      }
    },
    async (params, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Creating task: ${params.title}`);
        
        const taskData: any = {
          title: params.title,
          status: params.status || 'TODO'
        };

        // Add body/description if provided
        if (params.body) {
          taskData.body = params.body;
        }

        // Add bodyV2 if markdown or blocknote is provided (never send empty bodyV2)
        if (params.bodyMarkdown || params.bodyBlocknote) {
          taskData.bodyV2 = {};
          if (params.bodyMarkdown) {
            taskData.bodyV2.markdown = params.bodyMarkdown;
          }
          if (params.bodyBlocknote) {
            taskData.bodyV2.blocknote = params.bodyBlocknote;
          }
        }

        // Add optional fields
        if (params.dueAt) taskData.dueAt = params.dueAt;
        if (params.assigneeId) taskData.assigneeId = params.assigneeId;
        if (params.position !== undefined) taskData.position = params.position;

        // Add creation source if provided
        if (params.createdBySource) {
          taskData.createdBy = {
            source: params.createdBySource
          };
        }
        
        const response = await client.makeRequest('POST', '/tasks', taskData);
        
        const createdTask = response.data?.createTask;
        if (!createdTask?.id) {
          throw new Error('Failed to create task - no task ID in response');
        }
        
        const taskId = createdTask.id;
        const createdLinks = [];
        
        // Create TaskTarget links if specified (programmatic convenience)
        if (params.linkToCompanyId) {
          try {
            const linkData = {
              taskId: taskId,
              companyId: params.linkToCompanyId
            };
            await client.makeRequest('POST', '/taskTargets', linkData);
            createdLinks.push(`Linked to company ${params.linkToCompanyId}`);
            logger.info(`Task ${taskId} linked to company ${params.linkToCompanyId}`);
          } catch (linkError) {
            logger.error('Error linking task to company:', linkError);
            createdLinks.push(`Failed to link to company: ${linkError instanceof Error ? linkError.message : 'Unknown error'}`);
          }
        }
        
        if (params.linkToPersonId) {
          try {
            const linkData = {
              taskId: taskId,
              personId: params.linkToPersonId
            };
            await client.makeRequest('POST', '/taskTargets', linkData);
            createdLinks.push(`Linked to person ${params.linkToPersonId}`);
            logger.info(`Task ${taskId} linked to person ${params.linkToPersonId}`);
          } catch (linkError) {
            logger.error('Error linking task to person:', linkError);
            createdLinks.push(`Failed to link to person: ${linkError instanceof Error ? linkError.message : 'Unknown error'}`);
          }
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              task: createdTask,
              message: 'Task created successfully',
              linksCreated: createdLinks,
              linkedToCompany: !!params.linkToCompanyId,
              linkedToPerson: !!params.linkToPersonId
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error creating task:', error);
        return {
          content: [{
            type: 'text',
            text: `Error creating task: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 4. Update Task Tool
  server.registerTool(
    'update-task',
    {
      description: 'Update an existing task in Twenty CRM',
      inputSchema: {
        id: z.string().describe('UUID of the task to update'),
        title: z.string().optional().describe('Task title'),
        body: z.string().optional().describe('Task description/body (plain text)'),
        bodyMarkdown: z.string().optional().describe('Task description in markdown format'),
        bodyBlocknote: z.string().optional().describe('Task description in blocknote format'),
        status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional().describe('Task status'),
        dueAt: z.string().nullable().optional().describe('Due date in ISO 8601 format (null to remove)'),
        assigneeId: z.string().nullable().optional().describe('UUID of the user assigned to this task (null to remove)'),
        position: z.number().optional().describe('Position/order for sorting'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include in response (0-3, default 1)')
      }
    },
    async (params, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Updating task ${params.id}`);
        
        const updateData: any = {};

        // Update basic fields
        if (params.title !== undefined) updateData.title = params.title;
        if (params.status !== undefined) updateData.status = params.status;
        if (params.dueAt !== undefined) updateData.dueAt = params.dueAt;
        if (params.assigneeId !== undefined) updateData.assigneeId = params.assigneeId;
        if (params.position !== undefined) updateData.position = params.position;

        // Update body/description if provided
        if (params.body !== undefined) {
          updateData.body = params.body;
        }

        // Update bodyV2 if markdown or blocknote is provided
        if (params.bodyMarkdown !== undefined || params.bodyBlocknote !== undefined) {
          updateData.bodyV2 = {};
          if (params.bodyMarkdown !== undefined) {
            updateData.bodyV2.markdown = params.bodyMarkdown;
          }
          if (params.bodyBlocknote !== undefined) {
            updateData.bodyV2.blocknote = params.bodyBlocknote;
          }
        }

        const queryParams = new URLSearchParams();
        if (params.depth !== undefined) {
          queryParams.append('depth', params.depth.toString());
        }
        
        const response = await client.makeRequest('PATCH', `/tasks/${params.id}?${queryParams.toString()}`, updateData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              task: response.data?.updateTask || null,
              message: 'Task updated successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error updating task:', error);
        return {
          content: [{
            type: 'text',
            text: `Error updating task: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 5. Delete Task Tool
  server.registerTool(
    'delete-task',
    {
      description: 'Delete a task from Twenty CRM',
      inputSchema: {
        id: z.string().describe('UUID of the task to delete')
      }
    },
    async ({ id }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Deleting task ${id}`);
        
        const response = await client.makeRequest('DELETE', `/tasks/${id}`);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              deletedId: response.data?.deleteTask?.id || id,
              message: 'Task deleted successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error deleting task:', error);
        return {
          content: [{
            type: 'text',
            text: `Error deleting task: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 6. Batch Create Tasks Tool
  server.registerTool(
    'batch-create-tasks',
    {
      description: 'Create multiple tasks at once in Twenty CRM',
      inputSchema: {
        tasks: z.array(z.object({
          title: z.string(),
          body: z.string().optional(),
          status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
          dueAt: z.string().optional(),
          assigneeId: z.string().optional()
        })).describe('Array of tasks to create')
      }
    },
    async ({ tasks }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Batch creating ${tasks.length} tasks`);
        
        const tasksData = tasks.map(task => ({
          title: task.title,
          status: task.status || 'TODO',
          ...(task.body && { body: task.body }),
          ...(task.dueAt && { dueAt: task.dueAt }),
          ...(task.assigneeId && { assigneeId: task.assigneeId })
        }));
        
        const response = await client.makeRequest('POST', '/batch/tasks', tasksData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              tasks: response.data?.createTasks || [],
              message: `${tasks.length} tasks created successfully`
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error batch creating tasks:', error);
        return {
          content: [{
            type: 'text',
            text: `Error batch creating tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 7. Find Task Duplicates Tool
  server.registerTool(
    'find-task-duplicates',
    {
      description: 'Find duplicate tasks in Twenty CRM based on provided data or IDs',
      inputSchema: {
        data: z.array(z.object({
          title: z.string(),
          assigneeId: z.string().optional()
        })).optional().describe('Array of task data to check for duplicates'),
        ids: z.array(z.string()).optional().describe('Array of task IDs to check for duplicates')
      }
    },
    async ({ data, ids }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Finding task duplicates`);
        
        const requestBody: any = {};
        if (data) {
          requestBody.data = data.map(task => ({
            title: task.title,
            ...(task.assigneeId && { assigneeId: task.assigneeId })
          }));
        }
        if (ids) {
          requestBody.ids = ids;
        }
        
        const response = await client.makeRequest('POST', '/tasks/duplicates', requestBody);
        
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
        logger.error('Error finding task duplicates:', error);
        return {
          content: [{
            type: 'text',
            text: `Error finding task duplicates: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 8. Complete Task Tool (Convenience function)
  server.registerTool(
    'complete-task',
    {
      description: 'Mark a task as completed (convenience function that sets status to DONE)',
      inputSchema: {
        id: z.string().describe('UUID of the task to complete'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include in response (0-3, default 1)')
      }
    },
    async ({ id, depth = 1 }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Completing task ${id}`);
        
        const updateData = {
          status: 'DONE' as const
        };

        const queryParams = new URLSearchParams();
        queryParams.append('depth', depth.toString());
        
        const response = await client.makeRequest('PATCH', `/tasks/${id}?${queryParams.toString()}`, updateData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              task: response.data?.updateTask || null,
              message: 'Task completed successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error completing task:', error);
        return {
          content: [{
            type: 'text',
            text: `Error completing task: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );
}