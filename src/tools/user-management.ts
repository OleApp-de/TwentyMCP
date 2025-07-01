import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PostgresClient } from '../postgres-client.js';
import { z } from 'zod';
import { Logger } from 'winston';
import axios from 'axios';

// Generate a random password
function generateRandomPassword(length: number = 12): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

// Send invitation email via MailerSend
async function sendInvitationEmail(
  recipientEmail: string, 
  recipientName: string, 
  password: string,
  logger: Logger
): Promise<any> {
  const MAILERSEND_API_KEY = process.env.MAILERSEND_API_KEY;
  const TEMPLATE_ID = 'o65qngkv76jlwr12';
  const FROM_EMAIL = 'aljoscha@ole.de';
  
  if (!MAILERSEND_API_KEY) {
    throw new Error('MAILERSEND_API_KEY not configured');
  }

  const payload = {
    from: {
      email: FROM_EMAIL
    },
    to: [
      {
        email: recipientEmail
      }
    ],
    personalization: [
      {
        email: recipientEmail,
        data: {
          name: recipientName,
          Passwort: password,
          Benutzername: recipientEmail
        }
      }
    ],
    template_id: TEMPLATE_ID
  };

  try {
    const response = await axios.post(
      'https://api.mailersend.com/v1/email',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Authorization': `Bearer ${MAILERSEND_API_KEY}`
        }
      }
    );
    
    logger.info(`Invitation email sent successfully to ${recipientEmail}`);
    return response.data;
  } catch (error) {
    logger.error('Failed to send invitation email:', error);
    throw error;
  }
}

