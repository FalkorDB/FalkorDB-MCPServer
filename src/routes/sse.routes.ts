import { Router, Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMCPServer } from '../services/mcp.server';

const router = Router();

// Store active SSE transports by session ID using Map
const transports = new Map<string, SSEServerTransport>();

/**
 * SSE endpoint for MCP connections
 * This establishes the Server-Sent Events connection for the MCP protocol
 */
router.get('/sse', async (req: Request, res: Response) => {
  try {
    // Derive the message endpoint from the request to handle different base paths
    const baseUrl = (req.baseUrl || '').replace(/\/$/, '');
    const messagesEndpoint = `${baseUrl}/messages`;

    // Create a new SSE transport
    const transport = new SSEServerTransport(messagesEndpoint, res);
    const sessionId = transport.sessionId;

    // Store the transport
    transports.set(sessionId, transport);

    // Clean up when the connection closes
    res.on('close', () => {
      transports.delete(sessionId);
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
    const rawSessionId = req.query.sessionId;
    let sessionId: string | undefined;

    // Validate and extract sessionId from query parameter
    if (Array.isArray(rawSessionId)) {
      sessionId = rawSessionId[0] as string;
    } else if (typeof rawSessionId === 'string') {
      sessionId = rawSessionId;
    }

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId query parameter is required' });
    }

    const transport = transports.get(sessionId);

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
