import { Router } from 'express';
import { mcpController } from '../controllers/mcp.controller';

const router = Router();

// MCP API routes
router.post('/', mcpController.handleRpcRequest.bind(mcpController));
router.post('/context', mcpController.processContextRequest.bind(mcpController));
router.get('/metadata', mcpController.processMetadataRequest.bind(mcpController));
router.get('/graphs', mcpController.listGraphs.bind(mcpController));

// Additional MCP related routes could be added here
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

export const mcpRoutes = router;