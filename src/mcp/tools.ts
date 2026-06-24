import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { falkorDBService } from '../services/falkordb.service.js';
import { logger } from '../services/logger.service.js';
import { AppError, CommonErrors } from '../errors/AppError.js';
import { config } from '../config/index.js';

// Define schemas as simple objects first to avoid TS2589 deep recursion
const queryGraphSchema = {
  graphName: z.string().describe("The name of the graph to query"),
  query: z.string().describe("The OpenCypher query to run"),
  readOnly: z.boolean().optional().describe("If true, executes as a read-only query (GRAPH.RO_QUERY). Useful for replica instances or to prevent accidental writes. Defaults to FALKORDB_DEFAULT_READONLY environment variable."),
};

const queryGraphReadOnlySchema = {
  graphName: z.string().describe("The name of the graph to query"),
  query: z.string().describe("The read-only OpenCypher query to run (write operations will fail)"),
};

const deleteGraphSchema = {
  graphName: z.string().describe("The name of the graph to delete"),
  confirmDelete: z.literal(true).describe("Must be set to true to confirm deletion. This is a safety measure to prevent accidental data loss."),
};

const getGraphSchemaSchema = {
  graphName: z.string().describe("Name of the graph. Use the list_graphs tool to discover available graphs."),
};

const getNodeSchemaSchema = {
  graphName: z.string().describe("Name of the graph. Use the list_graphs tool to discover available graphs."),
  label: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).describe("Node label to inspect"),
  sampleSize: z.number().int().min(1).max(10000).optional().describe("Number of nodes to sample (default: 100). Larger values improve property coverage at the cost of query time."),
};

const getRelationshipSchemaSchema = {
  graphName: z.string().describe("Name of the graph. Use the list_graphs tool to discover available graphs."),
  relationshipType: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).describe("Relationship type to inspect"),
  sampleSize: z.number().int().min(1).max(10000).optional().describe("Number of relationships to sample (default: 100). Larger values improve property coverage at the cost of query time."),
};

function registerQueryGraphTool(server: McpServer): void {
  server.registerTool(
    "query_graph",
    {
      title: "Query Graph",
      description: "Run an OpenCypher query on a graph. Supports both read-write and read-only queries.",
      inputSchema: queryGraphSchema as any, // Cast to any to prevent TS2589 (deep recursion) during type inference
    },
    async (args: unknown) => {
      // Manual validation since we're using raw shape for registration
      const {graphName, query, readOnly} = z.object(queryGraphSchema).parse(args);
      
      try {
        if (!graphName?.trim()) {
          throw new AppError(
            CommonErrors.INVALID_INPUT,
            'Graph name is required and cannot be empty',
            true
          );
        }

        if (!query?.trim()) {
          throw new AppError(
            CommonErrors.INVALID_INPUT,
            'Query is required and cannot be empty',
            true
          );
        }

        // Use the provided readOnly flag, or fall back to the default from config
        const isReadOnly = readOnly !== undefined ? readOnly : config.falkorDB.defaultReadOnly;

        // Enforce strict read-only mode if enabled
        if (config.falkorDB.strictReadOnly && !isReadOnly) {
          throw new AppError(
            CommonErrors.INVALID_INPUT,
            'Cannot execute write queries: server is in strict read-only mode (FALKORDB_STRICT_READONLY=true)',
            true
          );
        }

        const result = await falkorDBService.executeQuery(graphName, query, undefined, isReadOnly);
        await logger.debug('Query tool executed successfully', { graphName, readOnly: isReadOnly });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error) {
        await logger.error('Query tool execution failed', error instanceof Error ? error : new Error(String(error)), { graphName, query: query.substring(0, 100) + (query.length > 100 ? '...' : '') });
        throw error;
      }
    }
  )
}

