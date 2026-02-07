import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { falkorDBService } from './falkordb.service';

/**
 * Create and configure the MCP server with FalkorDB tools
 */
export function createMCPServer(): McpServer {
  const server = new McpServer({
    name: 'FalkorDB MCP Server',
    version: '1.0.0',
  });

  // Tool: Execute a Cypher query on a graph
  server.tool(
    'executeQuery',
    {
      graphName: z.string().describe('The name of the graph to query'),
      query: z.string().describe('The Cypher query to execute'),
      params: z.record(z.any()).optional().describe('Optional parameters for the query'),
    },
    async ({ graphName, query, params }) => {
      try {
        const result = await falkorDBService.executeQuery(graphName, query, params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing query: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: List all available graphs
  server.tool(
    'listGraphs',
    {},
    async () => {
      try {
        const graphs = await falkorDBService.listGraphs();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ graphs }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error listing graphs: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}
