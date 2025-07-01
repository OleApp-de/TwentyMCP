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
    'twenty-crm-list-tasks',
    {
      description: 'Twenty CRM: List and search tasks in Twenty CRM with advanced filtering and pagination',
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
    'twenty-crm-get-task',
    {
      description: 'Twenty CRM: Get detailed information about a specific task by ID',
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
    'twenty-crm-create-task',
    {
      description: 'Twenty CRM: Create a new task in Twenty CRM',
      inputSchema: {
        title: z.string().describe('Task title'),
        content: z.string().optional().describe('Task content/description (will be converted to markdown format automatically)'),
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
          status: params.status || 'TODO'
        };

        // Add title if provided (API docs show it's optional)
        if (params.title) {
          taskData.title = params.title;
        }

        // Add content automatically as bodyV2.markdown if provided
        if (params.content && params.content.trim()) {
          taskData.bodyV2 = {
            markdown: params.content.trim(),
            blocknote: "" // API erwartet beide Felder, generiert automatisch blocknote aus markdown
          };
        }

        // Add optional fields
        if (params.dueAt) taskData.dueAt = params.dueAt;
        if (params.assigneeId) taskData.assigneeId = params.assigneeId;
        if (params.position !== undefined) taskData.position = params.position;

        // Add creation source if provided (correct structure)
        if (params.createdBySource) {
          taskData.createdBy = {
            source: params.createdBySource
          };
        }
        
        logger.debug('Final taskData being sent to API:', taskData);
        
        const response = await client.makeRequest('POST', '/tasks', taskData);
        const createdTask = response.data?.createTask;
        
        if (!createdTask?.id) {
          throw new Error('Task creation failed - no task ID returned');
        }

        const results: any = {
          success: true,
          task: createdTask,
          message: 'Task created successfully',
          linkedTargets: []
        };

        // Automatisches Linking mit Company falls linkToCompanyId angegeben
        if (params.linkToCompanyId) {
          try {
            logger.info(`Creating TaskTarget for task ${createdTask.id} -> company ${params.linkToCompanyId}`);
            const targetResponse = await client.makeRequest('POST', '/taskTargets', {
              taskId: createdTask.id,
              companyId: params.linkToCompanyId
            });
            results.linkedTargets.push({
              type: 'company',
              targetId: params.linkToCompanyId,
              taskTarget: targetResponse.data?.createTaskTarget || null
            });
            logger.info(`TaskTarget created successfully: task -> company`);
          } catch (linkError) {
            logger.error(`Failed to link task to company ${params.linkToCompanyId}:`, linkError);
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
            logger.info(`Creating TaskTarget for task ${createdTask.id} -> person ${params.linkToPersonId}`);
            const targetResponse = await client.makeRequest('POST', '/taskTargets', {
              taskId: createdTask.id,
              personId: params.linkToPersonId
            });
            results.linkedTargets.push({
              type: 'person',
              targetId: params.linkToPersonId,
              taskTarget: targetResponse.data?.createTaskTarget || null
            });
            logger.info(`TaskTarget created successfully: task -> person`);
          } catch (linkError) {
            logger.error(`Failed to link task to person ${params.linkToPersonId}:`, linkError);
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
    'twenty-crm-update-task',
    {
      description: 'Twenty CRM: Update an existing task in Twenty CRM',
      inputSchema: {
        id: z.string().describe('UUID of the task to update'),
        title: z.string().optional().describe('Task title'),
        content: z.string().optional().describe('Task content/description (will be converted to markdown format automatically)'),
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
    'twenty-crm-delete-task',
    {
      description: 'Twenty CRM: Delete a task from Twenty CRM',
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
    'twenty-crm-batch-create-tasks',
    {
      description: 'Twenty CRM: Create multiple tasks at once in Twenty CRM',
      inputSchema: {
        tasks: z.array(z.object({
          title: z.string(),
          content: z.string().optional(),
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
        
        const tasksData = tasks.map(task => {
          const taskData: any = {
            title: task.title,
            status: task.status || 'TODO'
          };
          if (task.content && task.content.trim()) {
            taskData.bodyV2 = {
              markdown: task.content.trim(),
              blocknote: ""
            };
          }
          if (task.dueAt) taskData.dueAt = task.dueAt;
          if (task.assigneeId) taskData.assigneeId = task.assigneeId;
          return taskData;
        });
        
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
    'twenty-crm-find-task-duplicates',
    {
      description: 'Twenty CRM: Find duplicate tasks in Twenty CRM based on provided data or IDs',
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
    'twenty-crm-complete-task',
    {
      description: 'Twenty CRM: Mark a task as completed (convenience function that sets status to DONE)',
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