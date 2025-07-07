/**
 * MCP Types - based on Model Context Protocol specification
 */

import { Request } from 'express';

export interface TenantRequest extends Request {
  tenantId?: string;
}

export interface MCPContextRequest {
  graphName: string;
  query: string;
  params?: Record<string, any>;
  context?: Record<string, any>;
  options?: MCPOptions;
}

export interface MCPOptions {
  timeout?: number;
  maxResults?: number;
  [key: string]: any;
}

export interface MCPResponse {
  data: any;
  metadata: MCPMetadata;
}

export interface MCPMetadata {
  timestamp: string;
  queryTime: number;
  provider?: string;
  source?: string;
  [key: string]: any;
}

export interface MCPProviderMetadata {
  provider: string;
  version: string;
  capabilities: string[];
  graphTypes: string[];
  queryLanguages: string[];
  [key: string]: any;
}