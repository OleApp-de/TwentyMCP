import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Logger } from 'winston';
import { TwentyCRMClient } from '../twenty-client.js';

export function registerTaskTools(
  server: McpServer,
  getClient: (sessionId?: string) => TwentyCRMClient,
  logger: Logger
) {
  // List tasks
  server.registerTool(
    'list-tasks',
    {

      description: 'Find and list tasks in Twenty CRM',
      inputSchema: {
        orderBy: z.string().optional().describe('Field to order by (e.g., "dueAt", "createdAt")'),
        filter: z.record(z.any()).optional().describe('Filter criteria as JSON object'),
        limit: z.number().min(1).max(60).optional().default(20).describe('Number of records to return'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include'),
        startingAfter: z.string().optional().describe('Cursor for pagination - starting after'),
        endingBefore: z.string().optional().describe('Cursor for pagination - ending before'),
        status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional().describe('Filter by task status'),
        assigneeId: z.string().optional().describe('Filter by assignee ID'),
        search: z.string().optional().describe('Search in task title or body')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        
        // Build filter
        let filter = params.filter || {};
        if (params.status) {
          filter.status = { eq: params.status };
        }
        if (params.assigneeId) {
          filter.assigneeId = { eq: params.assigneeId };
        }
        if (params.search) {
          filter = {
            ...filter,
            or: [
              { title: { ilike: `%${params.search}%` } },
              { body: { ilike: `%${params.search}%` } }
            ]
          };
        }

        const response = await client.findManyTasks({
          orderBy: params.orderBy || 'dueAt',
          filter,
          limit: params.limit,
          depth: params.depth,
          startingAfter: params.startingAfter,
          endingBefore: params.endingBefore
        });

        const tasks = response.data.tasks || [];
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: tasks.length,
              totalCount: response.totalCount,
              hasMore: response.pageInfo?.hasNextPage,
              tasks: tasks.map(t => ({
                id: t.id,
                title: t.title,
                status: t.status,
                dueAt: t.dueAt,
                assignee: t.assignee?.name ? 
                  `${t.assignee.name.firstName || ''} ${t.assignee.name.lastName || ''}`.trim() : 
                  null,
                createdAt: t.createdAt
              }))
            }, null, 2)
          }]
        };
      } catch (error) {
        logger.error('Error listing tasks:', error);
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

  // Get task details
  server.registerTool(
    'get-task',
    {

      description: 'Get detailed information about a specific task',
      inputSchema: {
        id: z.string().describe('Task ID'),
        depth: z.number().min(0).max(3).optional().default(1).describe('Depth of related data to include')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        const response = await client.findOneTask(params.id, params.depth);
        const task = response.data.task;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(task, null, 2)
          }]
        };
      } catch (error) {
        logger.error('Error getting task:', error);
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

  // Create task
  server.registerTool(
    'create-task',
    {

      description: 'Create a new task in Twenty CRM',
      inputSchema: {
        title: z.string().describe('Task title'),
        body: z.string().optional().describe('Task description/body'),
        status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional().default('TODO').describe('Task status'),
        dueAt: z.string().optional().describe('Due date in ISO 8601 format'),
        assigneeId: z.string().optional().describe('ID of person to assign the task to'),
        position: z.number().optional().describe('Task position/order')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        
        const data: any = {
          title: params.title,
          body: params.body,
          status: params.status,
          dueAt: params.dueAt,
          assigneeId: params.assigneeId,
          position: params.position
        };

        const response = await client.createOneTask(data, 1);

        return {
          content: [{
            type: 'text',
            text: `Created task: "${params.title}" with status ${params.status}`
          }]
        };
      } catch (error) {
        logger.error('Error creating task:', error);
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

  // Update task
  server.registerTool(
    'update-task',
    {

      description: 'Update an existing task',
      inputSchema: {
        id: z.string().describe('Task ID'),
        title: z.string().optional().describe('Task title'),
        body: z.string().optional().describe('Task description/body'),
        status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional().describe('Task status'),
        dueAt: z.string().optional().describe('Due date in ISO 8601 format'),
        assigneeId: z.string().optional().describe('ID of person to assign the task to'),
        position: z.number().optional().describe('Task position/order')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        const { id, ...updateData } = params;
        
        const data: any = {};
        
        if (updateData.title !== undefined) data.title = updateData.title;
        if (updateData.body !== undefined) data.body = updateData.body;
        if (updateData.status !== undefined) data.status = updateData.status;
        if (updateData.dueAt !== undefined) data.dueAt = updateData.dueAt;
        if (updateData.assigneeId !== undefined) data.assigneeId = updateData.assigneeId;
        if (updateData.position !== undefined) data.position = updateData.position;

        const response = await client.updateOneTask(id, data, 1);
        const task = response.data.updateTask;

        return {
          content: [{
            type: 'text',
            text: `Updated task: "${task.title}"`
          }]
        };
      } catch (error) {
        logger.error('Error updating task:', error);
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

  // Delete task
  server.registerTool(
    'delete-task',
    {

      description: 'Delete a task from Twenty CRM',
      inputSchema: {
        id: z.string().describe('Task ID to delete')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        await client.deleteOneTask(params.id);

        return {
          content: [{
            type: 'text',
            text: `Successfully deleted task with ID: ${params.id}`
          }]
        };
      } catch (error) {
        logger.error('Error deleting task:', error);
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

  // Complete task (convenience tool)
  server.registerTool(
    'complete-task',
    {

      description: 'Mark a task as completed',
      inputSchema: {
        id: z.string().describe('Task ID to complete')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        const response = await client.updateOneTask(params.id, { status: 'DONE' }, 1);
        const task = response.data.updateTask;

        return {
          content: [{
            type: 'text',
            text: `Completed task: "${task.title}"`
          }]
        };
      } catch (error) {
        logger.error('Error completing task:', error);
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