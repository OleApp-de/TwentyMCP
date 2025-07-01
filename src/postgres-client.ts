import { Client } from 'pg';
import { Logger } from 'winston';
import crypto from 'crypto';
import { randomBytes } from 'crypto';

export interface PostgresUser {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  image?: string;
  created_at: Date;
  updated_at: Date;
  role?: string;
  banned?: boolean;
  ban_reason?: string;
  ban_expires?: Date;
  first_name: string;
  last_name: string;
  phone?: string;
  position?: string;
  department?: string;
  location_city?: string;
  location_postal_code?: string;
  location_lat?: number;
  location_lng?: number;
  is_active: boolean;
  active_organization_id?: string;
  onboarding_completed_at?: Date;
  member_role?: string;
  member_id?: string;
}

export interface PostgresOrganization {
  id: string;
  name: string;
  slug?: string;
  created_at: Date;
  metadata?: any;
  member_count?: number;
}

export class PostgresClient {
  private client: Client;
  private logger: Logger;

  constructor(connectionString: string, logger: Logger) {
    this.client = new Client({ connectionString });
    this.logger = logger;
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.logger.info('PostgreSQL connection established');
    } catch (error) {
      this.logger.error('Failed to connect to PostgreSQL:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.end();
      this.logger.info('PostgreSQL connection closed');
    } catch (error) {
      this.logger.error('Error closing PostgreSQL connection:', error);
    }
  }

  /**
   * Better Auth compatible scrypt password hashing
   */
  hashPasswordScrypt(password: string): string {
    // NFKC normalization like Better Auth
    const normalizedPassword = password.normalize('NFKC');
    
    // Random salt (16 bytes)
    const salt = randomBytes(16);
    const saltHex = salt.toString('hex');
    
    // scrypt with EXACT Better Auth parameters
    const derivedKey = crypto.scryptSync(
      normalizedPassword, 
      saltHex, // salt as hex string, not bytes!
      64, // dklen
      {
        N: 16384, // n
        r: 16,    // Better Auth uses r=16!
        p: 1,     // p
        maxmem: 128 * 16384 * 16 * 2
      }
    );
    
    return `${saltHex}:${derivedKey.toString('hex')}`;
  }

  /**
   * Create URL-friendly slug
   */
  createSlug(text: string): string {
    let slug = text.toLowerCase();
    // Replace German umlauts
    slug = slug.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
    // Replace special characters
    slug = slug.replace(/[^a-z0-9]+/g, '-');
    // Remove multiple dashes
    slug = slug.replace(/-+/g, '-');
    return slug.replace(/^-|-$/g, '');
  }

  /**
   * List all organizations
   */
  async listOrganizations(): Promise<PostgresOrganization[]> {
    try {
      const query = `
        SELECT o.*, COUNT(m.id) as member_count
        FROM organization o
        LEFT JOIN member m ON o.id = m.organization_id
        GROUP BY o.id
        ORDER BY o.name
      `;
      
      const result = await this.client.query(query);
      return result.rows;
    } catch (error) {
      this.logger.error('Error listing organizations:', error);
      throw error;
    }
  }

  /**
   * Get organization by ID
   */
  async getOrganization(id: string): Promise<PostgresOrganization | null> {
    try {
      const query = `
        SELECT o.*, COUNT(m.id) as member_count
        FROM organization o
        LEFT JOIN member m ON o.id = m.organization_id
        WHERE o.id = $1
        GROUP BY o.id
      `;
      
      const result = await this.client.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      this.logger.error('Error getting organization:', error);
      throw error;
    }
  }

  /**
   * Create new organization
   */
  async createOrganization(data: {
    id?: string;
    name: string;
    slug?: string;
    metadata?: any;
  }): Promise<PostgresOrganization> {
    try {
      const id = data.id || crypto.randomUUID();
      const slug = data.slug || this.createSlug(data.name);
      
      const query = `
        INSERT INTO organization (id, name, slug, metadata, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING *
      `;
      
      const result = await this.client.query(query, [
        id,
        data.name,
        slug,
        data.metadata ? JSON.stringify(data.metadata) : null
      ]);
      
      return result.rows[0];
    } catch (error) {
      this.logger.error('Error creating organization:', error);
      throw error;
    }
  }

