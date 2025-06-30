import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Logger } from 'winston';
import { TwentyCRMClient } from '../twenty-client.js';

export function registerOpportunityTools(
  server: McpServer,
  getClient: (sessionId?: string) => TwentyCRMClient,
  logger: Logger
) {
  // List opportunities
  server.registerTool(
    'list-opportunities',
    {

      description: 'Find and list sales opportunities in Twenty CRM',
      inputSchema: {
        orderBy: z.string().optional().describe('Field to order by (e.g., "closeDate", "amount")'),
        filter: z.record(z.any()).optional().describe('Filter criteria as JSON object'),
        limit: z.number().min(1).max(60).optional().default(20).describe('Number of records to return'),
        depth: z.number().min(0).max(3).optional().describe('Depth of related data to include'),
        startingAfter: z.string().optional().describe('Cursor for pagination - starting after'),
        endingBefore: z.string().optional().describe('Cursor for pagination - ending before'),
        stage: z.enum(['NEW', 'SCREENING', 'MEETING', 'PROPOSAL', 'CUSTOMER']).optional().describe('Filter by opportunity stage'),
        search: z.string().optional().describe('Search in opportunity name')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        
        // Build filter
        let filter = params.filter || {};
        if (params.stage) {
          filter.stage = { eq: params.stage };
        }
        if (params.search) {
          filter.name = { ilike: `%${params.search}%` };
        }

        const response = await client.findManyOpportunities({
          orderBy: params.orderBy || 'closeDate',
          filter,
          limit: params.limit,
          depth: params.depth,
          startingAfter: params.startingAfter,
          endingBefore: params.endingBefore
        });

        const opportunities = response.data.opportunities || [];
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: opportunities.length,
              totalCount: response.totalCount,
              hasMore: response.pageInfo?.hasNextPage,
              opportunities: opportunities.map(o => ({
                id: o.id,
                name: o.name,
                stage: o.stage,
                amount: o.amount?.amountMicros ? o.amount.amountMicros / 1000000 : null,
                currency: o.amount?.currencyCode,
                closeDate: o.closeDate,
                company: o.company?.name,
                pointOfContact: o.pointOfContact?.name ? 
                  `${o.pointOfContact.name.firstName || ''} ${o.pointOfContact.name.lastName || ''}`.trim() : 
                  null
              }))
            }, null, 2)
          }]
        };
      } catch (error) {
        logger.error('Error listing opportunities:', error);
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

  // Create opportunity
  server.registerTool(
    'create-opportunity',
    {

      description: 'Create a new sales opportunity in Twenty CRM',
      inputSchema: {
        name: z.string().describe('Opportunity name'),
        stage: z.enum(['NEW', 'SCREENING', 'MEETING', 'PROPOSAL', 'CUSTOMER']).optional().default('NEW').describe('Opportunity stage'),
        amount: z.number().optional().describe('Opportunity amount in currency units'),
        currencyCode: z.string().optional().default('USD').describe('Currency code (e.g., USD, EUR)'),
        closeDate: z.string().optional().describe('Expected close date in ISO 8601 format'),
        position: z.number().optional().describe('Opportunity position/order')
      }
    },
    async (params, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        
        const data: any = {
          name: params.name,
          stage: params.stage,
          closeDate: params.closeDate,
          position: params.position
        };

        if (params.amount !== undefined) {
          data.amount = {
            amountMicros: params.amount * 1000000, // Convert to micros
            currencyCode: params.currencyCode
          };
        }

        await client.createOneOpportunity(data);

        return {
          content: [{
            type: 'text',
            text: `Created opportunity: "${params.name}" with stage ${params.stage}`
          }]
        };
      } catch (error) {
        logger.error('Error creating opportunity:', error);
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

  // Pipeline summary tool
  server.registerTool(
    'get-pipeline-summary',
    {

      description: 'Get a summary of the sales pipeline by stage',
      inputSchema: {}
    },
    async (_, extra) => {
      try {
        const client = getClient(String(extra?.requestId || 'default'));
        
        const stages = ['NEW', 'SCREENING', 'MEETING', 'PROPOSAL', 'CUSTOMER'];
        const summary: any = {
          totalOpportunities: 0,
          totalValue: 0,
          byStage: {}
        };

        for (const stage of stages) {
          const response = await client.findManyOpportunities({
            filter: { stage: { eq: stage } },
            limit: 60
          });
          
          const opportunities = response.data.opportunities || [];
          const stageValue = opportunities.reduce((sum, o) => {
            return sum + (o.amount?.amountMicros ? o.amount.amountMicros / 1000000 : 0);
          }, 0);

          summary.byStage[stage] = {
            count: opportunities.length,
            value: stageValue,
            opportunities: opportunities.slice(0, 5).map(o => ({
              name: o.name,
              amount: o.amount?.amountMicros ? o.amount.amountMicros / 1000000 : null,
              closeDate: o.closeDate
            }))
          };

          summary.totalOpportunities += opportunities.length;
          summary.totalValue += stageValue;
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(summary, null, 2)
          }]
        };
      } catch (error) {
        logger.error('Error getting pipeline summary:', error);
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