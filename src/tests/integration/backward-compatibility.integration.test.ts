import request from 'supertest';
import express from 'express';
import { mcpController } from '../../controllers/mcp.controller';
import { authenticateMCP } from '../../middleware/auth.middleware';
import { config } from '../../config';
import { testDbHelper, generateTestGraphName } from '../utils/test-helpers';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/mcp', authenticateMCP);

app.post('/api/mcp/context', mcpController.processContextRequest.bind(mcpController));
app.get('/api/mcp/graphs', mcpController.listGraphs.bind(mcpController));
app.get('/api/mcp/metadata', mcpController.processMetadataRequest.bind(mcpController));

describe('Backward Compatibility Integration Tests', () => {
  beforeAll(async () => {
    await testDbHelper.connect();
  });

  afterEach(async () => {
    await testDbHelper.clearAllTestGraphs();
  });

  describe('Default Configuration (Multi-tenancy disabled)', () => {
    beforeEach(() => {
      // Ensure multi-tenancy is disabled (default state)
      process.env.ENABLE_MULTI_TENANCY = 'false';
      process.env.MULTI_TENANT_AUTH_MODE = 'api-key';
      process.env.TENANT_GRAPH_PREFIX = 'false';
      process.env.MCP_API_KEY = 'test-api-key';
      
      // Reload config
      jest.resetModules();
    });

    test('should maintain exact same API behavior as v1.0.0', async () => {
      const graphName = generateTestGraphName('backward_compat_test');
      
      // Create a test graph with data
      await testDbHelper.createTestGraph(graphName);
      await testDbHelper.executeQuery(
        graphName,
        'CREATE (n:Person {name: "John", age: 30})-[:KNOWS]->(m:Person {name: "Jane", age: 25})'
      );

      // Test context request - should work exactly as before
      const contextResponse = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key')
        .send({
          graphName: graphName,
          query: 'MATCH (n:Person) RETURN n.name, n.age ORDER BY n.age',
          params: {}
        });

      expect(contextResponse.status).toBe(200);
      expect(contextResponse.body).toEqual({
        data: expect.any(Object),
        metadata: {
          timestamp: expect.any(String),
          queryTime: expect.any(Number),
          provider: 'FalkorDB MCP Server',
          source: 'falkordb'
          // Should NOT have tenantId in response
        }
      });
      expect(contextResponse.body.metadata.tenantId).toBeUndefined();

      // Test graph listing - should work exactly as before
      const graphsResponse = await request(app)
        .get('/api/mcp/graphs')
        .set('x-api-key', 'test-api-key');

      expect(graphsResponse.status).toBe(200);
      expect(graphsResponse.body).toEqual({
        data: expect.arrayContaining([
          expect.objectContaining({ name: graphName })
        ]),
        metadata: {
          timestamp: expect.any(String),
          count: expect.any(Number)
          // Should NOT have tenantId in response
        }
      });
      expect(graphsResponse.body.metadata.tenantId).toBeUndefined();

      // Test metadata - should work exactly as before
      const metadataResponse = await request(app)
        .get('/api/mcp/metadata')
        .set('x-api-key', 'test-api-key');

      expect(metadataResponse.status).toBe(200);
      expect(metadataResponse.body).toEqual({
        provider: 'FalkorDB MCP Server',
        version: '1.0.0',
        capabilities: [
          'graph.query',
          'graph.list',
          'node.properties',
          'relationship.properties'
        ],
        graphTypes: ['property', 'directed'],
        queryLanguages: ['cypher']
      });
    });

    test('should handle authentication exactly as before', async () => {
      // Missing API key
      const noKeyResponse = await request(app)
        .post('/api/mcp/context')
        .send({
          graphName: 'test',
          query: 'MATCH (n) RETURN n'
        });

      expect(noKeyResponse.status).toBe(401);
      expect(noKeyResponse.body.error).toBe('Missing API key');

      // Invalid API key
      const invalidKeyResponse = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'invalid-key')
        .send({
          graphName: 'test',
          query: 'MATCH (n) RETURN n'
        });

      expect(invalidKeyResponse.status).toBe(403);
      expect(invalidKeyResponse.body.error).toBe('Invalid API key');

      // API key via query parameter (should still work)
      const queryParamResponse = await request(app)
        .post('/api/mcp/context?apiKey=test-api-key')
        .send({
          graphName: 'test',
          query: 'MATCH (n) RETURN n'
        });

      expect(queryParamResponse.status).toBe(400); // Missing graph, but auth passed
      expect(queryParamResponse.body.error).toBe('Graph name is required');
    });

    test('should handle errors exactly as before', async () => {
      // Invalid query
      const invalidQueryResponse = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key')
        .send({
          graphName: 'nonexistent',
          query: 'INVALID CYPHER SYNTAX'
        });

      expect(invalidQueryResponse.status).toBe(500);
      expect(invalidQueryResponse.body).toEqual({
        error: expect.any(String),
        metadata: {
          timestamp: expect.any(String)
          // Should NOT have tenantId even in errors
        }
      });
      expect(invalidQueryResponse.body.metadata.tenantId).toBeUndefined();
    });

    test('should preserve exact request/response format for all endpoints', async () => {
      const testCases = [
        {
          method: 'post',
          path: '/api/mcp/context',
          body: { graphName: 'test', query: 'MATCH (n) RETURN count(n)' },
          expectedFields: ['data', 'metadata']
        },
        {
          method: 'get', 
          path: '/api/mcp/graphs',
          body: {},
          expectedFields: ['data', 'metadata']
        },
        {
          method: 'get',
          path: '/api/mcp/metadata', 
          body: {},
          expectedFields: ['provider', 'version', 'capabilities', 'graphTypes', 'queryLanguages']
        }
      ];

      for (const testCase of testCases) {
        let requestBuilder;
        if (testCase.method === 'post') {
          requestBuilder = request(app).post(testCase.path);
        } else {
          requestBuilder = request(app).get(testCase.path);
        }
        
        const response = await requestBuilder
          .set('x-api-key', 'test-api-key')
          .send(testCase.body);

        // Verify response structure hasn't changed
        for (const field of testCase.expectedFields) {
          expect(response.body).toHaveProperty(field);
        }

        // Verify no new fields added that could break clients
        if (response.body.metadata) {
          expect(response.body.metadata.tenantId).toBeUndefined();
        }
      }
    });

    test('should handle graph operations identically to v1.0.0', async () => {
      const graphName = 'operations_test';
      
      // Create graph and add data
      await testDbHelper.createTestGraph(graphName);
      
      // Test identical operation sequence
      const operations = [
        'CREATE (n:Test {id: 1, name: "test1"})',
        'CREATE (n:Test {id: 2, name: "test2"})',
        'MATCH (a:Test {id: 1}), (b:Test {id: 2}) CREATE (a)-[:CONNECTED]->(b)',
        'MATCH (n:Test) RETURN n.id, n.name ORDER BY n.id',
        'MATCH (a)-[r:CONNECTED]->(b) RETURN a.name, b.name'
      ];

      for (const [index, query] of operations.entries()) {
        const response = await request(app)
          .post('/api/mcp/context')
          .set('x-api-key', 'test-api-key')
          .send({
            graphName: graphName,
            query: query
          });

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
        expect(response.body.metadata.provider).toBe('FalkorDB MCP Server');
        expect(response.body.metadata.tenantId).toBeUndefined();
      }
    });
  });

  describe('Environment Variable Handling', () => {
    test('should work when multi-tenancy env vars are undefined', async () => {
      // Remove all multi-tenancy env vars
      delete process.env.ENABLE_MULTI_TENANCY;
      delete process.env.MULTI_TENANT_AUTH_MODE;
      delete process.env.TENANT_GRAPH_PREFIX;
      delete process.env.OAUTH2_JWKS_URL;
      delete process.env.OAUTH2_ISSUER;
      
      jest.resetModules();

      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key')
        .send({
          graphName: 'test',
          query: 'MATCH (n) RETURN count(n)'
        });

      expect(response.status).toBe(200);
      expect(response.body.metadata.tenantId).toBeUndefined();
    });

    test('should work when multi-tenancy env vars are empty strings', async () => {
      process.env.ENABLE_MULTI_TENANCY = '';
      process.env.MULTI_TENANT_AUTH_MODE = '';
      process.env.TENANT_GRAPH_PREFIX = '';
      process.env.OAUTH2_JWKS_URL = '';
      process.env.OAUTH2_ISSUER = '';
      
      jest.resetModules();

      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key')
        .send({
          graphName: 'test',
          query: 'MATCH (n) RETURN count(n)'
        });

      expect(response.status).toBe(200);
      expect(response.body.metadata.tenantId).toBeUndefined();
    });

    test('should work when multi-tenancy env vars have invalid values', async () => {
      process.env.ENABLE_MULTI_TENANCY = 'invalid';
      process.env.MULTI_TENANT_AUTH_MODE = 'invalid-mode';
      process.env.TENANT_GRAPH_PREFIX = 'invalid';
      
      jest.resetModules();

      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key')
        .send({
          graphName: 'test',
          query: 'MATCH (n) RETURN count(n)'
        });

      expect(response.status).toBe(200);
      expect(response.body.metadata.tenantId).toBeUndefined();
    });
  });

  describe('Performance Baseline', () => {
    test('should maintain performance characteristics of v1.0.0', async () => {
      const graphName = 'performance_test';
      await testDbHelper.createTestGraph(graphName);
      
      // Warm up
      await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key')
        .send({
          graphName: graphName,
          query: 'MATCH (n) RETURN count(n)'
        });

      // Measure baseline performance
      const iterations = 10;
      const startTime = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        const response = await request(app)
          .post('/api/mcp/context')
          .set('x-api-key', 'test-api-key')
          .send({
            graphName: graphName,
            query: `CREATE (n:Test {iteration: ${i}}) RETURN n`
          });
        
        expect(response.status).toBe(200);
      }
      
      const totalTime = Date.now() - startTime;
      const avgTime = totalTime / iterations;
      
      // Should complete operations in reasonable time (adjust threshold as needed)
      expect(avgTime).toBeLessThan(100); // 100ms per operation
    });
  });
});