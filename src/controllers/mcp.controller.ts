import { Request, Response } from 'express';
import { falkorDBService } from '../services/falkordb.service';

import { 
  MCPContextRequest, 
  MCPResponse, 
  MCPProviderMetadata,
  TenantRequest
} from '../models/mcp.types';

export class MCPController {
  /**
   * Process MCP context requests
   */
  async processContextRequest(req: TenantRequest, res: Response): Promise<Response<any, Record<string, any>>> {
    try {
      const contextRequest: MCPContextRequest = req.body;
      
      if (!contextRequest.query) {
        return res.status(400).json({ error: 'Query is required' });
      }
      
      // Graph name is always required from the client
      if (!contextRequest.graphName) {
        return res.status(400).json({ error: 'Graph name is required' });
      }
      
      const startTime = Date.now();
      
      // Execute the query on FalkorDB with tenant context
      const result = await falkorDBService.executeQuery(
        contextRequest.graphName,
        contextRequest.query, 
        contextRequest.params,
        req.tenantId
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
      return res.status(500).json({ 
        error: error.message,
        metadata: {
          timestamp: new Date().toISOString(),
          tenantId: req.tenantId
        }
      });
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
      return res.status(500).json({ error: error.message });
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
      return res.status(500).json({ error: error.message });
    }
  }
}

export const mcpController = new MCPController();