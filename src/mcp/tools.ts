import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { falkorDBService } from '../services/falkordb.service.js';
import { redisService } from '../services/redis.service.js';
import { logger } from '../services/logger.service.js';
import { AppError, CommonErrors } from '../errors/AppError.js';
import { config } from '../config/index.js';

// Extract Zod schemas to break type recursion cycle
// Using type assertion to prevent TypeScript from deeply inferring Zod schema types
// This is necessary because the MCP SDK's registerTool causes TS2589 during coverage collection
//
// Pattern used:
// 1. Define raw schema object
// 2. Create Zod object from raw schema (for type inference)
// 3. Infer TS type from Zod object
// 4. Pass raw schema cast as 'any' to registerTool (breaks recursion)
// 5. Explicitly cast 'args' to inferred type in handler
const queryGraphSchema = {
  graphName: z.string().describe("The name of the graph to query"),
  query: z.string().describe("The OpenCypher query to run"),
  readOnly: z.boolean().optional().describe("If true, executes as a read-only query (GRAPH.RO_QUERY). Useful for replica instances or to prevent accidental writes. Defaults to FALKORDB_DEFAULT_READONLY environment variable."),
};

const QueryGraphSchemaObj = z.object(queryGraphSchema);
type QueryGraphArgs = z.infer<typeof QueryGraphSchemaObj>;

const queryGraphReadOnlySchema = {
  graphName: z.string().describe("The name of the graph to query"),
  query: z.string().describe("The read-only OpenCypher query to run (write operations will fail)"),
};

const QueryGraphReadOnlySchemaObj = z.object(queryGraphReadOnlySchema);
type QueryGraphReadOnlyArgs = z.infer<typeof QueryGraphReadOnlySchemaObj>;

const deleteGraphSchema = {
  graphName: z.string().describe("The name of the graph to delete"),
  confirmDelete: z.literal(true).describe("Must be set to true to confirm deletion. This is a safety measure to prevent accidental data loss."),
};

const DeleteGraphSchemaObj = z.object(deleteGraphSchema);
type DeleteGraphArgs = z.infer<typeof DeleteGraphSchemaObj>;

const setKeySchema = {
  key: z.string().describe("The key to set"),
  value: z.string().describe("The value to set"),
};

const SetKeySchemaObj = z.object(setKeySchema);
type SetKeyArgs = z.infer<typeof SetKeySchemaObj>;

const getKeySchema = {
  key: z.string().describe("The key to get."),
};

const GetKeySchemaObj = z.object(getKeySchema);
type GetKeyArgs = z.infer<typeof GetKeySchemaObj>;

const deleteKeySchema = {
  key: z.string().describe("The key to delete"),
  confirmDelete: z.literal(true).describe("Must be set to true to confirm deletion. This is a safety measure to prevent accidental data loss."),
};

const DeleteKeySchemaObj = z.object(deleteKeySchema);
type DeleteKeyArgs = z.infer<typeof DeleteKeySchemaObj>;

// Suppress unused variable warnings for schema objects
// These objects are used to infer types but are not used at runtime
// This pattern is necessary to avoid TS2589 deep recursion errors
void QueryGraphSchemaObj;
void QueryGraphReadOnlySchemaObj;
void DeleteGraphSchemaObj;
void SetKeySchemaObj;
void GetKeySchemaObj;
void DeleteKeySchemaObj;