function registerQueryGraphReadOnlyTool(server: McpServer): void {
  server.registerTool(
    "query_graph_readonly",
    {
      title: "Query Graph (Read-Only)",
      description: "Run a read-only OpenCypher query on a graph using GRAPH.RO_QUERY. This ensures no write operations are performed and is ideal for replica instances.",
      inputSchema: queryGraphReadOnlySchema as any,
    },
    async (args: unknown) => {
      const {graphName, query} = z.object(queryGraphReadOnlySchema).parse(args);
      try {
        if (!graphName?.trim()) {
          throw new AppError(
            CommonErrors.INVALID_INPUT,
            'Graph name is required and cannot be empty',
            true
          );
        }
        
        if (!query?.trim()) {
          throw new AppError(
            CommonErrors.INVALID_INPUT,
            'Query is required and cannot be empty',
            true
          );
        }
        
        const result = await falkorDBService.executeReadOnlyQuery(graphName, query);
        await logger.debug('Read-only query tool executed successfully', { graphName });
        
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error) {
        await logger.error('Read-only query tool execution failed', error instanceof Error ? error : new Error(String(error)), { graphName, query: query.substring(0, 100) + (query.length > 100 ? '...' : '') });
        throw error;
      }
    }
  )
}

function registerListGraphsTool(server: McpServer): void {
  // Register list_graphs tool
  server.registerTool(
    "list_graphs",
    {
      title: "List Graphs",
      description: "List all graphs available to query",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await falkorDBService.listGraphs();
        await logger.debug('List graphs tool executed', { count: result.length });
        
        return {
          content: [{
            type: "text" as const,
            text: result.join("\n"),
          }]
        };
      } catch (error) {
        await logger.error('List graphs tool execution failed', error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    }
  );
}

function registerDeleteGraphTool(server: McpServer): void {
  // Register delete_graph tool
  server.registerTool(
    "delete_graph",
    {
      title: "Delete Graph",
      description: "Permanently delete a graph from the database. WARNING: This action is irreversible. You must set confirmDelete to true to proceed.",
      inputSchema: deleteGraphSchema as any,
    },
    async (args: unknown) => {
      const {graphName} = z.object(deleteGraphSchema).parse(args);
      try {
        if (!graphName?.trim()) {
          throw new AppError(
            CommonErrors.INVALID_INPUT,
            'Graph name is required and cannot be empty',
            true
          );
        }

        // Enforce strict read-only mode if enabled
        if (config.falkorDB.strictReadOnly) {
          throw new AppError(
            CommonErrors.INVALID_INPUT,
            'Cannot delete graphs: server is in strict read-only mode (FALKORDB_STRICT_READONLY=true)',
            true
          );
        }

        await falkorDBService.deleteGraph(graphName);
        await logger.info('Delete graph tool executed successfully', { graphName });
        
        return {
          content: [{
            type: "text" as const,
            text: `Graph ${graphName} deleted`
          }]
        };
      } catch (error) {
        await logger.error('Delete graph tool execution failed', error instanceof Error ? error : new Error(String(error)), { graphName });
        throw error;
      }
    }
  );
}


function registerGetGraphSchemaTool(server: McpServer): void {
  server.registerTool(
    "get_graph_schema",
    {
      title: "Get Graph Schema",
      description: "Get the schema of a graph including node labels and relationship types to understand the graph structure before executing a query.",
      inputSchema: getGraphSchemaSchema as any,
    },
    async (args: unknown) => {
      const { graphName } = z.object(getGraphSchemaSchema).parse(args);
      try {
        if (!graphName?.trim()) {
          throw new AppError(CommonErrors.INVALID_INPUT, 'Graph name is required and cannot be empty', true);
        }

        const labelsResult = await falkorDBService.executeQuery(graphName, "CALL db.labels()") as any;
        const labels = labelsResult.data.map((r: any) => r['label']);

        const typesResult = await falkorDBService.executeQuery(graphName, "CALL db.relationshipTypes()") as any;
        const relationshipTypes = typesResult.data.map((r: any) => r['relationshipType']);

        const schemaResult = await falkorDBService.executeQuery(
          graphName,
          "MATCH (a)-[r]->(b) RETURN DISTINCT labels(a) as source, type(r) as relationship, labels(b) as target"
        ) as any;

        const schema = {
          nodeLabels: labels,
          relationshipTypes,
          connections: schemaResult.data,
        };

        await logger.debug('Get graph schema tool executed successfully', { graphName });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(schema, null, 2)
          }]
        };
      } catch (error) {
        await logger.error('Get graph schema tool execution failed', error instanceof Error ? error : new Error(String(error)), { graphName });
        throw error;
      }
    }
  );
}

