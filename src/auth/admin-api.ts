import { Router, Request, Response } from 'express';
import { setApiKeyForUser, getApiKeyForUser, removeApiKeyForUser } from './database.js';
import { AuthenticatedRequest } from './oauth.js';
import { z } from 'zod';

export const adminRouter = Router();

// Admin API Key - for simplicity, using env var
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'admin-key-please-change';

function requireAdminAuth(req: Request, res: Response, next: any) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ') || authHeader.substring(7) !== ADMIN_API_KEY) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Admin API key required'
    });
  }
  
  next();
}

// Schema für API Key Management
const SetApiKeySchema = z.object({
  twenty_api_key: z.string().min(1, 'API key is required'),
  metadata: z.record(z.any()).optional()
});

// GET /admin/users/:userId/api-key - Get API key for user
adminRouter.get('/users/:userId/api-key', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const apiKey = await getApiKeyForUser(userId);
    
    if (apiKey) {
      res.json({
        user_id: userId,
        has_api_key: true,
        api_key_preview: apiKey.substring(0, 8) + '...'
      });
    } else {
      res.json({
        user_id: userId,
        has_api_key: false
      });
    }
  } catch (error) {
    console.error('Error getting API key:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to get API key'
    });
  }
});

// POST /admin/users/:userId/api-key - Set API key for user
adminRouter.post('/users/:userId/api-key', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const parseResult = SetApiKeySchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Invalid request body',
        details: parseResult.error.errors
      });
    }
    
    const { twenty_api_key, metadata } = parseResult.data;
    
    await setApiKeyForUser(userId, twenty_api_key, metadata);
    
    res.json({
      success: true,
      message: 'API key set successfully',
      user_id: userId
    });
  } catch (error) {
    console.error('Error setting API key:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to set API key'
    });
  }
});

// DELETE /admin/users/:userId/api-key - Remove API key for user
adminRouter.delete('/users/:userId/api-key', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    await removeApiKeyForUser(userId);
    
    res.json({
      success: true,
      message: 'API key removed successfully',
      user_id: userId
    });
  } catch (error) {
    console.error('Error removing API key:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to remove API key'
    });
  }
});

// Self-service endpoint - User kann eigenen API Key setzen
adminRouter.post('/me/api-key', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Authentication required'
      });
    }
    
    const parseResult = SetApiKeySchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Invalid request body',
        details: parseResult.error.errors
      });
    }
    
    const { twenty_api_key, metadata } = parseResult.data;
    
    await setApiKeyForUser(authReq.userId, twenty_api_key, {
      ...metadata,
      self_service: true,
      updated_at: new Date().toISOString()
    });
    
    res.json({
      success: true,
      message: 'API key set successfully'
    });
  } catch (error) {
    console.error('Error setting API key:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to set API key'
    });
  }
});

// Health check endpoint
adminRouter.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'twenty-mcp-oauth-server'
  });
}); 