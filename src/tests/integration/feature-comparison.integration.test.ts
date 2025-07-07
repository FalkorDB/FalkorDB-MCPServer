import request from 'supertest';
import express from 'express';
import { mcpController } from '../../controllers/mcp.controller';
import { authenticateMCP } from '../../middleware/auth.middleware';
import { testDbHelper } from '../utils/test-helpers';

// Mock Bearer middleware for testing
jest.mock('../../middleware/bearer.middleware', () => ({
  bearerMiddleware: {
    validateJWT: jest.fn()
  }
}));

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/mcp', authenticateMCP);

app.post('/api/mcp/context', mcpController.processContextRequest.bind(mcpController));
app.get('/api/mcp/graphs', mcpController.listGraphs.bind(mcpController));

describe('Feature Comparison Integration Tests', () => {
  beforeAll(async () => {
    await testDbHelper.connect();
  });

  afterEach(async () => {
    await testDbHelper.clearAllTestGraphs();
  });

  describe('Side-by-side: Legacy vs Multi-tenant Mode', () => {
    const testGraphName = 'comparison_test';
    const testQuery = 'CREATE (n:Person {name: "Test", id: 1}) RETURN n';

    beforeEach(async () => {
      await testDbHelper.createTestGraph(testGraphName);
      process.env.MCP_API_KEY = 'test-api-key';
    });

    test('should produce identical results: Legacy mode vs Multi-tenant disabled', async () => {
      // Test 1: Legacy behavior (multi-tenancy disabled)
      process.env.ENABLE_MULTI_TENANCY = 'false';
      jest.resetModules();

      const legacyGraphName = 'comparison_test_legacy';
      await testDbHelper.createTestGraph(legacyGraphName);

      const legacyResponse = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key')
        .send({
          graphName: legacyGraphName,
          query: testQuery
        });

      // Test 2: Multi-tenancy disabled explicitly  
      process.env.ENABLE_MULTI_TENANCY = 'false';
      process.env.TENANT_GRAPH_PREFIX = 'false';
      jest.resetModules();

      const disabledGraphName = 'comparison_test_disabled';
      await testDbHelper.createTestGraph(disabledGraphName);

      const disabledResponse = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key')
        .send({
          graphName: disabledGraphName,
          query: testQuery
        });

      // Compare responses (should be identical except auto-generated IDs and timestamps)
      expect(legacyResponse.status).toBe(disabledResponse.status);
      
      // Compare data structure, ignoring auto-generated IDs
      expect(legacyResponse.body.data.length).toBe(disabledResponse.body.data.length);
      if (legacyResponse.body.data.length > 0) {
        const legacyNode = legacyResponse.body.data[0].n;
        const disabledNode = disabledResponse.body.data[0].n;
        expect(legacyNode.labels).toEqual(disabledNode.labels);
        expect(legacyNode.properties).toEqual(disabledNode.properties);
      }
      
      expect(legacyResponse.body.metadata.provider).toBe(disabledResponse.body.metadata.provider);
      expect(legacyResponse.body.metadata.source).toBe(disabledResponse.body.metadata.source);
      expect(legacyResponse.body.metadata.tenantId).toBeUndefined();
      expect(disabledResponse.body.metadata.tenantId).toBeUndefined();
    });

    test('should show identical graph listing: Legacy vs Multi-tenant disabled', async () => {
      // Add some test data
      await testDbHelper.executeQuery(testGraphName, testQuery);
      await testDbHelper.createTestGraph('another_test_graph');

      // Test 1: Legacy mode
      process.env.ENABLE_MULTI_TENANCY = 'false';
      jest.resetModules();

      const legacyGraphs = await request(app)
        .get('/api/mcp/graphs')
        .set('x-api-key', 'test-api-key');

      // Test 2: Multi-tenancy disabled
      process.env.ENABLE_MULTI_TENANCY = 'false';
      process.env.TENANT_GRAPH_PREFIX = 'false';
      jest.resetModules();

      const disabledGraphs = await request(app)
        .get('/api/mcp/graphs')
        .set('x-api-key', 'test-api-key');

      // Should return identical graph lists
      expect(legacyGraphs.status).toBe(disabledGraphs.status);
      expect(legacyGraphs.body.data.sort((a: any, b: any) => a.name.localeCompare(b.name)))
        .toEqual(disabledGraphs.body.data.sort((a: any, b: any) => a.name.localeCompare(b.name)));
      expect(legacyGraphs.body.metadata.count).toBe(disabledGraphs.body.metadata.count);
      expect(legacyGraphs.body.metadata.tenantId).toBeUndefined();
      expect(disabledGraphs.body.metadata.tenantId).toBeUndefined();
    });

    test('should list all graphs when multi-tenancy disabled', async () => {
      // Setup: Create graphs that would be isolated
      await testDbHelper.createTestGraph('tenant1_isolated');
      await testDbHelper.createTestGraph('tenant2_isolated'); 
      await testDbHelper.createTestGraph('shared_graph');

      // Multi-tenancy disabled - should see all graphs
      process.env.ENABLE_MULTI_TENANCY = 'false';
      jest.resetModules();

      const allGraphsResponse = await request(app)
        .get('/api/mcp/graphs')
        .set('x-api-key', 'test-api-key');

      const allGraphNames = allGraphsResponse.body.data.map((g: any) => g.name);
      
      expect(allGraphNames).toContain('tenant1_isolated');
      expect(allGraphNames).toContain('tenant2_isolated');
      expect(allGraphNames).toContain('shared_graph');
    });

    test('should list all graphs when using API key authentication', async () => {
      // Setup: Create graphs with different naming patterns
      await testDbHelper.createTestGraph('tenant1_isolated_api');
      await testDbHelper.createTestGraph('tenant2_isolated_api'); 
      await testDbHelper.createTestGraph('shared_graph_api');

      // With API key authentication, should see all graphs (no tenant filtering)
      const apiKeyResponse = await request(app)
        .get('/api/mcp/graphs')
        .set('x-api-key', 'test-api-key');

      expect(apiKeyResponse.status).toBe(200);
      const apiKeyGraphNames = apiKeyResponse.body.data.map((g: any) => g.name);
      
      // API key mode should show all graphs regardless of naming
      expect(apiKeyGraphNames).toContain('tenant1_isolated_api');
      expect(apiKeyGraphNames).toContain('tenant2_isolated_api');
      expect(apiKeyGraphNames).toContain('shared_graph_api');
      expect(apiKeyResponse.body.metadata.tenantId).toBeUndefined();
    });
  });

  describe('Authentication Mode Comparison', () => {
    test('should handle API key authentication identically across modes', async () => {
      const testData = {
        graphName: 'auth_test',
        query: 'CREATE (n:AuthTest {mode: "api-key"}) RETURN n'
      };

      await testDbHelper.createTestGraph('auth_test');

      // Test scenarios
      const scenarios = [
        { desc: 'Legacy (undefined)', env: {} },
        { desc: 'Multi-tenant disabled', env: { ENABLE_MULTI_TENANCY: 'false' } },
        { desc: 'Multi-tenant with API key', env: { ENABLE_MULTI_TENANCY: 'true', MULTI_TENANT_AUTH_MODE: 'api-key' } }
      ];

      const results = [];
      for (const scenario of scenarios) {
        // Set environment
        Object.keys(scenario.env).forEach(key => {
          process.env[key] = (scenario.env as any)[key];
        });
        jest.resetModules();

        // Test valid API key
        const validResponse = await request(app)
          .post('/api/mcp/context')
          .set('x-api-key', 'test-api-key')
          .send(testData);

        // Test invalid API key
        const invalidResponse = await request(app)
          .post('/api/mcp/context')
          .set('x-api-key', 'wrong-key')
          .send(testData);

        // Test missing API key
        const missingResponse = await request(app)
          .post('/api/mcp/context')
          .send(testData);

        results.push({
          scenario: scenario.desc,
          valid: { status: validResponse.status, hasData: !!validResponse.body.data },
          invalid: { status: invalidResponse.status, error: invalidResponse.body.error },
          missing: { status: missingResponse.status, error: missingResponse.body.error }
        });
      }

      // All scenarios should behave identically for API key auth
      const firstResult = results[0];
      for (let i = 1; i < results.length; i++) {
        expect(results[i].valid).toEqual(firstResult.valid);
        expect(results[i].invalid).toEqual(firstResult.invalid);
        expect(results[i].missing).toEqual(firstResult.missing);
      }
    });
  });

  describe('Error Handling Consistency', () => {
    test('should handle errors identically across all modes', async () => {
      const errorScenarios = [
        { name: 'missing query', data: { graphName: 'test' } },
        { name: 'missing graphName', data: { query: 'MATCH (n) RETURN n' } },
        { name: 'invalid query', data: { graphName: 'test', query: 'INVALID SYNTAX' } },
        { name: 'non-existent graph', data: { graphName: 'nonexistent_graph_12345', query: 'MATCH (n) RETURN n' } }
      ];

      const modes = [
        { desc: 'Legacy', env: {} },
        { desc: 'Multi-tenant disabled', env: { ENABLE_MULTI_TENANCY: 'false' } },
        { desc: 'Multi-tenant API key', env: { ENABLE_MULTI_TENANCY: 'true', MULTI_TENANT_AUTH_MODE: 'api-key' } }
      ];

      for (const errorScenario of errorScenarios) {
        const modeResults = [];

        for (const mode of modes) {
          // Set environment
          Object.keys(mode.env).forEach(key => {
            process.env[key] = (mode.env as any)[key];
          });
          jest.resetModules();

          const response = await request(app)
            .post('/api/mcp/context')
            .set('x-api-key', 'test-api-key')
            .send(errorScenario.data);

          modeResults.push({
            mode: mode.desc,
            status: response.status,
            hasError: !!response.body.error,
            hasMetadata: !!response.body.metadata,
            hasTenantId: !!response.body.metadata?.tenantId
          });
        }

        // All modes should handle this error identically
        const baseResult = modeResults[0];
        for (let i = 1; i < modeResults.length; i++) {
          expect(modeResults[i].status).toBe(baseResult.status);
          expect(modeResults[i].hasError).toBe(baseResult.hasError);
          expect(modeResults[i].hasMetadata).toBe(baseResult.hasMetadata);
          // Tenant ID should never be present in these modes
          expect(modeResults[i].hasTenantId).toBe(false);
        }
      }
    });
  });

  describe('Performance Impact Analysis', () => {
    test('should have minimal performance impact when multi-tenancy disabled', async () => {
      const graphName = 'performance_comparison';
      await testDbHelper.createTestGraph(graphName);
      
      const testQuery = 'CREATE (n:PerfTest {timestamp: timestamp()}) RETURN n';
      const iterations = 20;

      // Measure legacy performance
      process.env.ENABLE_MULTI_TENANCY = 'false';
      jest.resetModules();

      const legacyTimes = [];
      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        const response = await request(app)
          .post('/api/mcp/context')
          .set('x-api-key', 'test-api-key')
          .send({ graphName, query: `${testQuery} // iteration ${i}` });
        legacyTimes.push(Date.now() - start);
        expect(response.status).toBe(200);
      }

      // Measure multi-tenant disabled performance
      process.env.ENABLE_MULTI_TENANCY = 'false';
      process.env.TENANT_GRAPH_PREFIX = 'false';
      jest.resetModules();

      const multiTenantTimes = [];
      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        const response = await request(app)
          .post('/api/mcp/context')
          .set('x-api-key', 'test-api-key')
          .send({ graphName, query: `${testQuery} // mt iteration ${i}` });
        multiTenantTimes.push(Date.now() - start);
        expect(response.status).toBe(200);
      }

      // Calculate averages
      const legacyAvg = legacyTimes.reduce((a, b) => a + b, 0) / legacyTimes.length;
      const multiTenantAvg = multiTenantTimes.reduce((a, b) => a + b, 0) / multiTenantTimes.length;

      // Performance should be within 10% (adjust threshold as needed)
      const performanceRatio = multiTenantAvg / legacyAvg;
      expect(performanceRatio).toBeLessThan(1.1); // No more than 10% slower
      
      console.log(`Performance comparison: Legacy=${legacyAvg.toFixed(2)}ms, Multi-tenant=${multiTenantAvg.toFixed(2)}ms, Ratio=${performanceRatio.toFixed(3)}`);
    });
  });

  describe('Data Integrity Comparison', () => {
    test('should produce identical data operations across modes', async () => {
      const graphName = 'data_integrity_test';
      await testDbHelper.createTestGraph(graphName);

      const operations = [
        'CREATE (a:Node {id: 1, type: "A"})',
        'CREATE (b:Node {id: 2, type: "B"})', 
        'MATCH (a:Node {id: 1}), (b:Node {id: 2}) CREATE (a)-[:CONNECTS]->(b)',
        'MATCH (n:Node) SET n.processed = true',
        'MATCH (n:Node) RETURN n.id, n.type, n.processed ORDER BY n.id'
      ];

      // Execute in legacy mode
      process.env.ENABLE_MULTI_TENANCY = 'false';
      jest.resetModules();

      const legacyResults = [];
      for (const operation of operations) {
        const response = await request(app)
          .post('/api/mcp/context')
          .set('x-api-key', 'test-api-key')
          .send({ graphName: `${graphName}_legacy`, query: operation });
        
        await testDbHelper.createTestGraph(`${graphName}_legacy`);
        expect(response.status).toBe(200);
        legacyResults.push(response.body.data);
      }

      // Execute in multi-tenant disabled mode
      process.env.ENABLE_MULTI_TENANCY = 'false';
      process.env.TENANT_GRAPH_PREFIX = 'false';
      jest.resetModules();

      const multiTenantResults = [];
      for (const operation of operations) {
        const response = await request(app)
          .post('/api/mcp/context')
          .set('x-api-key', 'test-api-key')
          .send({ graphName: `${graphName}_mt`, query: operation });
        
        await testDbHelper.createTestGraph(`${graphName}_mt`);
        expect(response.status).toBe(200);
        multiTenantResults.push(response.body.data);
      }

      // Results should be structurally identical
      expect(legacyResults.length).toBe(multiTenantResults.length);
      for (let i = 0; i < legacyResults.length; i++) {
        // For data modification operations, check structure
        if (typeof legacyResults[i] === 'object' && typeof multiTenantResults[i] === 'object') {
          expect(Object.keys(legacyResults[i])).toEqual(Object.keys(multiTenantResults[i]));
        }
      }
    });
  });
});