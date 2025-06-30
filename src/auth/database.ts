import { Database } from 'sqlite3';
import { promisify } from 'util';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';

let db: Database | null = null;

interface UserMapping {
  stytch_user_id: string;
  twenty_api_key: string;
  created_at: string;
  last_used: string | null;
  metadata: any;
}

interface TokenCache {
  access_token: string;
  stytch_user_id: string;
  twenty_api_key: string;
  expires_at: string;
}

export async function initializeDatabase(): Promise<void> {
  // Ensure data directory exists
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(path.join(dataDir, 'mappings.db'));
  
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not available'));
    
    // Create tables
    db.serialize(() => {
      db!.run(`
        CREATE TABLE IF NOT EXISTS user_api_mappings (
          stytch_user_id TEXT PRIMARY KEY,
          twenty_api_key_encrypted TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_used DATETIME,
          metadata TEXT DEFAULT '{}'
        )
      `);
      
      db!.run(`
        CREATE TABLE IF NOT EXISTS token_cache (
          access_token TEXT PRIMARY KEY,
          stytch_user_id TEXT NOT NULL,
          twenty_api_key_encrypted TEXT NOT NULL,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Database initialized successfully');
          resolve();
        }
      });
    });
  });
}

function encryptApiKey(apiKey: string): string {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(apiKey, salt);
}

function validateApiKey(apiKey: string, encrypted: string): boolean {
  return bcrypt.compareSync(apiKey, encrypted);
}

export async function getApiKeyForUser(stytchUserId: string): Promise<string | null> {
  if (!db) throw new Error('Database not initialized');
  
  return new Promise((resolve, reject) => {
    db!.get(
      'SELECT twenty_api_key_encrypted FROM user_api_mappings WHERE stytch_user_id = ?',
      [stytchUserId],
      (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (row) {
          // Update last_used
          db!.run(
            'UPDATE user_api_mappings SET last_used = CURRENT_TIMESTAMP WHERE stytch_user_id = ?',
            [stytchUserId]
          );
          
          resolve(row.twenty_api_key_encrypted);
        } else {
          // Fallback: Use default API key if configured
          resolve(process.env.DEFAULT_TWENTY_API_KEY || null);
        }
      }
    );
  });
}

export async function setApiKeyForUser(
  stytchUserId: string, 
  twentyApiKey: string,
  metadata: any = {}
): Promise<void> {
  if (!db) throw new Error('Database not initialized');
  
  return new Promise((resolve, reject) => {
    db!.run(
      `INSERT OR REPLACE INTO user_api_mappings 
       (stytch_user_id, twenty_api_key_encrypted, metadata) 
       VALUES (?, ?, ?)`,
      [stytchUserId, twentyApiKey, JSON.stringify(metadata)],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

export async function removeApiKeyForUser(stytchUserId: string): Promise<void> {
  if (!db) throw new Error('Database not initialized');
  
  return new Promise((resolve, reject) => {
    db!.serialize(() => {
      db!.run(
        'DELETE FROM user_api_mappings WHERE stytch_user_id = ?',
        [stytchUserId]
      );
      
      db!.run(
        'DELETE FROM token_cache WHERE stytch_user_id = ?',
        [stytchUserId],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  });
}

export async function cacheToken(
  accessToken: string,
  stytchUserId: string,
  twentyApiKey: string,
  expiresAt: Date
): Promise<void> {
  if (!db) throw new Error('Database not initialized');
  
  return new Promise((resolve, reject) => {
    db!.run(
      `INSERT OR REPLACE INTO token_cache 
       (access_token, stytch_user_id, twenty_api_key_encrypted, expires_at) 
       VALUES (?, ?, ?, ?)`,
      [accessToken, stytchUserId, twentyApiKey, expiresAt.toISOString()],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

export async function checkTokenCache(accessToken: string): Promise<{
  userId: string;
  twentyApiKey: string;
} | null> {
  if (!db) throw new Error('Database not initialized');
  
  return new Promise((resolve, reject) => {
    db!.get(
      'SELECT stytch_user_id, twenty_api_key_encrypted FROM token_cache WHERE access_token = ? AND expires_at > CURRENT_TIMESTAMP',
      [accessToken],
      (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (row) {
          resolve({
            userId: row.stytch_user_id,
            twentyApiKey: row.twenty_api_key_encrypted
          });
        } else {
          resolve(null);
        }
      }
    );
  });
}

export async function cleanupExpiredTokens(): Promise<void> {
  if (!db) throw new Error('Database not initialized');
  
  return new Promise((resolve, reject) => {
    db!.run(
      'DELETE FROM token_cache WHERE expires_at <= CURRENT_TIMESTAMP',
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
} 