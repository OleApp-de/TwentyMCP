import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TwentyCRMClient } from '../twenty-client.js';
import { z } from 'zod';
import { Logger } from 'winston';

export function registerCompanyTools(
  server: McpServer,
  getClient: (sessionId?: string) => TwentyCRMClient,
  logger: Logger
): void {

  // 1. List Companies Tool
  server.registerTool(
    'twenty-crm-list-companies',
    {
      description: 'Twenty CRM: List and search companies/organizations in Twenty CRM with advanced filtering and pagination',
      inputSchema: {
        orderBy: z.string().optional().describe('Sort order (e.g. "createdAt", "name", "employees")'),
        filter: z.string().optional().describe('Filter criteria as JSON string (e.g. \'{"status":{"eq":"KUNDE"}}\')'),
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
        
        logger.info(`Listing companies with params:`, { orderBy, filter, limit, depth });
        
        const queryParams = new URLSearchParams();
        if (orderBy) queryParams.append('orderBy', orderBy);
        if (filter) queryParams.append('filter', filter);
        queryParams.append('limit', limit.toString());
        queryParams.append('depth', depth.toString());
        if (startingAfter) queryParams.append('startingAfter', startingAfter);
        if (endingBefore) queryParams.append('endingBefore', endingBefore);
        
        const response = await client.makeRequest('GET', `/companies?${queryParams.toString()}`);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              companies: response.data?.companies || [],
              pageInfo: response.pageInfo || {},
              totalCount: response.totalCount || 0,
              query: { orderBy, filter, limit, depth, startingAfter, endingBefore }
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error listing companies:', error);
        return {
          content: [{
            type: 'text',
            text: `Error listing companies: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 2. Get Company Tool
  server.registerTool(
    'twenty-crm-get-company',
    {
      description: 'Twenty CRM: Get detailed information about a specific company by ID',
      inputSchema: {
        id: z.string().describe('UUID of the company to retrieve'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include (0-3, default 1)')
      }
    },
    async ({ id, depth = 1 }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Getting company ${id} with depth ${depth}`);
        
        const queryParams = new URLSearchParams();
        queryParams.append('depth', depth.toString());
        
        const response = await client.makeRequest('GET', `/companies/${id}?${queryParams.toString()}`);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              company: response.data?.company || null
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error getting company:', error);
        return {
          content: [{
            type: 'text',
            text: `Error getting company: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 3. Create Company Tool
  server.registerTool(
    'twenty-crm-create-company',
    {
      description: 'Twenty CRM: Create a new company/organization in Twenty CRM',
      inputSchema: {
        name: z.string().describe('Company name'),
        domainName: z.string().optional().describe('Company domain name'),
        domainUrl: z.string().url().optional().describe('Company website URL'),
        domainLabel: z.string().optional().describe('Domain link label'),
        addressStreet1: z.string().optional().describe('Street address line 1'),
        addressStreet2: z.string().optional().describe('Street address line 2'),
        addressCity: z.string().optional().describe('City'),
        addressState: z.string().optional().describe('State/Province'),
        addressPostcode: z.string().optional().describe('Postal/ZIP code'),
        addressCountry: z.string().optional().describe('Country'),
        addressLat: z.number().optional().describe('Latitude coordinate'),
        addressLng: z.number().optional().describe('Longitude coordinate'),
        employees: z.number().int().optional().describe('Number of employees'),
        linkedinUrl: z.string().url().optional().describe('LinkedIn company page URL'),
        linkedinLabel: z.string().optional().describe('LinkedIn link label'),
        xUrl: z.string().url().optional().describe('X/Twitter company page URL'),
        xLabel: z.string().optional().describe('X/Twitter link label'),
        annualRevenueAmount: z.number().optional().describe('Annual recurring revenue amount (in micros)'),
        annualRevenueCurrency: z.string().optional().describe('Currency code (e.g. "EUR", "USD")'),
        position: z.number().optional().describe('Position/order for sorting'),
        idealCustomerProfile: z.boolean().optional().describe('Mark as ideal customer profile'),
        accountOwnerId: z.string().optional().describe('UUID of the account owner'),
        status: z.enum(['INTERESSE', 'TRIAL', 'KUNDE', 'VERLOREN']).optional().describe('Company status'),
        unternehmenstyp: z.enum(['HANDWERKSUNTERNEHMEN', 'PARTNER', 'DIENSTLEISTER']).optional().describe('Company type'),
        source: z.string().optional().describe('Source information (text field)'),
        demoerstellung: z.string().optional().describe('Demo creation date and time in ISO 8601 format (e.g. "2025-06-30T18:40:51.452Z")'),
        createdBySource: z.enum(['EMAIL', 'CALENDAR', 'WORKFLOW', 'API', 'IMPORT', 'MANUAL', 'SYSTEM', 'WEBHOOK']).optional().describe('Source of creation')
      }
    },
    async (params, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Creating company: ${params.name}`);
        
        const companyData: any = {
          name: params.name
        };

        // Add domain info if provided
        if (params.domainName || params.domainUrl) {
          companyData.domainName = {
            primaryLinkLabel: params.domainLabel || 'Website',
            primaryLinkUrl: params.domainUrl || `https://${params.domainName}`,
            ...(params.domainName && { domainName: params.domainName })
          };
        }

        // Add address if any address field is provided
        if (params.addressStreet1 || params.addressCity || params.addressCountry) {
          companyData.address = {};
          if (params.addressStreet1) companyData.address.addressStreet1 = params.addressStreet1;
          if (params.addressStreet2) companyData.address.addressStreet2 = params.addressStreet2;
          if (params.addressCity) companyData.address.addressCity = params.addressCity;
          if (params.addressState) companyData.address.addressState = params.addressState;
          if (params.addressPostcode) companyData.address.addressPostcode = params.addressPostcode;
          if (params.addressCountry) companyData.address.addressCountry = params.addressCountry;
          if (params.addressLat !== undefined) companyData.address.addressLat = params.addressLat;
          if (params.addressLng !== undefined) companyData.address.addressLng = params.addressLng;
        }

        // Add optional fields
        if (params.employees !== undefined) companyData.employees = params.employees;
        if (params.position !== undefined) companyData.position = params.position;
        if (params.idealCustomerProfile !== undefined) companyData.idealCustomerProfile = params.idealCustomerProfile;
        if (params.accountOwnerId) companyData.accountOwnerId = params.accountOwnerId;
        if (params.status) companyData.status = params.status;
        if (params.unternehmenstyp) companyData.unternehmenstyp = params.unternehmenstyp;
        if (params.source) companyData.source = params.source;
        if (params.demoerstellung) companyData.demoerstellung = params.demoerstellung;

        // Add LinkedIn link if provided
        if (params.linkedinUrl) {
          companyData.linkedinLink = {
            primaryLinkUrl: params.linkedinUrl,
            primaryLinkLabel: params.linkedinLabel || 'LinkedIn'
          };
        }

        // Add X/Twitter link if provided
        if (params.xUrl) {
          companyData.xLink = {
            primaryLinkUrl: params.xUrl,
            primaryLinkLabel: params.xLabel || 'X'
          };
        }

        // Add annual revenue if provided
        if (params.annualRevenueAmount !== undefined) {
          companyData.annualRecurringRevenue = {
            amountMicros: params.annualRevenueAmount,
            currencyCode: params.annualRevenueCurrency || 'EUR'
          };
        }

        // Add creation source if provided
        if (params.createdBySource) {
          companyData.createdBy = {
            source: params.createdBySource
          };
        }
        
        const response = await client.makeRequest('POST', '/companies', companyData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              company: response.data?.createCompany || null,
              message: 'Company created successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error creating company:', error);
        return {
          content: [{
            type: 'text',
            text: `Error creating company: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 4. Update Company Tool
  server.registerTool(
    'twenty-crm-update-company',
    {
      description: 'Twenty CRM: Update an existing company/organization in Twenty CRM',
      inputSchema: {
        id: z.string().describe('UUID of the company to update'),
        name: z.string().optional().describe('Company name'),
        domainName: z.string().optional().describe('Company domain name'),
        domainUrl: z.string().url().optional().describe('Company website URL'),
        domainLabel: z.string().optional().describe('Domain link label'),
        addressStreet1: z.string().optional().describe('Street address line 1'),
        addressStreet2: z.string().optional().describe('Street address line 2'),
        addressCity: z.string().optional().describe('City'),
        addressState: z.string().optional().describe('State/Province'),
        addressPostcode: z.string().optional().describe('Postal/ZIP code'),
        addressCountry: z.string().optional().describe('Country'),
        addressLat: z.number().optional().describe('Latitude coordinate'),
        addressLng: z.number().optional().describe('Longitude coordinate'),
        employees: z.number().int().optional().describe('Number of employees'),
        linkedinUrl: z.string().url().optional().describe('LinkedIn company page URL'),
        linkedinLabel: z.string().optional().describe('LinkedIn link label'),
        xUrl: z.string().url().optional().describe('X/Twitter company page URL'),
        xLabel: z.string().optional().describe('X/Twitter link label'),
        annualRevenueAmount: z.number().optional().describe('Annual recurring revenue amount (in micros)'),
        annualRevenueCurrency: z.string().optional().describe('Currency code (e.g. "EUR", "USD")'),
        position: z.number().optional().describe('Position/order for sorting'),
        idealCustomerProfile: z.boolean().optional().describe('Mark as ideal customer profile'),
        accountOwnerId: z.string().nullable().optional().describe('UUID of the account owner (null to remove)'),
        status: z.enum(['INTERESSE', 'TRIAL', 'KUNDE', 'VERLOREN']).optional().describe('Company status'),
        unternehmenstyp: z.enum(['HANDWERKSUNTERNEHMEN', 'PARTNER', 'DIENSTLEISTER']).optional().describe('Company type'),
        source: z.string().optional().describe('Source information (text field)'),
        demoerstellung: z.string().optional().describe('Demo creation date and time in ISO 8601 format (e.g. "2025-06-30T18:40:51.452Z")'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include in response (0-3, default 1)')
      }
    },
    async (params, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Updating company ${params.id}`);
        
        const updateData: any = {};

        // Update basic fields
        if (params.name !== undefined) updateData.name = params.name;

        // Update domain info if provided
        if (params.domainName !== undefined || params.domainUrl !== undefined) {
          updateData.domainName = {
            primaryLinkLabel: params.domainLabel || 'Website',
            primaryLinkUrl: params.domainUrl || `https://${params.domainName}`,
            ...(params.domainName && { domainName: params.domainName })
          };
        }

        // Update address if any address field is provided
        if (params.addressStreet1 !== undefined || params.addressCity !== undefined || 
            params.addressCountry !== undefined || params.addressState !== undefined ||
            params.addressPostcode !== undefined || params.addressStreet2 !== undefined ||
            params.addressLat !== undefined || params.addressLng !== undefined) {
          updateData.address = {};
          if (params.addressStreet1 !== undefined) updateData.address.addressStreet1 = params.addressStreet1;
          if (params.addressStreet2 !== undefined) updateData.address.addressStreet2 = params.addressStreet2;
          if (params.addressCity !== undefined) updateData.address.addressCity = params.addressCity;
          if (params.addressState !== undefined) updateData.address.addressState = params.addressState;
          if (params.addressPostcode !== undefined) updateData.address.addressPostcode = params.addressPostcode;
          if (params.addressCountry !== undefined) updateData.address.addressCountry = params.addressCountry;
          if (params.addressLat !== undefined) updateData.address.addressLat = params.addressLat;
          if (params.addressLng !== undefined) updateData.address.addressLng = params.addressLng;
        }

        // Update optional fields
        if (params.employees !== undefined) updateData.employees = params.employees;
        if (params.position !== undefined) updateData.position = params.position;
        if (params.idealCustomerProfile !== undefined) updateData.idealCustomerProfile = params.idealCustomerProfile;
        if (params.accountOwnerId !== undefined) updateData.accountOwnerId = params.accountOwnerId;
        if (params.status !== undefined) updateData.status = params.status;
        if (params.unternehmenstyp !== undefined) updateData.unternehmenstyp = params.unternehmenstyp;
        if (params.source !== undefined) updateData.source = params.source;
        if (params.demoerstellung !== undefined) updateData.demoerstellung = params.demoerstellung;

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

        // Update annual revenue if provided
        if (params.annualRevenueAmount !== undefined) {
          updateData.annualRecurringRevenue = {
            amountMicros: params.annualRevenueAmount,
            currencyCode: params.annualRevenueCurrency || 'EUR'
          };
        }

        const queryParams = new URLSearchParams();
        if (params.depth !== undefined) {
          queryParams.append('depth', params.depth.toString());
        }
        
        const response = await client.makeRequest('PATCH', `/companies/${params.id}?${queryParams.toString()}`, updateData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              company: response.data?.updateCompany || null,
              message: 'Company updated successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error updating company:', error);
        return {
          content: [{
            type: 'text',
            text: `Error updating company: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 5. Delete Company Tool
  server.registerTool(
    'twenty-crm-delete-company',
    {
      description: 'Twenty CRM: Delete a company/organization from Twenty CRM',
      inputSchema: {
        id: z.string().describe('UUID of the company to delete')
      }
    },
    async ({ id }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Deleting company ${id}`);
        
        const response = await client.makeRequest('DELETE', `/companies/${id}`);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              deletedId: response.data?.deleteCompany?.id || id,
              message: 'Company deleted successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error deleting company:', error);
        return {
          content: [{
            type: 'text',
            text: `Error deleting company: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 6. Batch Create Companies Tool
  server.registerTool(
    'twenty-crm-batch-create-companies',
    {
      description: 'Twenty CRM: Create multiple companies/organizations at once in Twenty CRM',
      inputSchema: {
        companies: z.array(z.object({
          name: z.string(),
          domainName: z.string().optional(),
          addressCity: z.string().optional(),
          addressCountry: z.string().optional(),
          employees: z.number().int().optional(),
          status: z.enum(['INTERESSE', 'TRIAL', 'KUNDE', 'VERLOREN']).optional(),
          unternehmenstyp: z.enum(['HANDWERKSUNTERNEHMEN', 'PARTNER', 'DIENSTLEISTER']).optional(),
          idealCustomerProfile: z.boolean().optional()
        })).describe('Array of companies to create')
      }
    },
    async ({ companies }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Batch creating ${companies.length} companies`);
        
        const companiesData = companies.map(company => ({
          name: company.name,
          ...(company.domainName && {
            domainName: {
              primaryLinkLabel: 'Website',
              primaryLinkUrl: `https://${company.domainName}`
            }
          }),
          ...(company.addressCity || company.addressCountry) && {
            address: {
              ...(company.addressCity && { addressCity: company.addressCity }),
              ...(company.addressCountry && { addressCountry: company.addressCountry })
            }
          },
          ...(company.employees !== undefined && { employees: company.employees }),
          ...(company.status && { status: company.status }),
          ...(company.unternehmenstyp && { unternehmenstyp: company.unternehmenstyp }),
          ...(company.idealCustomerProfile !== undefined && { idealCustomerProfile: company.idealCustomerProfile })
        }));
        
        const response = await client.makeRequest('POST', '/batch/companies', companiesData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              companies: response.data?.createCompanies || [],
              message: `${companies.length} companies created successfully`
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error batch creating companies:', error);
        return {
          content: [{
            type: 'text',
            text: `Error batch creating companies: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 7. Find Company Duplicates Tool
  server.registerTool(
    'twenty-crm-find-company-duplicates',
    {
      description: 'Twenty CRM: Find duplicate companies in Twenty CRM based on provided data or IDs',
      inputSchema: {
        data: z.array(z.object({
          name: z.string(),
          domainName: z.string().optional()
        })).optional().describe('Array of company data to check for duplicates'),
        ids: z.array(z.string()).optional().describe('Array of company IDs to check for duplicates')
      }
    },
    async ({ data, ids }, extra) => {
      try {
        const sessionId = String(extra?.requestId || 'default');
        const client = getClient(sessionId);
        
        logger.info(`Finding company duplicates`);
        
        const requestBody: any = {};
        if (data) {
          requestBody.data = data.map(company => ({
            name: company.name,
            ...(company.domainName && {
              domainName: {
                primaryLinkLabel: 'Website',
                primaryLinkUrl: `https://${company.domainName}`
              }
            })
          }));
        }
        if (ids) {
          requestBody.ids = ids;
        }
        
        const response = await client.makeRequest('POST', '/companies/duplicates', requestBody);
        
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
        logger.error('Error finding company duplicates:', error);
        return {
          content: [{
            type: 'text',
            text: `Error finding company duplicates: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );
}