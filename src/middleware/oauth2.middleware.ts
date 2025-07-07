import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

export interface TenantRequest extends Request {
  tenantId?: string;
}

export class OAuth2Middleware {
  private jwksClient: jwksClient.JwksClient | null = null;

  constructor() {
    if (config.multiTenancy.enabled && config.multiTenancy.authMode === 'oauth2') {
      this.initializeJwksClient();
    }
  }

  private initializeJwksClient() {
    if (!config.multiTenancy.oauth2.jwksUrl) {
      throw new Error('OAUTH2_JWKS_URL is required when using OAuth2 authentication');
    }

    this.jwksClient = jwksClient({
      jwksUri: config.multiTenancy.oauth2.jwksUrl,
      requestHeaders: {},
      timeout: 30000,
    });
  }

  private async getSigningKey(kid: string): Promise<string> {
    if (!this.jwksClient) {
      throw new Error('JWKS client not initialized');
    }

    return new Promise((resolve, reject) => {
      this.jwksClient!.getSigningKey(kid, (err, key) => {
        if (err) {
          reject(err);
        } else {
          resolve(key?.getPublicKey() || '');
        }
      });
    });
  }

  public async validateJWT(req: TenantRequest, res: Response, next: NextFunction): Promise<Response<any, Record<string, any>> | void> {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
      }

      const token = authHeader.substring(7);
      const decoded = jwt.decode(token, { complete: true });

      if (!decoded || !decoded.header.kid) {
        return res.status(401).json({ error: 'Invalid JWT token' });
      }

      const signingKey = await this.getSigningKey(decoded.header.kid);
      
      const verified = jwt.verify(token, signingKey, {
        issuer: config.multiTenancy.oauth2.issuer,
        algorithms: ['RS256'],
      }) as any;

      if (!verified.sub) {
        return res.status(401).json({ error: 'JWT token missing subject claim' });
      }

      req.tenantId = verified.sub;
      next();
    } catch (error) {
      console.error('JWT validation error:', error);
      return res.status(401).json({ error: 'Invalid JWT token' });
    }
  }
}

export const oauth2Middleware = new OAuth2Middleware();