import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Logger } from 'winston';
import { TwentyCRMClient } from '../twenty-client.js';

export function registerPeopleTools(
  server: McpServer,
  getClient: (sessionId?: string) => TwentyCRMClient,
  logger: Logger
) {
  // List people
  server.registerTool(
    'list-people',
    {

      description: 'Find and list people/contacts in Twenty CRM',
      inputSchema: {
        orderBy: z.string().optional().describe('Field to order by (e.g., "createdAt", "name.lastName")'),
        filter: z.record(z.any()).optional().describe('Filter criteria as JSON object'),
        limit: z.number().min(1).max(60).optional().default(20).describe('Number of records to return'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include'),
        startingAfter: z.string().optional().describe('Cursor for pagination - starting after'),
        endingBefore: z.string().optional().describe('Cursor for pagination - ending before'),
        search: z.string().optional().describe('Search in name, email, job title, or company')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        
        // Build filter if search is provided
        let filter = params.filter || {};
        if (params.search) {
          filter = {
            or: [
              { 'name.firstName': { ilike: `%${params.search}%` } },
              { 'name.lastName': { ilike: `%${params.search}%` } },
              { email: { ilike: `%${params.search}%` } },
              { jobTitle: { ilike: `%${params.search}%` } }
            ]
          };
        }

        const response = await client.findManyPeople({
          orderBy: params.orderBy,
          filter,
          limit: params.limit,
          depth: params.depth,
          startingAfter: params.startingAfter,
          endingBefore: params.endingBefore
        });

        const people = response.data.people || [];
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: people.length,
              totalCount: response.totalCount,
              hasMore: response.pageInfo?.hasNextPage,
              people: people.map(p => ({
                id: p.id,
                name: `${p.name?.firstName || ''} ${p.name?.lastName || ''}`.trim(),
                email: p.email,
                jobTitle: p.jobTitle,
                company: p.company?.name,
                phone: p.phone,
                city: p.city
              }))
            }, null, 2)
          }]
        };
      } catch (error) {
        logger.error('Error listing people:', error);
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

  // Get person details
  server.registerTool(
    'get-person',
    {

      description: 'Get detailed information about a specific person',
      inputSchema: {
        id: z.string().describe('Person ID'),
        depth: z.number().min(0).max(3).optional().default(1).describe('Depth of related data to include')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        const response = await client.findOnePerson(params.id, params.depth);
        const person = response.data.person;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(person, null, 2)
          }]
        };
      } catch (error) {
        logger.error('Error getting person:', error);
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

  // Create person
  server.registerTool(
    'create-person',
    {

      description: 'Create a new person/contact in Twenty CRM',
      inputSchema: {
        firstName: z.string().describe('First name'),
        lastName: z.string().optional().describe('Last name'),
        email: z.string().email().optional().describe('Email address'),
        phone: z.string().optional().describe('Phone number'),
        jobTitle: z.string().optional().describe('Job title'),
        companyId: z.string().optional().describe('Company ID to associate with'),
        city: z.string().optional().describe('City'),
        whatsapp: z.string().optional().describe('WhatsApp number'),
        linkedinUrl: z.string().url().optional().describe('LinkedIn profile URL'),
        intro: z.string().optional().describe('Introduction/notes'),
        workPreference: z.string().optional().describe('Work preference'),
        performanceRating: z.number().min(0).max(10).optional().describe('Performance rating (0-10)')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        
        const data: any = {
          name: {
            firstName: params.firstName,
            lastName: params.lastName
          },
          email: params.email,
          phone: params.phone,
          jobTitle: params.jobTitle,
          companyId: params.companyId,
          city: params.city,
          whatsapp: params.whatsapp,
          intro: params.intro,
          workPreference: params.workPreference,
          performanceRating: params.performanceRating
        };

        if (params.linkedinUrl) {
          data.linkedinLink = {
            primaryLinkUrl: params.linkedinUrl,
            primaryLinkLabel: 'LinkedIn'
          };
        }

        const response = await client.createOnePerson(data, 1);
        const person = response.data.createPerson;

        return {
          content: [{
            type: 'text',
            text: `Created person: ${person.name?.firstName} ${person.name?.lastName || ''} (ID: ${person.id})`
          }]
        };
      } catch (error) {
        logger.error('Error creating person:', error);
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

  // Update person
  server.registerTool(
    'update-person',
    {

      description: 'Update an existing person/contact',
      inputSchema: {
        id: z.string().describe('Person ID'),
        firstName: z.string().optional().describe('First name'),
        lastName: z.string().optional().describe('Last name'),
        email: z.string().email().optional().describe('Email address'),
        phone: z.string().optional().describe('Phone number'),
        jobTitle: z.string().optional().describe('Job title'),
        companyId: z.string().optional().describe('Company ID to associate with'),
        city: z.string().optional().describe('City'),
        whatsapp: z.string().optional().describe('WhatsApp number'),
        linkedinUrl: z.string().url().optional().describe('LinkedIn profile URL'),
        intro: z.string().optional().describe('Introduction/notes'),
        workPreference: z.string().optional().describe('Work preference'),
        performanceRating: z.number().min(0).max(10).optional().describe('Performance rating (0-10)')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        const { id, ...updateData } = params;
        
        const data: any = {};
        
        if (updateData.firstName !== undefined || updateData.lastName !== undefined) {
          data.name = {};
          if (updateData.firstName !== undefined) data.name.firstName = updateData.firstName;
          if (updateData.lastName !== undefined) data.name.lastName = updateData.lastName;
        }
        
        if (updateData.email !== undefined) data.email = updateData.email;
        if (updateData.phone !== undefined) data.phone = updateData.phone;
        if (updateData.jobTitle !== undefined) data.jobTitle = updateData.jobTitle;
        if (updateData.companyId !== undefined) data.companyId = updateData.companyId;
        if (updateData.city !== undefined) data.city = updateData.city;
        if (updateData.whatsapp !== undefined) data.whatsapp = updateData.whatsapp;
        if (updateData.intro !== undefined) data.intro = updateData.intro;
        if (updateData.workPreference !== undefined) data.workPreference = updateData.workPreference;
        if (updateData.performanceRating !== undefined) data.performanceRating = updateData.performanceRating;
        
        if (updateData.linkedinUrl) {
          data.linkedinLink = {
            primaryLinkUrl: updateData.linkedinUrl,
            primaryLinkLabel: 'LinkedIn'
          };
        }

        const response = await client.updateOnePerson(id, data, 1);
        const person = response.data.updatePerson;

        return {
          content: [{
            type: 'text',
            text: `Updated person: ${person.name?.firstName} ${person.name?.lastName || ''}`
          }]
        };
      } catch (error) {
        logger.error('Error updating person:', error);
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

  // Delete person
  server.registerTool(
    'delete-person',
    {

      description: 'Delete a person/contact from Twenty CRM',
      inputSchema: {
        id: z.string().describe('Person ID to delete')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        await client.deleteOnePerson(params.id);

        return {
          content: [{
            type: 'text',
            text: `Successfully deleted person with ID: ${params.id}`
          }]
        };
      } catch (error) {
        logger.error('Error deleting person:', error);
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