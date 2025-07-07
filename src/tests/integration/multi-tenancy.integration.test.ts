import request from 'supertest';
import express from 'express';
import { mcpController } from '../../controllers/mcp.controller';
import { authenticateMCP } from '../../middleware/auth.middleware';
import { config } from '../../config';
import { falkorDBService } from '../../services/falkordb.service';

// Mock dependencies
jest.mock('../../config');
jest.mock('../../services/falkordb.service');
jest.mock('../../middleware/bearer.middleware', () => ({
  bearerMiddleware: {
    validateJWT: jest.fn()
  }
}));

const mockConfig = config as jest.Mocked<typeof config>;
const mockFalkorDBService = falkorDBService as jest.Mocked<typeof falkorDBService>;

describe('Multi-Tenancy Integration Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup Express app
    app = express();
    app.use(express.json());
    app.use('/api/mcp', authenticateMCP);
    
    // Setup routes
    app.post('/api/mcp/context', mcpController.processContextRequest.bind(mcpController));
    app.get('/api/mcp/graphs', mcpController.listGraphs.bind(mcpController));
    
    // Default config - multi-tenancy disabled
    mockConfig.multiTenancy = {
      enabled: false,
      authMode: 'api-key',
      bearer: {
        jwksUri: '',
        issuer: '',
        algorithm: 'RS256',
        audience: ''
      },
      tenantGraphPrefix: false
    };
    mockConfig.mcp = {
      apiKey: 'test-api-key'
    };
    mockConfig.server = {
      nodeEnv: 'test',
      port: 3000
    };
  });

  describe('Multi-tenancy disabled (backward compatibility)', () => {
    test('should process context requests without tenant awareness', async () => {
      // Arrange
      const mockResult = { records: [{ id: 1, name: 'test' }] };
      mockFalkorDBService.executeQuery.mockResolvedValue(mockResult);

      // Act
      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key')
        .send({
          graphName: 'testGraph',
          query: 'MATCH (n) RETURN n'
        });

      // Assert
      expect(response.status).toBe(200);
      expect(mockFalkorDBService.executeQuery).toHaveBeenCalledWith(
        'testGraph',
        'MATCH (n) RETURN n',
        undefined,
        undefined
      );
      expect(response.body.metadata.tenantId).toBeUndefined();
    });

    test('should list graphs without tenant filtering', async () => {
      // Arrange
      const mockGraphs = ['graph1', 'tenant1_graph2', 'tenant2_graph3'];
      mockFalkorDBService.listGraphs.mockResolvedValue(mockGraphs);

      // Act
      const response = await request(app)
        .get('/api/mcp/graphs')
        .set('x-api-key', 'test-api-key');

      // Assert
      expect(response.status).toBe(200);
      expect(mockFalkorDBService.listGraphs).toHaveBeenCalledWith(undefined);
      expect(response.body.data.map((g: any) => g.name)).toEqual(mockGraphs);
      expect(response.body.metadata.tenantId).toBeUndefined();
    });
  });

  describe('Multi-tenancy enabled with API key mode', () => {
    beforeEach(() => {
      mockConfig.multiTenancy.enabled = true;
      mockConfig.multiTenancy.authMode = 'api-key';
      mockConfig.multiTenancy.tenantGraphPrefix = true;
    });

    test('should still work with API key authentication', async () => {
      // Arrange
      const mockResult = { records: [{ id: 1, name: 'test' }] };
      mockFalkorDBService.executeQuery.mockResolvedValue(mockResult);

      // Act
      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key')
        .send({
          graphName: 'testGraph',
          query: 'MATCH (n) RETURN n'
        });

      // Assert
      expect(response.status).toBe(200);
      expect(mockFalkorDBService.executeQuery).toHaveBeenCalledWith(
        'testGraph',
        'MATCH (n) RETURN n',
        undefined,
        undefined
      );
    });
  });

  describe('Multi-tenancy enabled with Bearer mode', () => {
    beforeEach(() => {
      mockConfig.multiTenancy.enabled = true;
      mockConfig.multiTenancy.authMode = 'bearer';
      mockConfig.multiTenancy.tenantGraphPrefix = true;
      mockConfig.multiTenancy.bearer.jwksUri = 'https://example.com/.well-known/jwks.json';
      mockConfig.multiTenancy.bearer.issuer = 'https://example.com';
    });

    test('should handle Bearer authentication with tenant context', async () => {
      // Arrange
      const { bearerMiddleware } = require('../../middleware/bearer.middleware');
      bearerMiddleware.validateJWT.mockImplementation((req: any, res: any, next: any) => {
        req.tenantId = 'tenant1';
        next();
      });

      const mockResult = { records: [{ id: 1, name: 'test' }] };
      mockFalkorDBService.executeQuery.mockResolvedValue(mockResult);

      // Act
      const response = await request(app)
        .post('/api/mcp/context')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({
          graphName: 'testGraph',
          query: 'MATCH (n) RETURN n'
        });

      // Assert
      expect(response.status).toBe(200);
      expect(bearerMiddleware.validateJWT).toHaveBeenCalled();
      expect(mockFalkorDBService.executeQuery).toHaveBeenCalledWith(
        'testGraph',
        'MATCH (n) RETURN n',
        undefined,
        'tenant1'
      );
      expect(response.body.metadata.tenantId).toBe('tenant1');
    });

    test('should handle Bearer authentication failure', async () => {
      // Arrange
      const { bearerMiddleware } = require('../../middleware/bearer.middleware');
      bearerMiddleware.validateJWT.mockImplementation((req: any, res: any, next: any) => {
        return res.status(401).json({ error: 'Invalid bearer token' });
      });

      // Act
      const response = await request(app)
        .post('/api/mcp/context')
        .set('Authorization', 'Bearer invalid-jwt-token')
        .send({
          graphName: 'testGraph',
          query: 'MATCH (n) RETURN n'
        });

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid bearer token');
    });

    test('should filter graphs by tenant', async () => {
      // Arrange
      const { bearerMiddleware } = require('../../middleware/bearer.middleware');
      bearerMiddleware.validateJWT.mockImplementation((req: any, res: any, next: any) => {
        req.tenantId = 'tenant1';
        next();
      });

      const mockGraphs = ['graph1', 'graph2'];
      mockFalkorDBService.listGraphs.mockResolvedValue(mockGraphs);

      // Act
      const response = await request(app)
        .get('/api/mcp/graphs')
        .set('Authorization', 'Bearer valid-jwt-token');

      // Assert
      expect(response.status).toBe(200);
      expect(mockFalkorDBService.listGraphs).toHaveBeenCalledWith('tenant1');
      expect(response.body.metadata.tenantId).toBe('tenant1');
    });
  });

  describe('Configuration validation', () => {
    test('should work when multi-tenancy enabled but tenant prefix disabled', async () => {
      // Arrange
      mockConfig.multiTenancy.enabled = true;
      mockConfig.multiTenancy.authMode = 'api-key';
      mockConfig.multiTenancy.tenantGraphPrefix = false;

      const mockResult = { records: [{ id: 1, name: 'test' }] };
      mockFalkorDBService.executeQuery.mockResolvedValue(mockResult);

      // Act
      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key')
        .send({
          graphName: 'testGraph',
          query: 'MATCH (n) RETURN n'
        });

      // Assert
      expect(response.status).toBe(200);
      expect(mockFalkorDBService.executeQuery).toHaveBeenCalledWith(
        'testGraph',
        'MATCH (n) RETURN n',
        undefined,
        undefined
      );
    });
  });
});