import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { config } from '../config';
import { TenantRequest } from '../models/mcp.types';

export class BearerMiddleware {
  private jwksClient: jwksClient.JwksClient | null = null;

  constructor() {
    if (config.multiTenancy.enabled && config.multiTenancy.authMode === 'bearer') {
      this.initializeJwksClient();
    }
  }

  private initializeJwksClient(): void {
    if (!config.multiTenancy.bearer.jwksUri) {
      throw new Error('BEARER_JWKS_URI must be configured for bearer token authentication');
    }

    this.jwksClient = jwksClient({
      jwksUri: config.multiTenancy.bearer.jwksUri,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600000, // 10 minutes
    });
  }

  private async getSigningKey(kid: string): Promise<string> {
    if (!this.jwksClient) {
      throw new Error('JWKS client not initialized');
    }

    const key = await this.jwksClient.getSigningKey(kid);
    return key.getPublicKey();
  }

  public async validateJWT(req: TenantRequest, res: Response, next: NextFunction): Promise<Response<any, Record<string, any>> | void> {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid bearer token' });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      
      // Decode header to get key ID
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
        return res.status(401).json({ error: 'Invalid token format' });
      }

      // Get signing key
      const signingKey = await this.getSigningKey(decoded.header.kid);
      
      // Verify token
      const verifyOptions: jwt.VerifyOptions = {
        algorithms: [config.multiTenancy.bearer.algorithm as jwt.Algorithm],
      };

      if (config.multiTenancy.bearer.issuer) {
        verifyOptions.issuer = config.multiTenancy.bearer.issuer;
      }

      if (config.multiTenancy.bearer.audience) {
        verifyOptions.audience = config.multiTenancy.bearer.audience;
      }

      const payload = jwt.verify(token, signingKey, verifyOptions) as jwt.JwtPayload;
      
      // Extract tenant ID from subject claim
      if (payload.sub) {
        req.tenantId = payload.sub;
      }

      next();
    } catch (error) {
      console.error('Bearer token validation failed:', error);
      return res.status(401).json({ error: 'Invalid bearer token' });
    }
  }
}

// Create singleton instance
export const bearerMiddleware = new BearerMiddleware();