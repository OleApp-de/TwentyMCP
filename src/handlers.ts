import {
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { promptHandlers, prompts } from "./prompts.js";
import { resourceHandlers, resources } from "./resources.js";

export const setupPromptHandlers = (server: McpServer): void => {
  // Register enrich-and-create-crm-data prompt
  server.registerPrompt('enrich-and-create-crm-data', {
    description: 'Analysiere unstrukturierte Kontakt-/Unternehmensdaten, suche im Internet nach fehlenden Informationen und erstelle automatisch CRM-Einträge',
    argsSchema: {
      rawData: z.string().describe('Unstrukturierte Daten über Person(en) und Unternehmen - kann Text, E-Mails, Namen, teilweise Adressen etc. enthalten'),
      unternehmenstyp: z.enum(['HANDWERKSUNTERNEHMEN', 'PARTNER', 'DIENSTLEISTER']).optional().describe('Typ des Unternehmens'),
      status: z.enum(['INTERESSE', 'TRIAL', 'KUNDE', 'VERLOREN']).optional().describe('Aktueller Status'),
      priority: z.enum(['TODO', 'IN_PROGRESS']).optional().describe('Priorität für die Demo-Aufgabe'),
      assigneeId: z.string().optional().describe('UUID des Workspace-Members dem die Demo-Aufgabe zugewiesen werden soll')
    }
  }, async (args) => {
    return await promptHandlers['enrich-and-create-crm-data'](args);
  });

  // Register research-company-details prompt
  server.registerPrompt('research-company-details', {
    description: 'Recherchiere detaillierte Informationen über ein Unternehmen im Internet',
    argsSchema: {
      companyName: z.string().describe('Name des Unternehmens'),
      domain: z.string().optional().describe('Website/Domain des Unternehmens falls bekannt'),
      additionalInfo: z.string().optional().describe('Zusätzliche bekannte Informationen (Adresse, Branche, etc.)'),
      unternehmenstyp: z.enum(['HANDWERKSUNTERNEHMEN', 'PARTNER', 'DIENSTLEISTER']).optional().describe('Erwarteter Unternehmenstyp')
    }
  }, async (args) => {
    return await promptHandlers['research-company-details'](args);
  });

  // Register resources using the resource() method
  server.resource('twenty-api-documentation', 'twenty://api-documentation', async () => {
    return resourceHandlers['twenty://api-documentation']();
  });

  server.resource('twenty-quick-reference', 'twenty://quick-reference', async () => {
    return resourceHandlers['twenty://quick-reference']();
  });

  server.resource('twenty-available-tools', 'twenty://available-tools', async () => {
    return resourceHandlers['twenty://available-tools']();
  });
};