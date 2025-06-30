import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Logger } from 'winston';
import { TwentyCRMClient } from '../twenty-client.js';

export function registerCompanyTools(
  server: McpServer,
  getClient: (sessionId?: string) => TwentyCRMClient,
  logger: Logger
) {
  // List companies
  server.registerTool(
    'list-companies',
    {

      description: 'Find and list companies in Twenty CRM',
      inputSchema: {
        orderBy: z.string().optional().describe('Field to order by (e.g., "createdAt", "name")'),
        filter: z.record(z.any()).optional().describe('Filter criteria as JSON object'),
        limit: z.number().min(1).max(60).optional().default(20).describe('Number of records to return'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include'),
        startingAfter: z.string().optional().describe('Cursor for pagination - starting after'),
        endingBefore: z.string().optional().describe('Cursor for pagination - ending before'),
        search: z.string().optional().describe('Search in company name or domain'),
        idealCustomerProfile: z.boolean().optional().describe('Filter by ideal customer profile'),
        targetAccount: z.boolean().optional().describe('Filter by target account status')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        
        // Build filter
        let filter = params.filter || {};
        if (params.search) {
          filter = {
            ...filter,
            or: [
              { name: { ilike: `%${params.search}%` } },
              { 'domainName.primaryLinkUrl': { ilike: `%${params.search}%` } }
            ]
          };
        }
        if (params.idealCustomerProfile !== undefined) {
          filter.idealCustomerProfile = { eq: params.idealCustomerProfile };
        }
        if (params.targetAccount !== undefined) {
          filter.targetAccount = { eq: params.targetAccount };
        }

        const response = await client.findManyCompanies({
          orderBy: params.orderBy,
          filter,
          limit: params.limit,
          depth: params.depth,
          startingAfter: params.startingAfter,
          endingBefore: params.endingBefore
        });

        const companies = response.data.companies || [];
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: companies.length,
              totalCount: response.totalCount,
              hasMore: response.pageInfo?.hasNextPage,
              companies: companies.map(c => ({
                id: c.id,
                name: c.name,
                domain: c.domainName?.primaryLinkUrl,
                employees: c.employees,
                idealCustomerProfile: c.idealCustomerProfile,
                targetAccount: c.targetAccount,
                peopleCount: c.people?.length || 0
              }))
            }, null, 2)
          }]
        };
      } catch (error) {
        logger.error('Error listing companies:', error);
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

  // Get company details
  server.registerTool(
    'get-company',
    {

      description: 'Get detailed information about a specific company',
      inputSchema: {
        id: z.string().describe('Company ID'),
        depth: z.number().min(0).max(3).optional().default(1).describe('Depth of related data to include')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        const response = await client.findOneCompany(params.id, params.depth);
        const company = response.data.company;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(company, null, 2)
          }]
        };
      } catch (error) {
        logger.error('Error getting company:', error);
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

  // Create company
  server.registerTool(
    'create-company',
    {

      description: 'Create a new company in Twenty CRM',
      inputSchema: {
        name: z.string().describe('Company name'),
        domainUrl: z.string().url().optional().describe('Company website URL'),
        employees: z.number().min(0).optional().describe('Number of employees'),
        idealCustomerProfile: z.boolean().optional().describe('Is this an ideal customer?'),
        targetAccount: z.boolean().optional().describe('Is this a target account?'),
        linkedinUrl: z.string().url().optional().describe('LinkedIn company page URL'),
        xUrl: z.string().url().optional().describe('X/Twitter company page URL'),
        annualRevenue: z.number().optional().describe('Annual recurring revenue in cents'),
        revenueCurrency: z.string().optional().default('USD').describe('Revenue currency code'),
        visaSponsorship: z.boolean().optional().describe('Does company offer visa sponsorship?'),
        address: z.object({
          street1: z.string().optional(),
          street2: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          country: z.string().optional(),
          postcode: z.string().optional()
        }).optional().describe('Company address')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        
        const data: any = {
          name: params.name,
          employees: params.employees,
          idealCustomerProfile: params.idealCustomerProfile,
          targetAccount: params.targetAccount,
          visaSponsorship: params.visaSponsorship
        };

        if (params.domainUrl) {
          data.domainName = {
            primaryLinkUrl: params.domainUrl,
            primaryLinkLabel: 'Website'
          };
        }

        if (params.linkedinUrl) {
          data.linkedinLink = {
            primaryLinkUrl: params.linkedinUrl,
            primaryLinkLabel: 'LinkedIn'
          };
        }

        if (params.xUrl) {
          data.xLink = {
            primaryLinkUrl: params.xUrl,
            primaryLinkLabel: 'X'
          };
        }

        if (params.annualRevenue !== undefined) {
          data.annualRecurringRevenue = {
            amountMicros: params.annualRevenue * 1000000, // Convert to micros
            currencyCode: params.revenueCurrency
          };
        }

        if (params.address) {
          data.address = {
            addressStreet1: params.address.street1,
            addressStreet2: params.address.street2,
            addressCity: params.address.city,
            addressState: params.address.state,
            addressCountry: params.address.country,
            addressPostcode: params.address.postcode
          };
        }

        const response = await client.createOneCompany(data, 1);
        const company = response.data.createCompany;

        return {
          content: [{
            type: 'text',
            text: `Created company: ${company.name} (ID: ${company.id})`
          }]
        };
      } catch (error) {
        logger.error('Error creating company:', error);
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

  // Update company
  server.registerTool(
    'update-company',
    {

      description: 'Update an existing company',
      inputSchema: {
        id: z.string().describe('Company ID'),
        name: z.string().optional().describe('Company name'),
        domainUrl: z.string().url().optional().describe('Company website URL'),
        employees: z.number().min(0).optional().describe('Number of employees'),
        idealCustomerProfile: z.boolean().optional().describe('Is this an ideal customer?'),
        targetAccount: z.boolean().optional().describe('Is this a target account?'),
        linkedinUrl: z.string().url().optional().describe('LinkedIn company page URL'),
        xUrl: z.string().url().optional().describe('X/Twitter company page URL'),
        annualRevenue: z.number().optional().describe('Annual recurring revenue in cents'),
        revenueCurrency: z.string().optional().describe('Revenue currency code'),
        visaSponsorship: z.boolean().optional().describe('Does company offer visa sponsorship?')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        const { id, ...updateData } = params;
        
        const data: any = {};
        
        if (updateData.name !== undefined) data.name = updateData.name;
        if (updateData.employees !== undefined) data.employees = updateData.employees;
        if (updateData.idealCustomerProfile !== undefined) data.idealCustomerProfile = updateData.idealCustomerProfile;
        if (updateData.targetAccount !== undefined) data.targetAccount = updateData.targetAccount;
        if (updateData.visaSponsorship !== undefined) data.visaSponsorship = updateData.visaSponsorship;
        
        if (updateData.domainUrl) {
          data.domainName = {
            primaryLinkUrl: updateData.domainUrl,
            primaryLinkLabel: 'Website'
          };
        }

        if (updateData.linkedinUrl) {
          data.linkedinLink = {
            primaryLinkUrl: updateData.linkedinUrl,
            primaryLinkLabel: 'LinkedIn'
          };
        }

        if (updateData.xUrl) {
          data.xLink = {
            primaryLinkUrl: updateData.xUrl,
            primaryLinkLabel: 'X'
          };
        }

        if (updateData.annualRevenue !== undefined) {
          data.annualRecurringRevenue = {
            amountMicros: updateData.annualRevenue * 1000000,
            currencyCode: updateData.revenueCurrency || 'USD'
          };
        }

        await client.updateOneCompany(id, data, 1);

        return {
          content: [{
            type: 'text',
            text: `Successfully updated company`
          }]
        };
      } catch (error) {
        logger.error('Error updating company:', error);
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

  // Delete company
  server.registerTool(
    'delete-company',
    {

      description: 'Delete a company from Twenty CRM',
      inputSchema: {
        id: z.string().describe('Company ID to delete')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        await client.deleteOneCompany(params.id);

        return {
          content: [{
            type: 'text',
            text: `Successfully deleted company with ID: ${params.id}`
          }]
        };
      } catch (error) {
        logger.error('Error deleting company:', error);
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