export function registerUserManagementTools(
  server: McpServer,
  getPostgresClient: () => PostgresClient,
  logger: Logger
): void {

  // 1. List Organizations Tool
  server.registerTool(
    'ole-app-list-organizations',
    {
      description: 'Ole-App Usermanagement: List all organizations in the Better Auth system',
      inputSchema: {}
    },
    async (params, extra) => {
      try {
        const client = getPostgresClient();
        
        logger.info('Listing organizations');
        
        const organizations = await client.listOrganizations();
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              organizations,
              count: organizations.length,
              message: 'Organizations retrieved successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error listing organizations:', error);
        return {
          content: [{
            type: 'text',
            text: `Error listing organizations: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 2. Get Organization Tool
  server.registerTool(
    'ole-app-get-organization',
    {
      description: 'Ole-App Usermanagement: Get detailed information about a specific organization',
      inputSchema: {
        id: z.string().describe('UUID of the organization to retrieve')
      }
    },
    async ({ id }, extra) => {
      try {
        const client = getPostgresClient();
        
        logger.info(`Getting organization ${id}`);
        
        const organization = await client.getOrganization(id);
        
        if (!organization) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                organization: null,
                message: 'Organization not found'
              }, null, 2)
            }]
          };
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              organization,
              message: 'Organization retrieved successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error getting organization:', error);
        return {
          content: [{
            type: 'text',
            text: `Error getting organization: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 3. Create Organization Tool
  server.registerTool(
    'ole-app-create-organization',
    {
      description: 'Ole-App Usermanagement: Create a new organization in the Better Auth system',
      inputSchema: {
        name: z.string().describe('Organization name'),
        slug: z.string().optional().describe('URL-friendly slug (auto-generated if not provided)'),
        street: z.string().optional().describe('Street address'),
        city: z.string().optional().describe('City'),
        postal_code: z.string().optional().describe('Postal code')
      }
    },
    async (params, extra) => {
      try {
        const client = getPostgresClient();
        
        logger.info(`Creating organization: ${params.name}`);
        
        // Build metadata object
        const metadata: any = {};
        if (params.street) metadata['street'] = params.street;
        if (params.city) metadata['city'] = params.city;
        if (params.postal_code) metadata['postal_code'] = params.postal_code;
        
        const organization = await client.createOrganization({
          name: params.name,
          slug: params.slug,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined
        });
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              organization,
              message: 'Organization created successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error creating organization:', error);
        return {
          content: [{
            type: 'text',
            text: `Error creating organization: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 4. Update Organization Tool
  server.registerTool(
    'ole-app-update-organization',
    {
      description: 'Ole-App Usermanagement: Update an existing organization',
      inputSchema: {
        id: z.string().describe('UUID of the organization to update'),
        name: z.string().optional().describe('Organization name'),
        slug: z.string().optional().describe('URL-friendly slug'),
        street: z.string().optional().describe('Street address'),
        city: z.string().optional().describe('City'),
        postal_code: z.string().optional().describe('Postal code')
      }
    },
    async (params, extra) => {
      try {
        const client = getPostgresClient();
        
        logger.info(`Updating organization ${params.id}`);
        
        // Build metadata object
        const metadata: any = {};
        if (params.street !== undefined) metadata['street'] = params.street;
        if (params.city !== undefined) metadata['city'] = params.city;
        if (params.postal_code !== undefined) metadata['postal_code'] = params.postal_code;
        
        const updateData: any = {};
        if (params.name) updateData.name = params.name;
        if (params.slug) updateData.slug = params.slug;
        if (Object.keys(metadata).length > 0) updateData.metadata = metadata;
        
        const organization = await client.updateOrganization(params.id, updateData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              organization,
              message: 'Organization updated successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error updating organization:', error);
        return {
          content: [{
            type: 'text',
            text: `Error updating organization: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 5. Delete Organization Tool
  server.registerTool(
    'ole-app-delete-organization',
    {
      description: 'Ole-App Usermanagement: Delete an organization and all associated users (WARNING: This is irreversible!)',
      inputSchema: {
        id: z.string().describe('UUID of the organization to delete'),
        confirm: z.boolean().describe('Confirmation flag - must be true to proceed with deletion')
      }
    },
    async ({ id, confirm }, extra) => {
      try {
        if (!confirm) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: 'Deletion not confirmed. Set confirm=true to proceed.'
              }, null, 2)
            }]
          };
        }
        
        const client = getPostgresClient();
        
        logger.info(`Deleting organization ${id}`);
        
        // Get organization details before deletion
        const org = await client.getOrganization(id);
        if (!org) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: 'Organization not found'
              }, null, 2)
            }]
          };
        }
        
        await client.deleteOrganization(id);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              deletedOrganization: org,
              message: `Organization "${org.name}" and all ${org.member_count} associated users deleted successfully`
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error deleting organization:', error);
        return {
          content: [{
            type: 'text',
            text: `Error deleting organization: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 6. List Users Tool
  server.registerTool(
    'ole-app-list-users',
    {
      description: 'Ole-App Usermanagement: List all users in an organization',
      inputSchema: {
        organizationId: z.string().describe('UUID of the organization')
      }
    },
    async ({ organizationId }, extra) => {
      try {
        const client = getPostgresClient();
        
        logger.info(`Listing users for organization ${organizationId}`);
        
        const users = await client.listUsers(organizationId);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              users,
              count: users.length,
              organizationId,
              message: 'Users retrieved successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error listing users:', error);
        return {
          content: [{
            type: 'text',
            text: `Error listing users: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 7. Get User Tool
  server.registerTool(
    'ole-app-get-user',
    {
      description: 'Ole-App Usermanagement: Get detailed information about a specific user',
      inputSchema: {
        id: z.string().describe('UUID of the user to retrieve')
      }
    },
    async ({ id }, extra) => {
      try {
        const client = getPostgresClient();
        
        logger.info(`Getting user ${id}`);
        
        const user = await client.getUser(id);
        
        if (!user) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                user: null,
                message: 'User not found'
              }, null, 2)
            }]
          };
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              user,
              message: 'User retrieved successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error getting user:', error);
        return {
          content: [{
            type: 'text',
            text: `Error getting user: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 8. Create User Tool
  server.registerTool(
    'ole-app-create-user',
    {
      description: 'Ole-App Usermanagement: Create a new user with auto-generated password',
      inputSchema: {
        email: z.string().email().describe('User email address'),
        first_name: z.string().describe('First name'),
        last_name: z.string().describe('Last name'),
        organizationId: z.string().describe('UUID of the organization'),
        role: z.string().optional().describe('User role (optional)'),
        position: z.string().optional().describe('Job position'),
        department: z.string().optional().describe('Department'),
        phone: z.string().optional().describe('Phone number'),
        location_city: z.string().optional().describe('City'),
        location_postal_code: z.string().optional().describe('Postal code'),
        location_lat: z.number().optional().describe('Latitude coordinate'),
        location_lng: z.number().optional().describe('Longitude coordinate'),
        member_role: z.enum(['member', 'admin', 'owner']).optional().describe('Organization member role (default: member)')
      }
    },
    async (params, extra) => {
      try {
        const client = getPostgresClient();
        
        // Generate a random password
        const generatedPassword = generateRandomPassword(12);
        
        logger.info(`Creating user: ${params.email}`);
        
        const user = await client.createUser({
          email: params.email,
          password: generatedPassword,
          first_name: params.first_name,
          last_name: params.last_name,
          organizationId: params.organizationId,
          role: params.role,
          position: params.position,
          department: params.department,
          phone: params.phone,
          location_city: params.location_city,
          location_postal_code: params.location_postal_code,
          location_lat: params.location_lat,
          location_lng: params.location_lng,
          member_role: params.member_role || 'member'
        });
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              user,
              credentials: {
                email: params.email.toLowerCase(),
                password: generatedPassword
              },
              generatedPassword,
              message: 'User created successfully with auto-generated password'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error creating user:', error);
        return {
          content: [{
            type: 'text',
            text: `Error creating user: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 9. Update User Tool
  server.registerTool(
    'ole-app-update-user',
    {
      description: 'Ole-App Usermanagement: Update an existing user',
      inputSchema: {
        id: z.string().describe('UUID of the user to update'),
        email: z.string().email().optional().describe('User email address'),
        password: z.string().min(6).optional().describe('New password'),
        first_name: z.string().optional().describe('First name'),
        last_name: z.string().optional().describe('Last name'),
        role: z.string().optional().describe('User role'),
        position: z.string().optional().describe('Job position'),
        department: z.string().optional().describe('Department'),
        phone: z.string().optional().describe('Phone number'),
        location_city: z.string().optional().describe('City'),
        location_postal_code: z.string().optional().describe('Postal code'),
        location_lat: z.number().optional().describe('Latitude coordinate'),
        location_lng: z.number().optional().describe('Longitude coordinate'),
        is_active: z.boolean().optional().describe('Active status'),
        email_verified: z.boolean().optional().describe('Email verification status'),
        member_role: z.enum(['member', 'admin', 'owner']).optional().describe('Organization member role'),
        organizationId: z.string().optional().describe('UUID of the organization (required if updating member_role)')
      }
    },
    async (params, extra) => {
      try {
        const client = getPostgresClient();
        
        logger.info(`Updating user ${params.id}`);
        
        const updateData: any = {};
        
        // Copy all provided fields
        const fields = [
          'email', 'password', 'first_name', 'last_name', 'role', 
          'position', 'department', 'phone', 'location_city', 
          'location_postal_code', 'location_lat', 'location_lng',
          'is_active', 'email_verified', 'member_role', 'organizationId'
        ];
        
        for (const field of fields) {
          if ((params as any)[field] !== undefined) {
            updateData[field] = (params as any)[field];
          }
        }
        
        const user = await client.updateUser(params.id, updateData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              user,
              message: 'User updated successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error updating user:', error);
        return {
          content: [{
            type: 'text',
            text: `Error updating user: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 10. Delete User Tool
  server.registerTool(
    'ole-app-delete-user',
    {
      description: 'Ole-App Usermanagement: Delete a user from the system (WARNING: This is irreversible!)',
      inputSchema: {
        id: z.string().describe('UUID of the user to delete'),
        confirm: z.boolean().describe('Confirmation flag - must be true to proceed with deletion')
      }
    },
    async ({ id, confirm }, extra) => {
      try {
        if (!confirm) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: 'Deletion not confirmed. Set confirm=true to proceed.'
              }, null, 2)
            }]
          };
        }
        
        const client = getPostgresClient();
        
        logger.info(`Deleting user ${id}`);
        
        // Get user details before deletion
        const user = await client.getUser(id);
        if (!user) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: 'User not found'
              }, null, 2)
            }]
          };
        }
        
        await client.deleteUser(id);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              deletedUser: {
                id: user.id,
                name: user.name,
                email: user.email
              },
              message: `User "${user.name}" (${user.email}) deleted successfully`
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error deleting user:', error);
        return {
          content: [{
            type: 'text',
            text: `Error deleting user: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

  // 11. Send Invitation Email Tool
  server.registerTool(
    'ole-app-send-invitation-email',
    {
      description: 'Ole-App Usermanagement: Send invitation email with login credentials via MailerSend',
      inputSchema: {
        recipientEmail: z.string().email().describe('Email address of the recipient'),
        recipientName: z.string().describe('Name of the recipient (will be used in email template)'),
        password: z.string().describe('Password to include in the invitation email')
      }
    },
    async ({ recipientEmail, recipientName, password }, extra) => {
      try {
        logger.info(`Sending invitation email to ${recipientEmail}`);
        
        const emailResult = await sendInvitationEmail(
          recipientEmail,
          recipientName,
          password,
          logger
        );
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              emailResult,
              recipient: {
                email: recipientEmail,
                name: recipientName
              },
              templateData: {
                name: recipientName,
                Passwort: password,
                Benutzername: recipientEmail
              },
              message: 'Invitation email sent successfully'
            }, null, 2)
          }]
        };
        
      } catch (error) {
        logger.error('Error sending invitation email:', error);
        return {
          content: [{
            type: 'text',
            text: `Error sending invitation email: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  );

}