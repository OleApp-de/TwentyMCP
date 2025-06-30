import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TwentyCRMClient } from '../twenty-client.js';
import { z } from 'zod';
import { Logger } from 'winston';

export function registerPeopleTools(
  server: McpServer,
  getClient: (sessionId?: string) => TwentyCRMClient,
  logger: Logger
): void {

  // 1. List People Tool
  server.registerTool(
    'list-people',
    {
      description: 'List and search people/contacts in Twenty CRM with advanced filtering and pagination',
      inputSchema: {
        orderBy: z.string().optional().describe('Sort order (e.g. "createdAt", "name.lastName", "name.firstName")'),
        filter: z.string().optional().describe('Filter criteria as JSON string (e.g. \'{"katgeorie":{"eq":"KUNDE"}}\')'),
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
        
        logger.info(`Listing people with params:`, { orderBy, filter, limit, depth });
        
        const queryParams = new URLSearchParams();
        if (orderBy) queryParams.append('orderBy', orderBy);
        if (filter) queryParams.append('filter', filter);
        queryParams.append('limit', limit.toString());
        queryParams.append('depth', depth.toString());
        if (startingAfter) queryParams.append('startingAfter', startingAfter);
        if (endingBefore) queryParams.append('endingBefore', endingBefore);
        
        const response = await client.makeRequest('GET', `/people?${queryParams.toString()}`);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              people: response.data?.people || [],
              pageInfo: response.pageInfo || {},
              totalCount: response.totalCount || 0,
              query: { orderBy, filter, limit, depth, startingAfter, endingBefore }
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error listing people:', error);
        return {
          content: [{
            type: 'text',
            text: `Error listing people: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 2. Get Person Tool
  server.registerTool(
    'get-person',
    {
      description: 'Get detailed information about a specific person by ID',
      inputSchema: {
        id: z.string().describe('UUID of the person to retrieve'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include (0-3, default 1)')
      }
    },
    async ({ id, depth = 1 }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Getting person ${id} with depth ${depth}`);
        
        const queryParams = new URLSearchParams();
        queryParams.append('depth', depth.toString());
        
        const response = await client.makeRequest('GET', `/people/${id}?${queryParams.toString()}`);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              person: response.data?.person || null
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error getting person:', error);
        return {
          content: [{
            type: 'text',
            text: `Error getting person: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 3. Create Person Tool
  server.registerTool(
    'create-person',
    {
      description: 'Create a new person/contact in Twenty CRM',
      inputSchema: {
        firstName: z.string().describe('First name of the person'),
        lastName: z.string().describe('Last name of the person'),
        primaryEmail: z.string().email().optional().describe('Primary email address'),
        additionalEmails: z.array(z.string().email()).optional().describe('Additional email addresses'),
        primaryPhoneNumber: z.string().optional().describe('Primary phone number'),
        primaryPhoneCountryCode: z.string().optional().describe('Phone country code (e.g. "DE")'),
        primaryPhoneCallingCode: z.string().optional().describe('Phone calling code (e.g. "+49")'),
        additionalPhones: z.array(z.string()).optional().describe('Additional phone numbers'),
        companyId: z.string().optional().describe('UUID of the company this person belongs to'),
        jobTitle: z.string().optional().describe('Job title/position'),
        city: z.string().optional().describe('City where the person is located'),
        avatarUrl: z.string().url().optional().describe('URL to avatar image'),
        position: z.number().optional().describe('Position/order for sorting'),
        katgeorie: z.enum(['KUNDE', 'VERBÄNDE', 'PARTNER', 'DIENSTLEISTER']).optional().describe('Person category'),
        linkedinUrl: z.string().url().optional().describe('LinkedIn profile URL'),
        linkedinLabel: z.string().optional().describe('LinkedIn link label'),
        xUrl: z.string().url().optional().describe('X/Twitter profile URL'),
        xLabel: z.string().optional().describe('X/Twitter link label'),
        createdBySource: z.enum(['EMAIL', 'CALENDAR', 'WORKFLOW', 'API', 'IMPORT', 'MANUAL', 'SYSTEM', 'WEBHOOK']).optional().describe('Source of creation')
      }
    },
    async (params, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Creating person: ${params.firstName} ${params.lastName}`);
        
        const personData: any = {
          name: {
            firstName: params.firstName,
            lastName: params.lastName
          }
        };

        // Add emails if provided
        if (params.primaryEmail || params.additionalEmails) {
          personData.emails = {};
          if (params.primaryEmail) {
            personData.emails.primaryEmail = params.primaryEmail;
          }
          if (params.additionalEmails && params.additionalEmails.length > 0) {
            personData.emails.additionalEmails = params.additionalEmails;
          }
        }

        // Add phones if provided
        if (params.primaryPhoneNumber || params.additionalPhones) {
          personData.phones = {};
          if (params.primaryPhoneNumber) {
            personData.phones.primaryPhoneNumber = params.primaryPhoneNumber;
            if (params.primaryPhoneCountryCode) {
              personData.phones.primaryPhoneCountryCode = params.primaryPhoneCountryCode;
            }
            if (params.primaryPhoneCallingCode) {
              personData.phones.primaryPhoneCallingCode = params.primaryPhoneCallingCode;
            }
          }
          if (params.additionalPhones && params.additionalPhones.length > 0) {
            personData.phones.additionalPhones = params.additionalPhones;
          }
        }

        // Add optional fields
        if (params.companyId) personData.companyId = params.companyId;
        if (params.jobTitle) personData.jobTitle = params.jobTitle;
        if (params.city) personData.city = params.city;
        if (params.avatarUrl) personData.avatarUrl = params.avatarUrl;
        if (params.position !== undefined) personData.position = params.position;
        if (params.katgeorie) personData.katgeorie = params.katgeorie;

        // Add LinkedIn link if provided
        if (params.linkedinUrl) {
          personData.linkedinLink = {
            primaryLinkUrl: params.linkedinUrl,
            primaryLinkLabel: params.linkedinLabel || 'LinkedIn'
          };
        }

        // Add X/Twitter link if provided
        if (params.xUrl) {
          personData.xLink = {
            primaryLinkUrl: params.xUrl,
            primaryLinkLabel: params.xLabel || 'X'
          };
        }

        // Add creation source if provided
        if (params.createdBySource) {
          personData.createdBy = {
            source: params.createdBySource
          };
        }
        
        const response = await client.makeRequest('POST', '/people', personData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              person: response.data?.createPerson || null,
              message: 'Person created successfully',
              linkedToCompany: !!params.companyId
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error creating person:', error);
        return {
          content: [{
            type: 'text',
            text: `Error creating person: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 4. Update Person Tool
  server.registerTool(
    'update-person',
    {
      description: 'Update an existing person/contact in Twenty CRM',
      inputSchema: {
        id: z.string().describe('UUID of the person to update'),
        firstName: z.string().optional().describe('First name of the person'),
        lastName: z.string().optional().describe('Last name of the person'),
        primaryEmail: z.string().email().optional().describe('Primary email address'),
        additionalEmails: z.array(z.string().email()).optional().describe('Additional email addresses'),
        primaryPhoneNumber: z.string().optional().describe('Primary phone number'),
        primaryPhoneCountryCode: z.string().optional().describe('Phone country code (e.g. "DE")'),
        primaryPhoneCallingCode: z.string().optional().describe('Phone calling code (e.g. "+49")'),
        additionalPhones: z.array(z.string()).optional().describe('Additional phone numbers'),
        companyId: z.string().nullable().optional().describe('UUID of the company (null to remove)'),
        jobTitle: z.string().optional().describe('Job title/position'),
        city: z.string().optional().describe('City where the person is located'),
        avatarUrl: z.string().url().optional().describe('URL to avatar image'),
        position: z.number().optional().describe('Position/order for sorting'),
        katgeorie: z.enum(['KUNDE', 'VERBÄNDE', 'PARTNER', 'DIENSTLEISTER']).optional().describe('Person category'),
        linkedinUrl: z.string().url().optional().describe('LinkedIn profile URL'),
        linkedinLabel: z.string().optional().describe('LinkedIn link label'),
        xUrl: z.string().url().optional().describe('X/Twitter profile URL'),
        xLabel: z.string().optional().describe('X/Twitter link label'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include in response (0-3, default 1)')
      }
    },
    async (params, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Updating person ${params.id}`);
        
        const updateData: any = {};

        // Update name if provided
        if (params.firstName || params.lastName) {
          updateData.name = {};
          if (params.firstName) updateData.name.firstName = params.firstName;
          if (params.lastName) updateData.name.lastName = params.lastName;
        }

        // Update emails if provided
        if (params.primaryEmail !== undefined || params.additionalEmails !== undefined) {
          updateData.emails = {};
          if (params.primaryEmail !== undefined) {
            updateData.emails.primaryEmail = params.primaryEmail;
          }
          if (params.additionalEmails !== undefined) {
            updateData.emails.additionalEmails = params.additionalEmails;
          }
        }

        // Update phones if provided
        if (params.primaryPhoneNumber !== undefined || params.additionalPhones !== undefined) {
          updateData.phones = {};
          if (params.primaryPhoneNumber !== undefined) {
            updateData.phones.primaryPhoneNumber = params.primaryPhoneNumber;
            if (params.primaryPhoneCountryCode) {
              updateData.phones.primaryPhoneCountryCode = params.primaryPhoneCountryCode;
            }
            if (params.primaryPhoneCallingCode) {
              updateData.phones.primaryPhoneCallingCode = params.primaryPhoneCallingCode;
            }
          }
          if (params.additionalPhones !== undefined) {
            updateData.phones.additionalPhones = params.additionalPhones;
          }
        }

        // Update optional fields
        if (params.companyId !== undefined) updateData.companyId = params.companyId;
        if (params.jobTitle !== undefined) updateData.jobTitle = params.jobTitle;
        if (params.city !== undefined) updateData.city = params.city;
        if (params.avatarUrl !== undefined) updateData.avatarUrl = params.avatarUrl;
        if (params.position !== undefined) updateData.position = params.position;
        if (params.katgeorie !== undefined) updateData.katgeorie = params.katgeorie;

        // Update LinkedIn link if provided
        if (params.linkedinUrl !== undefined) {
          updateData.linkedinLink = {
            primaryLinkUrl: params.linkedinUrl,
            primaryLinkLabel: params.linkedinLabel || 'LinkedIn'
          };
        }

        // Update X/Twitter link if provided
        if (params.xUrl !== undefined) {
          updateData.xLink = {
            primaryLinkUrl: params.xUrl,
            primaryLinkLabel: params.xLabel || 'X'
          };
        }

        const queryParams = new URLSearchParams();
        if (params.depth !== undefined) {
          queryParams.append('depth', params.depth.toString());
        }
        
        const response = await client.makeRequest('PATCH', `/people/${params.id}?${queryParams.toString()}`, updateData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              person: response.data?.updatePerson || null,
              message: 'Person updated successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error updating person:', error);
        return {
          content: [{
            type: 'text',
            text: `Error updating person: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 5. Delete Person Tool
  server.registerTool(
    'delete-person',
    {
      description: 'Delete a person/contact from Twenty CRM',
      inputSchema: {
        id: z.string().describe('UUID of the person to delete')
      }
    },
    async ({ id }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Deleting person ${id}`);
        
        const response = await client.makeRequest('DELETE', `/people/${id}`);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              deletedId: response.data?.deletePerson?.id || id,
              message: 'Person deleted successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error deleting person:', error);
        return {
          content: [{
            type: 'text',
            text: `Error deleting person: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 6. Batch Create People Tool
  server.registerTool(
    'batch-create-people',
    {
      description: 'Create multiple people/contacts at once in Twenty CRM',
      inputSchema: {
        people: z.array(z.object({
          firstName: z.string(),
          lastName: z.string(),
          primaryEmail: z.string().email().optional(),
          primaryPhoneNumber: z.string().optional(),
          companyId: z.string().optional(),
          jobTitle: z.string().optional(),
          city: z.string().optional(),
          katgeorie: z.enum(['KUNDE', 'VERBÄNDE', 'PARTNER', 'DIENSTLEISTER']).optional()
        })).describe('Array of people to create')
      }
    },
    async ({ people }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Batch creating ${people.length} people`);
        
        const peopleData = people.map(person => ({
          name: {
            firstName: person.firstName,
            lastName: person.lastName
          },
          ...(person.primaryEmail && {
            emails: { primaryEmail: person.primaryEmail }
          }),
          ...(person.primaryPhoneNumber && {
            phones: { primaryPhoneNumber: person.primaryPhoneNumber }
          }),
          ...(person.companyId && { companyId: person.companyId }),
          ...(person.jobTitle && { jobTitle: person.jobTitle }),
          ...(person.city && { city: person.city }),
          ...(person.katgeorie && { katgeorie: person.katgeorie })
        }));
        
        const response = await client.makeRequest('POST', '/batch/people', peopleData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              people: response.data?.createPeople || [],
              message: `${people.length} people created successfully`
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error batch creating people:', error);
        return {
          content: [{
            type: 'text',
            text: `Error batch creating people: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 7. Find People Duplicates Tool
  server.registerTool(
    'find-people-duplicates',
    {
      description: 'Find duplicate people in Twenty CRM based on provided data or IDs',
      inputSchema: {
        data: z.array(z.object({
          firstName: z.string(),
          lastName: z.string(),
          primaryEmail: z.string().optional()
        })).optional().describe('Array of people data to check for duplicates'),
        ids: z.array(z.string()).optional().describe('Array of person IDs to check for duplicates')
      }
    },
    async ({ data, ids }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Finding people duplicates`);
        
        const requestBody: any = {};
        if (data) {
          requestBody.data = data.map(person => ({
            name: {
              firstName: person.firstName,
              lastName: person.lastName
            },
            ...(person.primaryEmail && {
              emails: { primaryEmail: person.primaryEmail }
            })
          }));
        }
        if (ids) {
          requestBody.ids = ids;
        }
        
        const response = await client.makeRequest('POST', '/people/duplicates', requestBody);
        
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
        logger.error('Error finding people duplicates:', error);
        return {
          content: [{
            type: 'text',
            text: `Error finding people duplicates: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );
}