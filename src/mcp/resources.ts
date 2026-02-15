import { falkorDBService } from '../services/falkordb.service.js';
import { logger } from '../services/logger.service.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export default function registerAllResources(server: McpServer): void {
  // Register graph_list resource
  server.registerResource(
   "graph_list",
   "graph://listing",
   {
     title: "List Graphs",
     description: "List all graphs in the database",
     mimeType: "text/plain",
   },
   async (uri) => {
    try {
      const graphNames = await falkorDBService.listGraphs();
      const markdownList = graphNames.map(name => `- ${name}`).join('\n');
      await logger.debug('Graph list resource accessed', { count: graphNames.length });
      return {
        contents: [{
          uri: uri.href,
          text: markdownList,
        }]
      }
    } catch (error) {
      await logger.error('Failed to fetch graph list resource', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
   }
 );
}