  /**
   * Update organization
   */
  async updateOrganization(id: string, data: {
    name?: string;
    slug?: string;
    metadata?: any;
  }): Promise<PostgresOrganization> {
    try {
      const slug = data.slug || (data.name ? this.createSlug(data.name) : undefined);
      
      const updates = [];
      const values = [];
      let paramCount = 1;
      
      if (data.name) {
        updates.push(`name = $${paramCount++}`);
        values.push(data.name);
      }
      
      if (slug) {
        updates.push(`slug = $${paramCount++}`);
        values.push(slug);
      }
      
      if (data.metadata !== undefined) {
        updates.push(`metadata = $${paramCount++}`);
        values.push(data.metadata ? JSON.stringify(data.metadata) : null);
      }
      
      if (updates.length === 0) {
        throw new Error('No fields to update');
      }
      
      values.push(id);
      
      const query = `
        UPDATE organization 
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;
      
      const result = await this.client.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('Organization not found');
      }
      
      return result.rows[0];
    } catch (error) {
      this.logger.error('Error updating organization:', error);
      throw error;
    }
  }

  /**
   * Delete organization and all associated users
   */
  async deleteOrganization(id: string): Promise<void> {
    try {
      await this.client.query('BEGIN');
      
      // Get all user IDs for this organization
      const userQuery = `
        SELECT user_id FROM member WHERE organization_id = $1
      `;
      const userResult = await this.client.query(userQuery, [id]);
      const userIds = userResult.rows.map(row => row.user_id);
      
      if (userIds.length > 0) {
        // Delete accounts
        await this.client.query(`
          DELETE FROM account WHERE user_id = ANY($1)
        `, [userIds]);
        
        // Delete members
        await this.client.query(`
          DELETE FROM member WHERE organization_id = $1
        `, [id]);
        
        // Delete users
        await this.client.query(`
          DELETE FROM "user" WHERE id = ANY($1)
        `, [userIds]);
      }
      
      // Delete organization
      await this.client.query(`
        DELETE FROM organization WHERE id = $1
      `, [id]);
      
      await this.client.query('COMMIT');
    } catch (error) {
      await this.client.query('ROLLBACK');
      this.logger.error('Error deleting organization:', error);
      throw error;
    }
  }

  /**
   * List users for organization
   */
  async listUsers(organizationId: string): Promise<PostgresUser[]> {
    try {
      const query = `
        SELECT u.*, m.role as member_role, m.id as member_id
        FROM "user" u
        JOIN member m ON u.id = m.user_id
        WHERE m.organization_id = $1
        ORDER BY u.first_name, u.last_name
      `;
      
      const result = await this.client.query(query, [organizationId]);
      return result.rows;
    } catch (error) {
      this.logger.error('Error listing users:', error);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUser(id: string): Promise<PostgresUser | null> {
    try {
      const query = `
        SELECT u.*, m.role as member_role, m.id as member_id
        FROM "user" u
        LEFT JOIN member m ON u.id = m.user_id
        WHERE u.id = $1
      `;
      
      const result = await this.client.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      this.logger.error('Error getting user:', error);
      throw error;
    }
  }

  /**
   * Create new user
   */
  async createUser(data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    role?: string;
    position?: string;
    department?: string;
    phone?: string;
    location_city?: string;
    location_postal_code?: string;
    location_lat?: number;
    location_lng?: number;
    organizationId: string;
    member_role?: string;
  }): Promise<PostgresUser> {
    try {
      await this.client.query('BEGIN');
      
      // Generate IDs
      const userId = crypto.randomUUID();
      const accountId = crypto.randomUUID();
      const memberId = crypto.randomUUID();
      
      // Hash password
      const hashedPassword = this.hashPasswordScrypt(data.password);
      
      // Normalize email to lowercase (Better Auth convention)
      const emailLowercase = data.email.toLowerCase();
      const fullName = `${data.first_name} ${data.last_name}`;
      
      // Insert user with ALL fields from the exact DB structure
      const userQuery = `
        INSERT INTO "user" (
          id, name, email, email_verified, image, created_at, updated_at,
          role, banned, ban_reason, ban_expires,
          first_name, last_name, phone, position, department,
          location_city, location_postal_code, location_lat, location_lng,
          is_active, active_organization_id, onboarding_completed_at
        ) VALUES (
          $1, $2, $3, true, NULL, NOW(), NOW(),
          $4, NULL, NULL, NULL,
          $5, $6, $7, $8, $9,
          $10, $11, $12, $13,
          true, $14, NOW()
        ) RETURNING *
      `;
      
      const userResult = await this.client.query(userQuery, [
        userId,
        fullName,
        emailLowercase,
        data.role || null,
        data.first_name,
        data.last_name,
        data.phone || null,
        data.position || null,
        data.department || null,
        data.location_city || null,
        data.location_postal_code || null,
        data.location_lat || null,
        data.location_lng || null,
        data.organizationId
      ]);
      
      // Insert account
      const accountQuery = `
        INSERT INTO account (
          id, account_id, provider_id, user_id, password, created_at, updated_at
        ) VALUES (
          $1, $2, 'credential', $3, $4, NOW(), NOW()
        )
      `;
      
      await this.client.query(accountQuery, [
        accountId,
        emailLowercase, // Better Auth expects lowercase email as account_id
        userId,
        hashedPassword
      ]);
      
      // Insert member
      const memberQuery = `
        INSERT INTO member (
          id, organization_id, user_id, role, created_at
        ) VALUES (
          $1, $2, $3, $4, NOW()
        )
      `;
      
      await this.client.query(memberQuery, [
        memberId,
        data.organizationId,
        userId,
        data.member_role || 'member'
      ]);
      
      await this.client.query('COMMIT');
      
      // Return created user with member role
      const createdUser = userResult.rows[0];
      createdUser.member_role = data.member_role || 'member';
      createdUser.member_id = memberId;
      
      return createdUser;
    } catch (error) {
      await this.client.query('ROLLBACK');
      this.logger.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Update user
   */
  async updateUser(id: string, data: {
    email?: string;
    password?: string;
    first_name?: string;
    last_name?: string;
    role?: string;
    position?: string;
    department?: string;
    phone?: string;
    location_city?: string;
    location_postal_code?: string;
    location_lat?: number;
    location_lng?: number;
    is_active?: boolean;
    email_verified?: boolean;
    member_role?: string;
    organizationId?: string;
  }): Promise<PostgresUser> {
    try {
      await this.client.query('BEGIN');
      
      // Build update query dynamically
      const updates = [];
      const values = [];
      let paramCount = 1;
      
      if (data.email) {
        const emailLowercase = data.email.toLowerCase();
        updates.push(`email = $${paramCount++}`);
        values.push(emailLowercase);
        
        // Update account_id if email changed
        await this.client.query(`
          UPDATE account SET account_id = $1
          WHERE user_id = $2 AND provider_id = 'credential'
        `, [emailLowercase, id]);
      }
      
      if (data.first_name) {
        updates.push(`first_name = $${paramCount++}`);
        values.push(data.first_name);
      }
      
      if (data.last_name) {
        updates.push(`last_name = $${paramCount++}`);
        values.push(data.last_name);
      }
      
      // Update name if first_name or last_name changed
      if (data.first_name || data.last_name) {
        const currentUser = await this.getUser(id);
        const firstName = data.first_name || currentUser?.first_name || '';
        const lastName = data.last_name || currentUser?.last_name || '';
        updates.push(`name = $${paramCount++}`);
        values.push(`${firstName} ${lastName}`);
      }
      
      const fieldsToUpdate = [
        'role', 'position', 'department', 'phone',
        'location_city', 'location_postal_code', 'location_lat', 'location_lng',
        'is_active', 'email_verified'
      ];
      
      for (const field of fieldsToUpdate) {
        if ((data as any)[field] !== undefined) {
          updates.push(`${field} = $${paramCount++}`);
          values.push((data as any)[field]);
        }
      }
      
      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        values.push(id);
        
        const userQuery = `
          UPDATE "user" 
          SET ${updates.join(', ')}
          WHERE id = $${paramCount}
          RETURNING *
        `;
        
        await this.client.query(userQuery, values);
      }
      
      // Update password if provided
      if (data.password) {
        const hashedPassword = this.hashPasswordScrypt(data.password);
        await this.client.query(`
          UPDATE account SET password = $1, updated_at = NOW()
          WHERE user_id = $2 AND provider_id = 'credential'
        `, [hashedPassword, id]);
      }
      
      // Update member role if provided
      if (data.member_role && data.organizationId) {
        await this.client.query(`
          UPDATE member SET role = $1
          WHERE user_id = $2 AND organization_id = $3
        `, [data.member_role, id, data.organizationId]);
      }
      
      await this.client.query('COMMIT');
      
      // Return updated user
      return await this.getUser(id) as PostgresUser;
    } catch (error) {
      await this.client.query('ROLLBACK');
      this.logger.error('Error updating user:', error);
      throw error;
    }
  }

  /**
   * Delete user
   */
  async deleteUser(id: string): Promise<void> {
    try {
      await this.client.query('BEGIN');
      
      // Delete in correct order (foreign keys)
      await this.client.query('DELETE FROM member WHERE user_id = $1', [id]);
      await this.client.query('DELETE FROM account WHERE user_id = $1', [id]);
      await this.client.query('DELETE FROM "user" WHERE id = $1', [id]);
      
      await this.client.query('COMMIT');
    } catch (error) {
      await this.client.query('ROLLBACK');
      this.logger.error('Error deleting user:', error);
      throw error;
    }
  }

  /**
   * Generate SQL export for users
   */
  async generateSqlExport(organizationId: string): Promise<string> {
    try {
      const org = await this.getOrganization(organizationId);
      const users = await this.listUsers(organizationId);
      
      if (!org) {
        throw new Error('Organization not found');
      }
      
      let sql = `-- Better Auth SQL Export
-- Organization: ${org.name} (${org.id})
-- Generated: ${new Date().toISOString()}
-- Users: ${users.length}

`;
      
      for (const user of users) {
        sql += `-- User: ${user.first_name} ${user.last_name} (${user.email})
INSERT INTO "user" (
    id, name, email, email_verified, created_at, updated_at,
    first_name, last_name, role, position, department, phone,
    location_city, location_postal_code, location_lat, location_lng,
    is_active, active_organization_id, onboarding_completed_at
) VALUES (
    '${user.id}',
    '${user.name}',
    '${user.email}',
    ${user.email_verified},
    '${user.created_at.toISOString()}',
    '${user.updated_at.toISOString()}',
    '${user.first_name}',
    '${user.last_name}',
    ${user.role ? `'${user.role}'` : 'NULL'},
    ${user.position ? `'${user.position}'` : 'NULL'},
    ${user.department ? `'${user.department}'` : 'NULL'},
    ${user.phone ? `'${user.phone}'` : 'NULL'},
    ${user.location_city ? `'${user.location_city}'` : 'NULL'},
    ${user.location_postal_code ? `'${user.location_postal_code}'` : 'NULL'},
    ${user.location_lat || 'NULL'},
    ${user.location_lng || 'NULL'},
    ${user.is_active},
    '${organizationId}',
    '${user.onboarding_completed_at?.toISOString() || new Date().toISOString()}'
);

`;
      }
      
      return sql;
    } catch (error) {
      this.logger.error('Error generating SQL export:', error);
      throw error;
    }
  }
}