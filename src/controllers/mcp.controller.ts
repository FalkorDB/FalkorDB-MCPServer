import { Request, Response } from 'express';
import { falkorDBService } from '../services/falkordb.service';

import { 
  MCPContextRequest, 
  MCPResponse, 
  MCPProviderMetadata,
  TenantRequest
} from '../models/mcp.types';

interface ErrorResponse {
  error: string;
  code?: string;
  details?: any;
  metadata?: {
    timestamp: string;
    tenantId?: string;
  };
}

interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export class MCPController {
  /**
   * Process MCP context requests
   */
  async processContextRequest(req: TenantRequest, res: Response): Promise<Response<any, Record<string, any>>> {
    try {
      const contextRequest: MCPContextRequest = req.body;
      
      // Input validation
      const validation = this.validateContextRequest(contextRequest);
      if (!validation.isValid) {
        const errorResponse: ErrorResponse = {
          error: 'Invalid request parameters',
          code: 'VALIDATION_ERROR',
          details: validation.errors,
          metadata: {
            timestamp: new Date().toISOString(),
            tenantId: req.tenantId
          }
        };
        return res.status(400).json(errorResponse);
      }
      
      const startTime = Date.now();
      
      // Execute the query on FalkorDB with tenant context and timeout
      const result = await this.executeWithTimeout(
        () => falkorDBService.executeQuery(
          contextRequest.graphName,
          contextRequest.query, 
          contextRequest.params,
          req.tenantId
        ),
        30000 // 30 second timeout
      );
      
      const queryTime = Date.now() - startTime;
      
      // Format the result according to MCP standards
      const formattedResult: MCPResponse = {
        data: result,
        metadata: {
          timestamp: new Date().toISOString(),
          queryTime,
          provider: 'FalkorDB MCP Server',
          source: 'falkordb',
          tenantId: req.tenantId
        }
      };
      
      return res.status(200).json(formattedResult);
    } catch (error: any) {
      console.error('Error processing MCP context request:', error);
      return this.handleError(error, res, req.tenantId);
    }
  }

  /**
   * Process MCP metadata requests
   */
  async processMetadataRequest(req: Request, res: Response): Promise<Response<any, Record<string, any>>>  {
    try {
      // Return metadata about available graphs or capabilities
      const metadata: MCPProviderMetadata = {
        provider: 'FalkorDB MCP Server',
        version: '1.0.0',
        capabilities: [
          'graph.query',
          'graph.list',
          'node.properties',
          'relationship.properties'
        ],
        graphTypes: ['property', 'directed'],
        queryLanguages: ['cypher'],
      };
      
      return res.status(200).json(metadata);
    } catch (error: any) {
      console.error('Error processing MCP metadata request:', error);
      return this.handleError(error, res);
    }
  }

  /**
   * List available graphs in FalkorDB
   */
  async listGraphs(req: TenantRequest, res: Response): Promise<Response<any, Record<string, any>>>  {
    try {
      const graphNames = await falkorDBService.listGraphs(req.tenantId);
      
      // Format the graph list into a more structured response
      const graphs = graphNames.map(name => ({
        name,
        // We don't have additional metadata from just the graph list
        // If needed, additional queries could be made for each graph
        // to fetch more detailed information
      }));
      
      return res.status(200).json({
        data: graphs,
        metadata: {
          timestamp: new Date().toISOString(),
          count: graphs.length,
          tenantId: req.tenantId
        }
      });
    } catch (error: any) {
      console.error('Error listing graphs:', error);
      return this.handleError(error, res, req.tenantId);
    }
  }
  
  private validateContextRequest(request: MCPContextRequest): { isValid: boolean; errors: ValidationError[] } {
    const errors: ValidationError[] = [];
    
    if (!request.query) {
      errors.push({ field: 'query', message: 'Query is required' });
    } else if (typeof request.query !== 'string') {
      errors.push({ field: 'query', message: 'Query must be a string', value: typeof request.query });
    } else if (request.query.trim().length === 0) {
      errors.push({ field: 'query', message: 'Query cannot be empty' });
    } else if (request.query.length > 10000) {
      errors.push({ field: 'query', message: 'Query too long (max 10000 characters)', value: request.query.length });
    }
    
    if (!request.graphName) {
      errors.push({ field: 'graphName', message: 'Graph name is required' });
    } else if (typeof request.graphName !== 'string') {
      errors.push({ field: 'graphName', message: 'Graph name must be a string', value: typeof request.graphName });
    } else if (request.graphName.trim().length === 0) {
      errors.push({ field: 'graphName', message: 'Graph name cannot be empty' });
    } else if (!/^[a-zA-Z0-9_-]+$/.test(request.graphName)) {
      errors.push({ field: 'graphName', message: 'Graph name contains invalid characters (only alphanumeric, underscore, and hyphen allowed)', value: request.graphName });
    }
    
    if (request.params !== undefined && request.params !== null) {
      if (typeof request.params !== 'object' || Array.isArray(request.params)) {
        errors.push({ field: 'params', message: 'Parameters must be an object', value: typeof request.params });
      } else {
        // Check for potentially dangerous parameter values
        for (const [key, value] of Object.entries(request.params)) {
          if (typeof key !== 'string' || key.trim().length === 0) {
            errors.push({ field: `params.${key}`, message: 'Parameter key must be a non-empty string' });
          }
          if (typeof value === 'string' && value.length > 1000) {
            errors.push({ field: `params.${key}`, message: 'Parameter value too long (max 1000 characters)', value: value.length });
          }
        }
      }
    }
    
    return { isValid: errors.length === 0, errors };
  }
  
  private async executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Operation timeout')), timeoutMs);
    });
    
    return Promise.race([operation(), timeoutPromise]);
  }
  
  private handleError(error: any, res: Response, tenantId?: string): Response {
    const timestamp = new Date().toISOString();
    
    // Determine error type and appropriate response
    let statusCode = 500;
    let errorCode = 'INTERNAL_ERROR';
    let errorMessage = 'An unexpected error occurred';
    
    if (error.message === 'Operation timeout') {
      statusCode = 504;
      errorCode = 'TIMEOUT_ERROR';
      errorMessage = 'Request timeout - operation took too long to complete';
    } else if (error.message && error.message.includes('connection')) {
      statusCode = 503;
      errorCode = 'CONNECTION_ERROR';
      errorMessage = 'Database connection unavailable';
    } else if (error.message && error.message.includes('authentication')) {
      statusCode = 401;
      errorCode = 'AUTH_ERROR';
      errorMessage = 'Authentication failed';
    } else if (error.message && error.message.includes('permission')) {
      statusCode = 403;
      errorCode = 'PERMISSION_ERROR';
      errorMessage = 'Insufficient permissions';
    } else if (error.message && error.message.includes('syntax')) {
      statusCode = 400;
      errorCode = 'SYNTAX_ERROR';
      errorMessage = 'Invalid query syntax';
    } else if (error.message) {
      // Use the actual error message for known errors
      errorMessage = error.message;
    }
    
    const errorResponse: ErrorResponse = {
      error: errorMessage,
      code: errorCode,
      metadata: {
        timestamp,
        tenantId
      }
    };
    
    // Include stack trace in development
    if (process.env.NODE_ENV === 'development' && error.stack) {
      errorResponse.details = { stack: error.stack };
    }
    
    return res.status(statusCode).json(errorResponse);
  }
}

export const mcpController = new MCPController();