import request from 'supertest';
import express from 'express';
import { testDbHelper, generateTestGraphName, testConfig } from '../utils/test-helpers';
import { testFalkorDBService } from '../utils/mock-falkordb-service';
import { mcpRoutes } from '../../routes/mcp.routes';
import './setup';

// Mock the falkorDBService to use test database
jest.mock('../../services/falkordb.service', () => ({
  falkorDBService: testFalkorDBService
}));

describe('API Integration Tests', () => {
  let app: express.Application;
  let testGraphName: string;

  beforeAll(async () => {
    // Create test Express app with same configuration as main app
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    
    // Use test authentication middleware that accepts test API key
    app.use('/api/mcp', (req, res, next) => {
      const apiKey = req.headers['x-api-key'] || req.query.apiKey;
      if (apiKey !== testConfig.apiKey) {
        return res.status(403).json({ error: 'Invalid API key' });
      }
      next();
    }, mcpRoutes);

    // Basic health endpoint
    app.get('/', (req, res) => {
      res.json({ name: 'FalkorDB MCP Server Test', status: 'running' });
    });
  });

  beforeEach(async () => {
    testGraphName = generateTestGraphName('api_integration');
  });

  afterEach(async () => {
    if (testGraphName) {
      await testDbHelper.deleteTestGraph(testGraphName);
    }
  });

  describe('Authentication', () => {
    test('should reject requests without API key', async () => {
      const response = await request(app)
        .get('/api/mcp/metadata');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Invalid API key');
    });

    test('should reject requests with invalid API key', async () => {
      const response = await request(app)
        .get('/api/mcp/metadata')
        .set('x-api-key', 'invalid-key');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Invalid API key');
    });

    test('should accept requests with valid API key', async () => {
      const response = await request(app)
        .get('/api/mcp/metadata')
        .set('x-api-key', testConfig.apiKey);

      expect(response.status).toBe(200);
    });

    test('should accept API key via query parameter', async () => {
      const response = await request(app)
        .get(`/api/mcp/metadata?apiKey=${testConfig.apiKey}`);

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/mcp/metadata', () => {
    test('should return server metadata', async () => {
      const response = await request(app)
        .get('/api/mcp/metadata')
        .set('x-api-key', testConfig.apiKey);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        provider: 'FalkorDB MCP Server',
        version: '1.0.0',
        capabilities: expect.arrayContaining([
          'graph.query',
          'graph.list',
          'node.properties',
          'relationship.properties'
        ]),
        graphTypes: expect.arrayContaining(['property', 'directed']),
        queryLanguages: expect.arrayContaining(['cypher'])
      });
    });
  });

  describe('GET /api/mcp/graphs', () => {
    test('should list graphs when none exist', async () => {
      const response = await request(app)
        .get('/api/mcp/graphs')
        .set('x-api-key', testConfig.apiKey);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('metadata');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.metadata).toHaveProperty('count');
      expect(response.body.metadata).toHaveProperty('timestamp');
    });

    test('should list graphs when graphs exist', async () => {
      // Create test graph first
      await testDbHelper.createTestGraph(testGraphName);

      const response = await request(app)
        .get('/api/mcp/graphs')
        .set('x-api-key', testConfig.apiKey);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      
      const graphNames = response.body.data.map((graph: any) => graph.name);
      expect(graphNames).toContain(testGraphName);
      expect(response.body.metadata.count).toBe(response.body.data.length);
    });
  });

  describe('POST /api/mcp/context', () => {
    beforeEach(async () => {
      // Create test graph with data for context tests
      await testDbHelper.createTestGraph(testGraphName);
      
      // Add some test data
      await testDbHelper.executeQuery(testGraphName, `
        CREATE (u1:User {id: 1, name: 'Alice'})
        CREATE (u2:User {id: 2, name: 'Bob'})
        CREATE (p1:Project {id: 1, name: 'Test Project'})
        CREATE (u1)-[:WORKS_ON {role: 'lead'}]->(p1)
        CREATE (u2)-[:WORKS_ON {role: 'developer'}]->(p1)
      `);
    });

    test('should require query in request body', async () => {
      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', testConfig.apiKey)
        .send({
          graphName: testGraphName
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request parameters');
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'query',
            message: 'Query is required'
          })
        ])
      );
    });

    test('should require graphName in request body', async () => {
      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', testConfig.apiKey)
        .send({
          query: 'MATCH (n) RETURN n'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request parameters');
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'graphName',
            message: 'Graph name is required'
          })
        ])
      );
    });

    test('should execute simple query successfully', async () => {
      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', testConfig.apiKey)
        .send({
          graphName: testGraphName,
          query: 'MATCH (u:User) RETURN u.name as name ORDER BY u.id'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('metadata');
      
      expect(response.body.data.data).toHaveLength(2);
      expect(response.body.data.data[0].name).toBe('Alice');
      expect(response.body.data.data[1].name).toBe('Bob');
      
      expect(response.body.metadata).toMatchObject({
        provider: 'FalkorDB MCP Server',
        source: 'falkordb',
        timestamp: expect.any(String),
        queryTime: expect.any(Number)
      });
    });

    test('should execute parameterized query successfully', async () => {
      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', testConfig.apiKey)
        .send({
          graphName: testGraphName,
          query: 'MATCH (u:User) WHERE u.id = 1 RETURN u.name as name'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.data).toHaveLength(1);
      expect(response.body.data.data[0].name).toBe('Alice');
    });

    test('should execute complex relationship query', async () => {
      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', testConfig.apiKey)
        .send({
          graphName: testGraphName,
          query: 'MATCH (u:User)-[r:WORKS_ON]->(p:Project) RETURN u.name as user, r.role as role, p.name as project'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.data).toHaveLength(2);
      
      const results = response.body.data.data;
      expect(results.some((r: any) => r.user === 'Alice' && r.role === 'lead')).toBe(true);
      expect(results.some((r: any) => r.user === 'Bob' && r.role === 'developer')).toBe(true);
    });

    test('should handle empty query results', async () => {
      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', testConfig.apiKey)
        .send({
          graphName: testGraphName,
          query: 'MATCH (n:NonExistentLabel) RETURN n'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.data).toHaveLength(0);
    });

    test('should handle query errors gracefully', async () => {
      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', testConfig.apiKey)
        .send({
          graphName: testGraphName,
          query: 'INVALID CYPHER SYNTAX'
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('metadata');
      expect(response.body.metadata).toHaveProperty('timestamp');
    });

    test('should handle non-existent graph', async () => {
      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', testConfig.apiKey)
        .send({
          graphName: 'non_existent_graph_12345',
          query: 'MATCH (n) RETURN n'
        });

      // FalkorDB creates graphs on first access, so this might succeed with empty results
      // or fail depending on the implementation
      expect([200, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.data.data).toHaveLength(0);
      } else {
        expect(response.body).toHaveProperty('error');
      }
    });
  });

  describe('GET /health', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        services: {
          database: {
            connected: expect.any(Boolean)
          }
        }
      });
    });
  });

  describe('Root endpoint', () => {
    test('should return server info', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        name: 'FalkorDB MCP Server Test',
        status: 'running'
      });
    });
  });

  describe('Content-Type handling', () => {
    test('should handle JSON content type', async () => {
      // Create a fresh graph for this test
      const contentTestGraph = generateTestGraphName('content_test');
      await testDbHelper.createTestGraph(contentTestGraph);
      
      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', testConfig.apiKey)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({
          graphName: contentTestGraph,
          query: 'MATCH (n:TestNode) RETURN count(n) as nodeCount'
        }));

      expect(response.status).toBe(200);
      expect(response.body.data.data[0].nodeCount).toBe(1);
      
      // Cleanup
      await testDbHelper.deleteTestGraph(contentTestGraph);
    });

    test('should handle URL-encoded content type', async () => {
      // Create a fresh graph for this test
      const contentTestGraph = generateTestGraphName('content_test_2');
      await testDbHelper.createTestGraph(contentTestGraph);
      
      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', testConfig.apiKey)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(`graphName=${contentTestGraph}&query=${encodeURIComponent('MATCH (n:TestNode) RETURN count(n) as nodeCount')}`);

      expect(response.status).toBe(200);
      expect(response.body.data.data[0].nodeCount).toBe(1);
      
      // Cleanup
      await testDbHelper.deleteTestGraph(contentTestGraph);
    });
  });
});