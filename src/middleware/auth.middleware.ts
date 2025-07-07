import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { bearerMiddleware } from './bearer.middleware';
import { TenantRequest } from '../models/mcp.types';

/**
 * Middleware to authenticate MCP API requests
 * Supports both API key and Bearer JWT authentication based on configuration
 */
export const authenticateMCP = async (req: TenantRequest, res: Response, next: NextFunction): Promise<Response<any, Record<string, any>> | void> => {
  // Multi-tenancy with Bearer JWT
  if (config.multiTenancy.enabled && config.multiTenancy.authMode === 'bearer') {
    return await bearerMiddleware.validateJWT(req, res, next);
  }
  
  // Standard API key authentication (default behavior)
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  // Skip authentication for development environment
  if (config.server.nodeEnv === 'development' && !config.mcp.apiKey) {
    console.warn('Warning: Running without API key authentication in development mode');
    return next();
  }
  
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API key' });
  }
  
  if (apiKey !== config.mcp.apiKey) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  
  next();
};