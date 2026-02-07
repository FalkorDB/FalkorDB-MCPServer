import express from 'express';
import { config } from './config';
import { mcpRoutes } from './routes/mcp.routes';
import { sseRoutes } from './routes/sse.routes';
import { authenticateMCP } from './middleware/auth.middleware';
import { falkorDBService } from './services/falkordb.service';

// Initialize Express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply authentication to MCP routes
app.use('/api/mcp', authenticateMCP, mcpRoutes);

// SSE routes for MCP protocol (no authentication for SSE transport)
app.use('/api', sseRoutes);

// Basic routes
app.get('/', (req, res) => {
  res.json({
    name: 'FalkorDB MCP Server',
    version: '1.0.0',
    status: 'running',
  });
});

// Start server
const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(`FalkorDB MCP Server listening on port ${PORT}`);
  console.log(`Environment: ${config.server.nodeEnv}`);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  // Close database connections
  await falkorDBService.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  // Close database connections
  await falkorDBService.close();
  process.exit(0);
});

export default app;