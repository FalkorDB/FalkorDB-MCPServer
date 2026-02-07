import { Router, Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMCPServer } from '../services/mcp.server';

const router = Router();

// Store active SSE transports by session ID
const transports: { [sessionId: string]: SSEServerTransport } = {};

/**
 * SSE endpoint for MCP connections
 * This establishes the Server-Sent Events connection for the MCP protocol
 */
router.get('/sse', async (req: Request, res: Response) => {
  try {
    // Create a new SSE transport
    const transport = new SSEServerTransport('/api/messages', res);
    const sessionId = transport.sessionId;

    // Store the transport
    transports[sessionId] = transport;

    // Clean up when the connection closes
    res.on('close', () => {
      delete transports[sessionId];
      console.log(`SSE connection closed for session: ${sessionId}`);
    });

    // Create a new MCP server instance for this connection
    const server = createMCPServer();

    // Connect the server to the transport
    await server.connect(transport);

    console.log(`SSE connection established for session: ${sessionId}`);
  } catch (error) {
    console.error('Error establishing SSE connection:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to establish SSE connection' });
    }
  }
});

/**
 * POST endpoint for MCP messages
 * This receives messages from the MCP client
 */
router.post('/messages', async (req: Request, res: Response) => {
  try {
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId query parameter is required' });
    }

    const transport = transports[sessionId];

    if (!transport) {
      return res.status(404).json({ error: 'No active session found for the provided sessionId' });
    }

    // Handle the POST message
    await transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP message:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to handle message' });
    }
  }
});

export const sseRoutes = router;
