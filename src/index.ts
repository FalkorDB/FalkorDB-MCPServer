#!/usr/bin/env node

import { falkorDBService } from './services/falkordb.service.js';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { redisService } from './services/redis.service.js';
import { errorHandler } from './errors/ErrorHandler.js';
import { logger } from './services/logger.service.js';
import registerAllTools from './mcp/tools.js';
import registerAllResources from './mcp/resources.js';
import registerAllPrompts from './mcp/prompts.js';

// Setup global error handlers following Node.js best practices
process.on('uncaughtException', (error: Error) => {
  logger.errorSync('Uncaught exception occurred', error);
  errorHandler.handleError(error);
  errorHandler.crashIfUntrustedError(error);
});

process.on('unhandledRejection', (reason: unknown) => {
  // Re-throw as error to be caught by uncaughtException handler
  const error = reason instanceof Error ? reason : new Error(String(reason));
  throw error;
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  await logger.info(`Received ${signal}, shutting down gracefully`);
  
  try {
    await falkorDBService.close();
    await redisService.close();
    await logger.info('All services closed successfully');
    process.exit(0);
  } catch (error) {
    await logger.error('Error during graceful shutdown', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Create an MCP server
const server = new McpServer({
  name: "falkordb-mcpserver",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {
      listChanged: true,
    },
    resources: {
      listChanged: true,
    },
    prompts: {
      listChanged: true,
    },
    logging: {},
  }
});

// Note: Current MCP TypeScript SDK doesn't directly support elicitation in tool handlers
// This is a conceptual implementation - you'd need to implement session access

// Configure logger to send notifications to MCP clients
logger.setMcpServer(server);

// Register all tools and resources
registerAllTools(server);
registerAllResources(server);
registerAllPrompts(server);

// Initialize services before starting server
async function initializeServices(): Promise<void> {
  await logger.info('Initializing FalkorDB MCP server...');
  
  try {
    await falkorDBService.initialize();
    await redisService.initialize();
    await logger.info('All services initialized successfully');
  } catch (error) {
    await logger.error('Failed to initialize services', error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

// Main server startup
async function startServer(): Promise<void> {
  try {
    await initializeServices();
    
    // Start receiving messages on stdin and sending messages on stdout
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    await logger.info('MCP server started successfully');
  } catch (error) {
    await logger.error('Failed to start MCP server', error instanceof Error ? error : new Error(String(error)));
    await gracefulShutdown('STARTUP_ERROR');
  }
}

// Start the server
startServer();