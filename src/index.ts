#!/usr/bin/env node

import { createRequire } from 'module';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { falkorDBService } from './services/falkordb.service.js';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { redisService } from './services/redis.service.js';
import { errorHandler } from './errors/ErrorHandler.js';
import { logger } from './services/logger.service.js';
import { config } from './config/index.js';
import registerAllTools from './mcp/tools.js';
import registerAllResources from './mcp/resources.js';
import registerAllPrompts from './mcp/prompts.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

/**
 * Monkey-patch console methods to redirect to stderr when using stdio transport
 * This prevents console output from corrupting the MCP JSON-RPC protocol stream
 * which uses stdout for communication
 */
function redirectConsoleToStderr(): void {
  // Redirect all console methods to stderr
  console.log = (...args: unknown[]) => {
    process.stderr.write(`[LOG] ${args.map(String).join(' ')}\n`);
  };

  console.warn = (...args: unknown[]) => {
    process.stderr.write(`[WARN] ${args.map(String).join(' ')}\n`);
  };

  console.info = (...args: unknown[]) => {
    process.stderr.write(`[INFO] ${args.map(String).join(' ')}\n`);
  };

  console.debug = (...args: unknown[]) => {
    process.stderr.write(`[DEBUG] ${args.map(String).join(' ')}\n`);
  };

  // console.error already writes to stderr by default, but let's be explicit for consistency
  console.error = (...args: unknown[]) => {
    process.stderr.write(`[ERROR] ${args.map(String).join(' ')}\n`);
  };
}

// Setup global error handlers following Node.js best practices
process.on('uncaughtException', (error: Error) => {
  logger.errorSync('Uncaught exception occurred', error);
  void errorHandler.handleError(error).catch((handlerError) => {
    logger.errorSync(
      'Error while handling uncaught exception',
      handlerError instanceof Error ? handlerError : new Error(String(handlerError))
    );
  });
  errorHandler.crashIfUntrustedError(error);
});

process.on('unhandledRejection', (reason: unknown) => {
  // Re-throw as error to be caught by uncaughtException handler
  const error = reason instanceof Error ? reason : new Error(String(reason));
  throw error;
});

// Graceful shutdown handler
let httpServer: ReturnType<typeof createServer> | null = null;

const gracefulShutdown = async (signal: string) => {
  await logger.info(`Received ${signal}, shutting down gracefully`);
  
  try {
    if (httpServer) {
      await new Promise<void>((resolve, reject) => {
        httpServer!.close((err) => err ? reject(err) : resolve());
      });
    }
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
  version: version
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
    
    if (config.mcp.transport === 'http') {
      await startHTTPServer();
    } else {
      await startStdioServer();
    }
  } catch (error) {
    await logger.error('Failed to start MCP server', error instanceof Error ? error : new Error(String(error)));
    await gracefulShutdown('STARTUP_ERROR');
  }
}

async function startStdioServer(): Promise<void> {
  // Redirect console to stderr to prevent corruption of the MCP protocol stream
  redirectConsoleToStderr();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  await logger.info('MCP server started successfully (stdio transport)');
}

async function startHTTPServer(): Promise<void> {
  const port = config.server.port;
  const apiKey = config.mcp.apiKey;

  // Map session IDs to their transports for session management
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // API key authentication for HTTP transport
    if (apiKey) {
      const authHeader = req.headers['authorization'];
      if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (req.method === 'POST') {
      // Read the request body
      const body = await readRequestBody(req);
      const parsedBody = JSON.parse(body);

      if (sessionId && sessions.has(sessionId)) {
        // Existing session — route to its transport
        const transport = sessions.get(sessionId)!;
        await transport.handleRequest(req, res, parsedBody);
      } else if (!sessionId && isInitializeRequest(parsedBody)) {
        // New session initialization
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) sessions.delete(sid);
        };

        // Connect a fresh McpServer for this session
        const sessionServer = createSessionServer();
        await sessionServer.connect(transport);
        await transport.handleRequest(req, res, parsedBody);

        // Store session after handling (sessionId is set after init)
        if (transport.sessionId) {
          sessions.set(transport.sessionId, transport);
        }
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Request: No valid session or initialization' }));
      }
    } else if (req.method === 'GET') {
      // SSE stream for server-initiated messages
      if (sessionId && sessions.has(sessionId)) {
        const transport = sessions.get(sessionId)!;
        await transport.handleRequest(req, res);
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Request: Invalid or missing session ID' }));
      }
    } else if (req.method === 'DELETE') {
      // Session termination
      if (sessionId && sessions.has(sessionId)) {
        const transport = sessions.get(sessionId)!;
        await transport.handleRequest(req, res);
        sessions.delete(sessionId);
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Request: Invalid or missing session ID' }));
      }
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    }
  });

  httpServer.listen(port, () => {
    // Fire-and-forget: non-critical startup log
    logger.info(`MCP server started successfully (HTTP transport on port ${port})`);
  });
}

function createSessionServer(): McpServer {
  const sessionServer = new McpServer({
    name: "falkordb-mcpserver",
    version: version,
  }, {
    capabilities: {
      tools: { listChanged: true },
      resources: { listChanged: true },
      prompts: { listChanged: true },
      logging: {},
    },
  });
  logger.setMcpServer(sessionServer);
  registerAllTools(sessionServer);
  registerAllResources(sessionServer);
  registerAllPrompts(sessionServer);
  return sessionServer;
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function isInitializeRequest(body: unknown): boolean {
  if (typeof body === 'object' && body !== null && 'method' in body) {
    return (body as { method: string }).method === 'initialize';
  }
  if (Array.isArray(body)) {
    return body.some(msg => typeof msg === 'object' && msg !== null && 'method' in msg && msg.method === 'initialize');
  }
  return false;
}

// Start the server
startServer().catch(async (error) => {
  await logger.error('Fatal startup error', error instanceof Error ? error : new Error(String(error)));
  process.exit(1);
});