function registerGetNodeSchemaTool(server: McpServer): void {
  server.registerTool(
    "get_node_schema",
    {
      title: "Get Node Schema",
      description: "Sample up to N nodes of a given label and aggregate their property keys by how many nodes carry each one (descending). Use this before adding a new property to verify a similar one does not already exist — especially valuable in schemaless graphs where property naming can drift across subsets of nodes.",
      inputSchema: getNodeSchemaSchema as any,
    },
    async (args: unknown) => {
      const { graphName, label, sampleSize = 100 } = z.object(getNodeSchemaSchema).parse(args);
      try {
        if (!graphName?.trim()) {
          throw new AppError(CommonErrors.INVALID_INPUT, 'Graph name is required and cannot be empty', true);
        }

        const result = await falkorDBService.executeQuery(
          graphName,
          `MATCH (n:${label}) WITH n LIMIT ${sampleSize} UNWIND keys(n) AS property RETURN property, count(*) AS frequency ORDER BY frequency DESC`
        ) as any;

        const response = {
          label,
          sampleSize,
          properties: result.data,
        };

        await logger.debug('Get node schema tool executed successfully', { graphName, label, sampleSize });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(response, null, 2)
          }]
        };
      } catch (error) {
        await logger.error('Get node schema tool execution failed', error instanceof Error ? error : new Error(String(error)), { graphName, label });
        throw error;
      }
    }
  );
}

function registerGetRelationshipSchemaTool(server: McpServer): void {
  server.registerTool(
    "get_relationship_schema",
    {
      title: "Get Relationship Schema",
      description: "Sample up to N relationships of a given type and aggregate their property keys by how many relationships carry each one (descending). Use this before adding a new property to verify a similar one does not already exist — especially valuable in schemaless graphs where property naming can drift across subsets of relationships.",
      inputSchema: getRelationshipSchemaSchema as any,
    },
    async (args: unknown) => {
      const { graphName, relationshipType, sampleSize = 100 } = z.object(getRelationshipSchemaSchema).parse(args);
      try {
        if (!graphName?.trim()) {
          throw new AppError(CommonErrors.INVALID_INPUT, 'Graph name is required and cannot be empty', true);
        }

        const result = await falkorDBService.executeQuery(
          graphName,
          `MATCH ()-[r:${relationshipType}]->() WITH r LIMIT ${sampleSize} UNWIND keys(r) AS property RETURN property, count(*) AS frequency ORDER BY frequency DESC`
        ) as any;

        const response = {
          relationshipType,
          sampleSize,
          properties: result.data,
        };

        await logger.debug('Get relationship schema tool executed successfully', { graphName, relationshipType, sampleSize });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(response, null, 2)
          }]
        };
      } catch (error) {
        await logger.error('Get relationship schema tool execution failed', error instanceof Error ? error : new Error(String(error)), { graphName, relationshipType });
        throw error;
      }
    }
  );
}

export default function registerAllTools(server: McpServer): void {
  // Register query_graph tools
  registerQueryGraphTool(server);
  registerQueryGraphReadOnlyTool(server);
  registerListGraphsTool(server);
  registerDeleteGraphTool(server);
  registerGetGraphSchemaTool(server);
  registerGetNodeSchemaTool(server);
  registerGetRelationshipSchemaTool(server);
}