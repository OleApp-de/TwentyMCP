import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TwentyCRMClient } from '../twenty-client.js';
import { z } from 'zod';
import { Logger } from 'winston';

export function registerTaskTargetTools(
  server: McpServer,
  getClient: (sessionId?: string) => TwentyCRMClient,
  logger: Logger
): void {

  // 1. List Task Targets Tool
  server.registerTool(
    'twenty-crm-list-task-targets',
    {
      description: 'Twenty CRM: List task-target relationships (links between tasks and people/companies/opportunities)',
      inputSchema: {
        orderBy: z.string().optional().describe('Sort order (e.g. "createdAt", "taskId")'),
        filter: z.string().optional().describe('Filter criteria as JSON string (e.g. \'{"personId":{"eq":"uuid"}}\')'),
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
        
        logger.info(`Listing task targets with params:`, { orderBy, filter, limit, depth });
        
        const queryParams = new URLSearchParams();
        if (orderBy) queryParams.append('orderBy', orderBy);
        if (filter) queryParams.append('filter', filter);
        queryParams.append('limit', limit.toString());
        queryParams.append('depth', depth.toString());
        if (startingAfter) queryParams.append('startingAfter', startingAfter);
        if (endingBefore) queryParams.append('endingBefore', endingBefore);
        
        const response = await client.makeRequest('GET', `/taskTargets?${queryParams.toString()}`);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              taskTargets: response.data?.taskTargets || [],
              pageInfo: response.pageInfo || {},
              totalCount: response.totalCount || 0,
              query: { orderBy, filter, limit, depth, startingAfter, endingBefore }
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error listing task targets:', error);
        return {
          content: [{
            type: 'text',
            text: `Error listing task targets: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 2. Get Task Target Tool
  server.registerTool(
    'twenty-crm-get-task-target',
    {
      description: 'Twenty CRM: Get detailed information about a specific task target relationship by ID',
      inputSchema: {
        id: z.string().describe('UUID of the task target to retrieve'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include (0-3, default 1)')
      }
    },
    async ({ id, depth = 1 }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Getting task target ${id} with depth ${depth}`);
        
        const queryParams = new URLSearchParams();
        queryParams.append('depth', depth.toString());
        
        const response = await client.makeRequest('GET', `/taskTargets/${id}?${queryParams.toString()}`);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              taskTarget: response.data?.taskTarget || null
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error getting task target:', error);
        return {
          content: [{
            type: 'text',
            text: `Error getting task target: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 3. Create Task Target Tool
  server.registerTool(
    'twenty-crm-create-task-target',
    {
      description: 'Twenty CRM: Create a task-target relationship (link a task to a person, company, or opportunity)',
      inputSchema: {
        taskId: z.string().describe('UUID of the task'),
        personId: z.string().optional().describe('UUID of the person to link the task to'),
        companyId: z.string().optional().describe('UUID of the company to link the task to'),
        opportunityId: z.string().optional().describe('UUID of the opportunity to link the task to'),
        neusDatenmodelId: z.string().optional().describe('UUID of the neusDatenmodel to link the task to')
      }
    },
    async (params, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        // Validate that at least one target is provided
        if (!params.personId && !params.companyId && !params.opportunityId && !params.neusDatenmodelId) {
          throw new Error('At least one target (personId, companyId, opportunityId, or neusDatenmodelId) must be provided');
        }
        
        logger.info(`Creating task target for task ${params.taskId}`);
        
        const taskTargetData: any = {
          taskId: params.taskId
        };

        // Add the target entity
        if (params.personId) taskTargetData.personId = params.personId;
        if (params.companyId) taskTargetData.companyId = params.companyId;
        if (params.opportunityId) taskTargetData.opportunityId = params.opportunityId;
        if (params.neusDatenmodelId) taskTargetData.neusDatenmodelId = params.neusDatenmodelId;
        
        const response = await client.makeRequest('POST', '/taskTargets', taskTargetData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              taskTarget: response.data?.createTaskTarget || null,
              message: 'Task target relationship created successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error creating task target:', error);
        return {
          content: [{
            type: 'text',
            text: `Error creating task target: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 4. Update Task Target Tool
  server.registerTool(
    'twenty-crm-update-task-target',
    {
      description: 'Twenty CRM: Update an existing task-target relationship',
      inputSchema: {
        id: z.string().describe('UUID of the task target to update'),
        taskId: z.string().optional().describe('UUID of the task'),
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
        
        logger.info(`Updating task target ${params.id}`);
        
        const updateData: any = {};

        // Update fields
        if (params.taskId !== undefined) updateData.taskId = params.taskId;
        if (params.personId !== undefined) updateData.personId = params.personId;
        if (params.companyId !== undefined) updateData.companyId = params.companyId;
        if (params.opportunityId !== undefined) updateData.opportunityId = params.opportunityId;
        if (params.neusDatenmodelId !== undefined) updateData.neusDatenmodelId = params.neusDatenmodelId;

        const queryParams = new URLSearchParams();
        if (params.depth !== undefined) {
          queryParams.append('depth', params.depth.toString());
        }
        
        const response = await client.makeRequest('PATCH', `/taskTargets/${params.id}?${queryParams.toString()}`, updateData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              taskTarget: response.data?.updateTaskTarget || null,
              message: 'Task target relationship updated successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error updating task target:', error);
        return {
          content: [{
            type: 'text',
            text: `Error updating task target: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 5. Delete Task Target Tool
  server.registerTool(
    'twenty-crm-delete-task-target',
    {
      description: 'Twenty CRM: Delete a task-target relationship',
      inputSchema: {
        id: z.string().describe('UUID of the task target to delete')
      }
    },
    async ({ id }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Deleting task target ${id}`);
        
        const response = await client.makeRequest('DELETE', `/taskTargets/${id}`);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              deletedId: response.data?.deleteTaskTarget?.id || id,
              message: 'Task target relationship deleted successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error deleting task target:', error);
        return {
          content: [{
            type: 'text',
            text: `Error deleting task target: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 6. Link Task to Person Tool (Convenience function)
  server.registerTool(
    'twenty-crm-link-task-to-person',
    {
      description: 'Twenty CRM: Link a task to a person (convenience function for creating task-person relationship)',
      inputSchema: {
        taskId: z.string().describe('UUID of the task'),
        personId: z.string().describe('UUID of the person')
      }
    },
    async ({ taskId, personId }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Linking task ${taskId} to person ${personId}`);
        
        const taskTargetData = {
          taskId,
          personId
        };
        
        const response = await client.makeRequest('POST', '/taskTargets', taskTargetData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              taskTarget: response.data?.createTaskTarget || null,
              message: `Task successfully linked to person`
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error linking task to person:', error);
        return {
          content: [{
            type: 'text',
            text: `Error linking task to person: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 7. Link Task to Company Tool (Convenience function)
  server.registerTool(
    'twenty-crm-link-task-to-company',
    {
      description: 'Twenty CRM: Link a task to a company (convenience function for creating task-company relationship)',
      inputSchema: {
        taskId: z.string().describe('UUID of the task'),
        companyId: z.string().describe('UUID of the company')
      }
    },
    async ({ taskId, companyId }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Linking task ${taskId} to company ${companyId}`);
        
        const taskTargetData = {
          taskId,
          companyId
        };
        
        const response = await client.makeRequest('POST', '/taskTargets', taskTargetData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              taskTarget: response.data?.createTaskTarget || null,
              message: `Task successfully linked to company`
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error linking task to company:', error);
        return {
          content: [{
            type: 'text',
            text: `Error linking task to company: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 8. Get Tasks for Person Tool (Convenience function)
  server.registerTool(
    'twenty-crm-get-tasks-for-person',
    {
      description: 'Twenty CRM: Get all tasks linked to a specific person',
      inputSchema: {
        personId: z.string().describe('UUID of the person'),
        status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional().describe('Filter by task status'),
        limit: z.number().min(1).max(60).optional().describe('Number of results to return (max 60, default 20)'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include (0-3, default 2)')
      }
    },
    async ({ personId, status, limit = 20, depth = 2 }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Getting tasks for person ${personId}`);
        
        // Build filter for person tasks
        let filter = `{"personId":{"eq":"${personId}"}}`;
        
        const queryParams = new URLSearchParams();
        queryParams.append('filter', filter);
        queryParams.append('limit', limit.toString());
        queryParams.append('depth', depth.toString());
        
        const response = await client.makeRequest('GET', `/taskTargets?${queryParams.toString()}`);
        
        let tasks = (response.data?.taskTargets || []).map((target: any) => target.task).filter(Boolean);
        
        // Filter by status if provided
        if (status) {
          tasks = tasks.filter((task: any) => task.status === status);
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              tasks,
              totalFound: tasks.length,
              personId,
              filter: { status },
              message: `Found ${tasks.length} tasks for person`
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error getting tasks for person:', error);
        return {
          content: [{
            type: 'text',
            text: `Error getting tasks for person: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 9. Get Tasks for Company Tool (Convenience function)
  server.registerTool(
    'twenty-crm-get-tasks-for-company',
    {
      description: 'Twenty CRM: Get all tasks linked to a specific company',
      inputSchema: {
        companyId: z.string().describe('UUID of the company'),
        status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional().describe('Filter by task status'),
        limit: z.number().min(1).max(60).optional().describe('Number of results to return (max 60, default 20)'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include (0-3, default 2)')
      }
    },
    async ({ companyId, status, limit = 20, depth = 2 }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Getting tasks for company ${companyId}`);
        
        // Build filter for company tasks
        let filter = `{"companyId":{"eq":"${companyId}"}}`;
        
        const queryParams = new URLSearchParams();
        queryParams.append('filter', filter);
        queryParams.append('limit', limit.toString());
        queryParams.append('depth', depth.toString());
        
        const response = await client.makeRequest('GET', `/taskTargets?${queryParams.toString()}`);
        
        let tasks = (response.data?.taskTargets || []).map((target: any) => target.task).filter(Boolean);
        
        // Filter by status if provided
        if (status) {
          tasks = tasks.filter((task: any) => task.status === status);
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              tasks,
              totalFound: tasks.length,
              companyId,
              filter: { status },
              message: `Found ${tasks.length} tasks for company`
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error getting tasks for company:', error);
        return {
          content: [{
            type: 'text',
            text: `Error getting tasks for company: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );
}