function registerQueryGraphTool(server: McpServer): void {
  server.registerTool(
    "query_graph",
    {
      title: "Query Graph",
      description: "Run an OpenCypher query on a graph. Supports both read-write and read-only queries.",
      inputSchema: queryGraphSchema as any,
    },
    async (args: any) => {
      const {graphName, query, readOnly} = args as QueryGraphArgs;
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
    async (args: any) => {
      const {graphName, query} = args as QueryGraphReadOnlyArgs;
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
    async (args: any) => {
      const {graphName} = args as DeleteGraphArgs;
      try {
        if (!graphName?.trim()) {
          throw new AppError(
            CommonErrors.INVALID_INPUT,
            'Graph name is required and cannot be empty',
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

function registerListKeysTool(server: McpServer): void {
  server.registerTool(
    "list_keys",
    {
      title: "List Keys",
      description: "List all keys in Redis",
      inputSchema: {},
    },
    async () => {
      try {
        const keys = await redisService.listKeys();
        await logger.debug('List keys tool executed', { count: keys.length });
        
        return {
          content: [{
            type: "text" as const,
            text: keys.join("\n"),
          }]
        };
      } catch (error) {
        await logger.error('List keys tool execution failed', error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    }
  );
}

function registerSetKeyTool(server: McpServer): void {
  // Register set_key tool
  server.registerTool(
    "set_key",
    {
      title: "Set Key",
      description: "Set a key in Redis",
      inputSchema: setKeySchema as any,
    },
    async (args: any) => {
      const {key, value} = args as SetKeyArgs;
      try {
        if (!key?.trim()) {
          throw new AppError(
            CommonErrors.INVALID_INPUT,
            'Key is required and cannot be empty',
            true
          );
        }
        
        if (value === undefined || value === null) {
          throw new AppError(
            CommonErrors.INVALID_INPUT,
            'Value is required',
            true
          );
        }
        
        await redisService.set(key, value);
        await logger.debug('Set key tool executed successfully', { key });

        return {
          content: [{
            type: "text" as const,
            text: `Key ${key} set successfully`
          }]
        };
      } catch (error) {
        await logger.error('Set key tool execution failed', error instanceof Error ? error : new Error(String(error)), { key });
        throw error;
      }
    }
  );
}

function registerGetKeyTool(server: McpServer): void {
  // Register get_key tool
  server.registerTool(
    "get_key",
    {
      title: "Get Key",
      description: "Get a key from Redis",
      inputSchema: getKeySchema as any,
    },
    async (args: any) => {
      const {key} = args as GetKeyArgs;
      try {
        if (!key?.trim()) {
          throw new AppError(
            CommonErrors.INVALID_INPUT,
            'Key is required and cannot be empty',
            true
          );
        }
        
        const value = await redisService.get(key);
        await logger.debug('Get key tool executed successfully', { key, hasValue: value !== null });
        
        return {
          content: [{
            type: "text" as const,
            text: `Key ${key} is ${value ?? 'null (not found)'}`
          }]
        };
      } catch (error) {
        await logger.error('Get key tool execution failed', error instanceof Error ? error : new Error(String(error)), { key });
        throw error;
      }
    }
  );
}

function registerDeleteKeyTool(server: McpServer): void {
  server.registerTool(
    "delete_key",
    {
      title: "Delete Key",
      description: "Permanently delete a key from Redis. WARNING: This action is irreversible. You must set confirmDelete to true to proceed.",
      inputSchema: deleteKeySchema as any,
    },
    async (args: any) => {
      const {key} = args as DeleteKeyArgs;
      try {
        if (!key?.trim()) {
          throw new AppError(
            CommonErrors.INVALID_INPUT,
            'Key is required and cannot be empty',
            true
          );
        }

        await redisService.delete(key);
        await logger.debug('Delete key tool executed successfully', { key });

        return {
          content: [{
            type: "text" as const,
            text: `Key ${key} deleted`
          }]
        };
      } catch (error) {
        await logger.error('Delete key tool execution failed', error instanceof Error ? error : new Error(String(error)), { key });
        throw error;
      }
    }
  )
}

export default function registerAllTools(server: McpServer): void {
  // Register query_graph tools
  registerQueryGraphTool(server);
  registerQueryGraphReadOnlyTool(server);
  registerListGraphsTool(server);
  registerDeleteGraphTool(server);
  registerSetKeyTool(server);
  registerGetKeyTool(server);
  registerDeleteKeyTool(server);
  registerListKeysTool(server);
}