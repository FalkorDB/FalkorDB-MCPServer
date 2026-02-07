import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { falkorDBService } from '../services/falkordb.service';

import {
    MCPContextRequest,
    MCPProviderMetadata,
    MCPResponse
} from '../models/mcp.types';

export class MCPController {
  /**
   * Initialize MCP session
   */
  async initialize(req: Request, res: Response): Promise<Response<any, Record<string, any>>> {
    try {
      const { jsonrpc, id, method, params } = req.body;
      
      // Basic validation
      if (jsonrpc !== '2.0') {
         return res.status(400).json({
          jsonrpc: '2.0',
          id: id || null,
          error: {
            code: -32600,
            message: 'Invalid Request: jsonrpc must be 2.0'
          }
         });
      }

      const sessionId = uuidv4();
      
      const response = {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            // Define capabilities similar to what was in metadata, but in MCP structure
            resources: {}, 
            tools: {},
            prompts: {},
            logging: {} 
          },
          serverInfo: {
            name: 'FalkorDB MCP Server',
            version: '1.0.0'
          }
        }
      };

      res.header('Mcp-Session-Id', sessionId);
      return res.status(200).json(response);

    } catch (error: any) {
      console.error('Error initializing MCP session:', error);
      return res.status(500).json({ 
        jsonrpc: '2.0',
        id: req.body.id || null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        } 
      });
    }
  }

  /**
   * Handle generic MCP RPC requests
   */
  async handleRpcRequest(req: Request, res: Response): Promise<Response<any, Record<string, any>>> {
    const { method, id } = req.body;

    if (method === 'initialize') {
      return this.initialize(req, res);
    }

    if (method === 'notifications/initialized') {
        // Client acknowledging initialization
        return res.status(200).json({ jsonrpc: '2.0', result: true });
    }

    if (method === 'ping') {
        return res.status(200).json({ jsonrpc: '2.0', id, result: {} });
    }
    
    // List methods
    if (method === 'tools/list') {
        return res.status(200).json({ 
            jsonrpc: '2.0', 
            id, 
            result: { 
                tools: [
                    {
                        name: "graph_query",
                        description: "Execute a Cypher query against a FalkorDB graph",
                        inputSchema: {
                            type: "object",
                            properties: {
                                graphName: { 
                                    type: "string", 
                                    description: "Name of the graph to query. Use the list_graphs tool to discover available graphs." 
                                },
                                query: { 
                                    type: "string", 
                                    description: "Cypher query to execute. Use the get_graph_schema tool to understand the graph schema before executing a query." 
                                },
                                params: { 
                                    type: "object", 
                                    description: "Optional query parameters",
                                    additionalProperties: true
                                }
                            },
                            required: ["graphName", "query"]
                        }
                    },
                    {
                        name: "list_graphs",
                        description: "List all available graphs in FalkorDB",
                        inputSchema: {
                            type: "object",
                            properties: {},
                            required: []
                        }
                    },
                    {
                        name: "get_graph_schema",
                        description: "Get the schema of a graph including node labels and relationship types to understand the graph schema before executing a query.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                graphName: {
                                    type: "string",
                                    description: "Name of the graph. Use the list_graphs tool to discover available graphs."
                                }
                            },
                            required: ["graphName"]
                        }
                    },
                    {
                        name: "get_node_properties",
                        description: "Get a sample node for a specific label to see its properties",
                        inputSchema: {
                            type: "object",
                            properties: {
                                graphName: {
                                    type: "string",
                                    description: "Name of the graph. Use the list_graphs tool to discover available graphs."
                                },
                                label: {
                                    type: "string",
                                    description: "Node label to inspect"
                                }
                            },
                            required: ["graphName", "label"]
                        }
                    },
                    {
                        name: "get_relationship_properties",
                        description: "Get a sample relationship for a specific type to see its properties",
                        inputSchema: {
                            type: "object",
                            properties: {
                                graphName: {
                                    type: "string",
                                    description: "Name of the graph. Use the list_graphs tool to discover available graphs."
                                },
                                relationshipType: {
                                    type: "string",
                                    description: "Relationship type to inspect"
                                }
                            },
                            required: ["graphName", "relationshipType"]
                        }
                    }
                ] 

            } 
        });
    }

    if (method === 'tools/call') {
        const { name, arguments: args } = req.body.params;

        if (name === 'graph_query') {
            try {
                if (!args.graphName || !args.query) {
                    throw new Error('Missing required arguments: graphName and query are required');
                }

                const result = await falkorDBService.executeQuery(
                    args.graphName,
                    args.query,
                    args.params || {}
                );

                return res.status(200).json({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(result, null, 2)
                            }
                        ]
                    }
                });
            } catch (error: any) {
                 return res.status(200).json({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: `Error executing query: ${error.message}`
                            }
                        ],
                        isError: true
                    }
                });
            }
        }


        if (name === 'list_graphs') {
            try {
                const graphNames = await falkorDBService.listGraphs();
                return res.status(200).json({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(graphNames, null, 2)
                            }
                        ]
                    }
                });
            } catch (error: any) {
                 return res.status(200).json({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: `Error listing graphs: ${error.message}`
                            }
                        ],
                        isError: true
                    }
                });
            }
        }

        if (name === 'get_graph_schema') {
            try {
                if (!args.graphName) {
                    throw new Error('Missing required argument: graphName');
                }

                // Get node labels
                const labelsResult = await falkorDBService.executeQuery(args.graphName, "CALL db.labels()");
                const labels = labelsResult.data.map((r: any) => r['label']);

                // Get relationship types
                const typesResult = await falkorDBService.executeQuery(args.graphName, "CALL db.relationshipTypes()");
                const relationshipTypes = typesResult.data.map((r: any) => r['relationshipType']);

                // Get detailed schema connections
                const schemaQuery = "MATCH (a)-[r]->(b) RETURN DISTINCT labels(a) as source, type(r) as relationship, labels(b) as target";
                const schemaResult = await falkorDBService.executeQuery(args.graphName, schemaQuery);
                
                const schema = {
                    nodeLabels: labels,
                    relationshipTypes: relationshipTypes,
                    connections: schemaResult.data
                };

                return res.status(200).json({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(schema, null, 2)
                            }
                        ]
                    }
                });
            } catch (error: any) {
                 return res.status(200).json({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: `Error getting graph schema: ${error.message}`
                            }
                        ],
                        isError: true
                    }
                });
            }
        }

        if (name === 'get_node_properties') {
            try {
                if (!args.graphName || !args.label) {
                    throw new Error('Missing required arguments: graphName and label');
                }

                const query = `MATCH (n:${args.label}) RETURN n LIMIT 1`;
                const result = await falkorDBService.executeQuery(args.graphName, query);

                return res.status(200).json({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(result, null, 2)
                            }
                        ]
                    }
                });
            } catch (error: any) {
                 return res.status(200).json({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: `Error getting node properties: ${error.message}`
                            }
                        ],
                        isError: true
                    }
                });
            }
        }

        if (name === 'get_relationship_properties') {
            try {
                if (!args.graphName || !args.relationshipType) {
                    throw new Error('Missing required arguments: graphName and relationshipType');
                }

                const query = `MATCH ()-[r:${args.relationshipType}]->() RETURN r LIMIT 1`;
                const result = await falkorDBService.executeQuery(args.graphName, query);

                return res.status(200).json({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(result, null, 2)
                            }
                        ]
                    }
                });
            } catch (error: any) {
                 return res.status(200).json({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: `Error getting relationship properties: ${error.message}`
                            }
                        ],
                        isError: true
                    }
                });
            }
        }

        return res.status(200).json({
            jsonrpc: '2.0',
            id,
            error: {
                code: -32601,
                message: `Tool not found: ${name}`
            }
        });
    }

    if (method === 'resources/list') {
        return res.status(200).json({ 
            jsonrpc: '2.0', 
            id, 
            result: { 
                resources: [] 
            } 
        });
    }

    if (method === 'prompts/list') {
        return res.status(200).json({ 
            jsonrpc: '2.0', 
            id, 
            result: { 
                prompts: [] 
            } 
        });
    }

    // Fallback or error for unknown methods at this endpoint
    // Return 200 OK with JSON-RPC error as per spec
    return res.status(200).json({
      jsonrpc: '2.0',
      id: id || null,
      error: {
        code: -32601,
        message: 'Method not found'
      }
    });
  }

  /**
   * Process MCP context requests
   */
  async processContextRequest(req: Request, res: Response): Promise<Response<any, Record<string, any>>> {
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
      
      // Execute the query on FalkorDB
      const result = await falkorDBService.executeQuery(
        contextRequest.graphName,
        contextRequest.query, 
        contextRequest.params
      );
      
      const queryTime = Date.now() - startTime;
      
      // Format the result according to MCP standards
      const formattedResult: MCPResponse = {
        data: result,
        metadata: {
          timestamp: new Date().toISOString(),
          queryTime,
          provider: 'FalkorDB MCP Server',
          source: 'falkordb'
        }
      };
      
      return res.status(200).json(formattedResult);
    } catch (error: any) {
      console.error('Error processing MCP context request:', error);
      return res.status(500).json({ 
        error: error.message,
        metadata: {
          timestamp: new Date().toISOString()
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
  async listGraphs(req: Request, res: Response): Promise<Response<any, Record<string, any>>>  {
    try {
      const graphNames = await falkorDBService.listGraphs();
      
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
          count: graphs.length
        }
      });
    } catch (error: any) {
      console.error('Error listing graphs:', error);
      return res.status(500).json({ error: error.message });
    }
  }
}

export const mcpController = new MCPController();