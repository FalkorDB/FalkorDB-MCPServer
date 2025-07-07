import request from 'supertest';
import express from 'express';
import { mcpController } from '../../controllers/mcp.controller';
import { authenticateMCP } from '../../middleware/auth.middleware';
import { testDbHelper, generateTestGraphName } from '../utils/test-helpers';

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
app.get('/api/mcp/metadata', mcpController.processMetadataRequest.bind(mcpController));

describe('API Contract Validation Integration Tests', () => {
  beforeAll(async () => {
    await testDbHelper.connect();
  });

  afterEach(async () => {
    await testDbHelper.clearAllTestGraphs();
  });

  describe('Request/Response Format Consistency', () => {
    beforeEach(() => {
      process.env.MCP_API_KEY = 'test-api-key';
      process.env.ENABLE_MULTI_TENANCY = 'false';
      jest.resetModules();
    });

    test('should maintain exact request format compatibility for context endpoint', async () => {
      const testGraph = 'api_contract_test';
      await testDbHelper.createTestGraph(testGraph);

      // Test all valid request formats that should be supported
      const validRequests = [
        {
          name: 'Basic request',
          data: {
            graphName: testGraph,
            query: 'CREATE (n:Test {id: 1}) RETURN n'
          }
        },
        {
          name: 'Request with parameters',
          data: {
            graphName: testGraph,
            query: 'CREATE (n:Test {id: $id, name: $name}) RETURN n',
            params: { id: 2, name: 'test' }
          }
        },
        {
          name: 'Request with empty parameters',
          data: {
            graphName: testGraph,
            query: 'CREATE (n:Test {id: 3}) RETURN n',
            params: {}
          }
        },
        {
          name: 'Request with null parameters',
          data: {
            graphName: testGraph,
            query: 'CREATE (n:Test {id: 4}) RETURN n',
            params: null
          }
        },
        {
          name: 'Request with complex parameters',
          data: {
            graphName: testGraph,
            query: 'CREATE (n:Test {id: $id, data: $data}) RETURN n',
            params: {
              id: 5,
              data: {
                nested: true,
                array: [1, 2, 3],
                string: 'complex value'
              }
            }
          }
        }
      ];

      for (const testCase of validRequests) {
        const response = await request(app)
          .post('/api/mcp/context')
          .set('x-api-key', 'test-api-key')
          .send(testCase.data);

        expect(response.status).toBe(200);
        
        // Validate response structure
        expect(response.body).toHaveProperty('data');
        expect(response.body).toHaveProperty('metadata');
        expect(response.body.metadata).toHaveProperty('timestamp');
        expect(response.body.metadata).toHaveProperty('queryTime');
        expect(response.body.metadata).toHaveProperty('provider');
        expect(response.body.metadata).toHaveProperty('source');
        
        // Validate response values
        expect(response.body.metadata.provider).toBe('FalkorDB MCP Server');
        expect(response.body.metadata.source).toBe('falkordb');
        expect(typeof response.body.metadata.timestamp).toBe('string');
        expect(typeof response.body.metadata.queryTime).toBe('number');
        
        // Should NOT have tenant-related fields when multi-tenancy disabled
        expect(response.body.metadata.tenantId).toBeUndefined();
      }
    });

    test('should maintain exact response format for graphs endpoint', async () => {
      // Create test graphs
      const testGraphs = ['contract_graph_1', 'contract_graph_2', 'contract_graph_3'];
      for (const graph of testGraphs) {
        await testDbHelper.createTestGraph(graph);
      }

      const response = await request(app)
        .get('/api/mcp/graphs')
        .set('x-api-key', 'test-api-key');

      expect(response.status).toBe(200);
      
      // Validate response structure
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('metadata');
      expect(Array.isArray(response.body.data)).toBe(true);
      
      // Validate metadata structure
      expect(response.body.metadata).toHaveProperty('timestamp');
      expect(response.body.metadata).toHaveProperty('count');
      expect(typeof response.body.metadata.timestamp).toBe('string');
      expect(typeof response.body.metadata.count).toBe('number');
      
      // Validate data structure
      response.body.data.forEach((graph: any) => {
        expect(graph).toHaveProperty('name');
        expect(typeof graph.name).toBe('string');
      });
      
      // Should NOT have tenant-related fields when multi-tenancy disabled
      expect(response.body.metadata.tenantId).toBeUndefined();
    });

    test('should maintain exact response format for metadata endpoint', async () => {
      const response = await request(app)
        .get('/api/mcp/metadata')
        .set('x-api-key', 'test-api-key');

      expect(response.status).toBe(200);
      
      // Validate exact structure as defined in v1.0.0
      expect(response.body).toEqual({
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
      
      // Should NOT have any additional fields
      const expectedKeys = ['provider', 'version', 'capabilities', 'graphTypes', 'queryLanguages'];
      const actualKeys = Object.keys(response.body);
      expect(actualKeys.sort()).toEqual(expectedKeys.sort());
    });

    test('should maintain exact error response formats', async () => {
      const errorCases = [
        {
          name: 'Missing query',
          request: { graphName: 'test' },
          expectedStatus: 400,
          expectedError: 'Query is required'
        },
        {
          name: 'Missing graphName',
          request: { query: 'MATCH (n) RETURN n' },
          expectedStatus: 400,
          expectedError: 'Graph name is required'
        },
        {
          name: 'Missing API key',
          request: { graphName: 'test', query: 'MATCH (n) RETURN n' },
          expectedStatus: 401,
          expectedError: 'Missing API key',
          omitApiKey: true
        },
        {
          name: 'Invalid API key',
          request: { graphName: 'test', query: 'MATCH (n) RETURN n' },
          expectedStatus: 403,
          expectedError: 'Invalid API key',
          apiKey: 'invalid-key'
        }
      ];

      for (const testCase of errorCases) {
        let requestBuilder = request(app).post('/api/mcp/context');
        
        if (!testCase.omitApiKey) {
          requestBuilder = requestBuilder.set('x-api-key', testCase.apiKey || 'test-api-key');
        }

        const response = await requestBuilder.send(testCase.request);

        expect(response.status).toBe(testCase.expectedStatus);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toBe(testCase.expectedError);
        
        // Error responses should have minimal structure
        const errorKeys = Object.keys(response.body);
        if (testCase.expectedStatus >= 500) {
          // Server errors may include metadata
          expect(errorKeys).toContain('error');
          if (response.body.metadata) {
            expect(response.body.metadata).toHaveProperty('timestamp');
          }
        } else {
          // Client errors should only have error field
          expect(errorKeys).toEqual(['error']);
        }
      }
    });
  });

  describe('Multi-tenancy API Contract Extensions', () => {
    test('should add tenant fields consistently when multi-tenancy enabled', async () => {
      process.env.ENABLE_MULTI_TENANCY = 'true';
      process.env.MULTI_TENANT_AUTH_MODE = 'oauth2';
      process.env.TENANT_GRAPH_PREFIX = 'true';
      process.env.OAUTH2_JWKS_URL = 'https://example.com/.well-known/jwks.json';
      process.env.OAUTH2_ISSUER = 'https://example.com';

      jest.resetModules();

      // Mock OAuth2 middleware
      const { oauth2Middleware } = require('../../middleware/oauth2.middleware');
      oauth2Middleware.validateJWT.mockImplementation((req: any, res: any, next: any) => {
        req.tenantId = 'test-tenant-123';
        next();
      });

      const testGraph = 'tenant_contract_test';
      await testDbHelper.createTestGraph('test-tenant-123_tenant_contract_test');

      // Test context endpoint response includes tenant information
      const contextResponse = await request(app)
        .post('/api/mcp/context')
        .set('Authorization', 'Bearer test-jwt')
        .send({
          graphName: testGraph,
          query: 'CREATE (n:Test {tenant: "test"}) RETURN n'
        });

      expect(contextResponse.status).toBe(200);
      expect(contextResponse.body.metadata.tenantId).toBe('test-tenant-123');
      
      // Validate that base contract is preserved
      expect(contextResponse.body).toHaveProperty('data');
      expect(contextResponse.body).toHaveProperty('metadata');
      expect(contextResponse.body.metadata.provider).toBe('FalkorDB MCP Server');
      expect(contextResponse.body.metadata.source).toBe('falkordb');

      // Test graphs endpoint response includes tenant information
      const graphsResponse = await request(app)
        .get('/api/mcp/graphs')
        .set('Authorization', 'Bearer test-jwt');

      expect(graphsResponse.status).toBe(200);
      expect(graphsResponse.body.metadata.tenantId).toBe('test-tenant-123');
      
      // Validate that base contract is preserved
      expect(graphsResponse.body).toHaveProperty('data');
      expect(graphsResponse.body).toHaveProperty('metadata');
      expect(graphsResponse.body.metadata).toHaveProperty('count');
      expect(graphsResponse.body.metadata).toHaveProperty('timestamp');
    });

    test('should handle tenant field presence/absence consistently across endpoints', async () => {
      const scenarios = [
        {
          name: 'Multi-tenancy disabled',
          config: { ENABLE_MULTI_TENANCY: 'false' },
          auth: { type: 'api-key', value: 'test-api-key' },
          expectTenantId: false
        },
        {
          name: 'Multi-tenancy enabled, API key mode',
          config: { 
            ENABLE_MULTI_TENANCY: 'true', 
            MULTI_TENANT_AUTH_MODE: 'api-key',
            TENANT_GRAPH_PREFIX: 'true'
          },
          auth: { type: 'api-key', value: 'test-api-key' },
          expectTenantId: false // No tenant context in API key mode
        }
      ];

      for (const scenario of scenarios) {
        // Set configuration
        Object.keys(scenario.config).forEach(key => {
          process.env[key] = (scenario.config as any)[key];
        });
        jest.resetModules();

        const testGraph = 'consistency_test';
        await testDbHelper.createTestGraph(testGraph);

        // Test context endpoint
        let requestBuilder = request(app).post('/api/mcp/context');
        if (scenario.auth.type === 'api-key') {
          requestBuilder = requestBuilder.set('x-api-key', scenario.auth.value);
        }

        const contextResponse = await requestBuilder.send({
          graphName: testGraph,
          query: 'CREATE (n:Test) RETURN n'
        });

        expect(contextResponse.status).toBe(200);
        if (scenario.expectTenantId) {
          expect(contextResponse.body.metadata).toHaveProperty('tenantId');
        } else {
          expect(contextResponse.body.metadata.tenantId).toBeUndefined();
        }

        // Test graphs endpoint
        requestBuilder = request(app).get('/api/mcp/graphs');
        if (scenario.auth.type === 'api-key') {
          requestBuilder = requestBuilder.set('x-api-key', scenario.auth.value);
        }

        const graphsResponse = await requestBuilder;

        expect(graphsResponse.status).toBe(200);
        if (scenario.expectTenantId) {
          expect(graphsResponse.body.metadata).toHaveProperty('tenantId');
        } else {
          expect(graphsResponse.body.metadata.tenantId).toBeUndefined();
        }
      }
    });
  });

  describe('HTTP Header and Content-Type Handling', () => {
    beforeEach(() => {
      process.env.ENABLE_MULTI_TENANCY = 'false';
      process.env.MCP_API_KEY = 'test-api-key';
      jest.resetModules();
    });

    test('should handle various Content-Type headers correctly', async () => {
      const testGraph = 'content_type_test';
      await testDbHelper.createTestGraph(testGraph);

      const contentTypes = [
        'application/json',
        'application/json; charset=utf-8',
        'application/x-www-form-urlencoded',
        undefined // No Content-Type header
      ];

      for (const contentType of contentTypes) {
        let requestBuilder = request(app)
          .post('/api/mcp/context')
          .set('x-api-key', 'test-api-key');

        if (contentType) {
          requestBuilder = requestBuilder.set('Content-Type', contentType);
        }

        const response = await requestBuilder.send({
          graphName: testGraph,
          query: 'CREATE (n:Test {contentType: "' + (contentType || 'undefined') + '"}) RETURN n'
        });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('data');
        expect(response.body).toHaveProperty('metadata');
      }
    });

    test('should handle API key in both header and query parameter', async () => {
      const testGraph = 'api_key_location_test';
      await testDbHelper.createTestGraph(testGraph);

      // Test API key in header
      const headerResponse = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key')
        .send({
          graphName: testGraph,
          query: 'CREATE (n:Test {auth: "header"}) RETURN n'
        });

      expect(headerResponse.status).toBe(200);

      // Test API key in query parameter
      const queryResponse = await request(app)
        .post('/api/mcp/context?apiKey=test-api-key')
        .send({
          graphName: testGraph,
          query: 'CREATE (n:Test {auth: "query"}) RETURN n'
        });

      expect(queryResponse.status).toBe(200);

      // Both should produce identical response structure
      expect(headerResponse.body).toMatchObject({
        data: expect.any(Object),
        metadata: expect.objectContaining({
          provider: 'FalkorDB MCP Server',
          source: 'falkordb'
        })
      });

      expect(queryResponse.body).toMatchObject({
        data: expect.any(Object),
        metadata: expect.objectContaining({
          provider: 'FalkorDB MCP Server',
          source: 'falkordb'
        })
      });
    });

    test('should return consistent response headers', async () => {
      const response = await request(app)
        .get('/api/mcp/metadata')
        .set('x-api-key', 'test-api-key');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('Data Type and Encoding Consistency', () => {
    beforeEach(() => {
      process.env.ENABLE_MULTI_TENANCY = 'false';
      process.env.MCP_API_KEY = 'test-api-key';
      jest.resetModules();
    });

    test('should handle various data types in request parameters consistently', async () => {
      const testGraph = 'data_type_test';
      await testDbHelper.createTestGraph(testGraph);

      const dataTypeTests = [
        {
          name: 'String parameters',
          params: { stringParam: 'test string', emptyString: '' }
        },
        {
          name: 'Number parameters',
          params: { intParam: 42, floatParam: 3.14, zeroParam: 0, negativeParam: -1 }
        },
        {
          name: 'Boolean parameters',
          params: { trueParam: true, falseParam: false }
        },
        {
          name: 'Null and undefined parameters',
          params: { nullParam: null, undefinedParam: undefined }
        },
        {
          name: 'Array parameters',
          params: { arrayParam: [1, 2, 3], emptyArray: [], mixedArray: [1, 'two', true, null] }
        },
        {
          name: 'Object parameters',
          params: { 
            objectParam: { nested: { deep: 'value' } },
            emptyObject: {},
            complexObject: {
              string: 'value',
              number: 123,
              boolean: true,
              array: [1, 2, 3],
              null: null
            }
          }
        }
      ];

      for (const test of dataTypeTests) {
        const response = await request(app)
          .post('/api/mcp/context')
          .set('x-api-key', 'test-api-key')
          .send({
            graphName: testGraph,
            query: `CREATE (n:Test {testName: "${test.name}", timestamp: timestamp()}) RETURN n`,
            params: test.params
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('data');
        expect(response.body).toHaveProperty('metadata');
        
        // Validate metadata types
        expect(typeof response.body.metadata.timestamp).toBe('string');
        expect(typeof response.body.metadata.queryTime).toBe('number');
        expect(typeof response.body.metadata.provider).toBe('string');
        expect(typeof response.body.metadata.source).toBe('string');
      }
    });

    test('should handle Unicode and special characters consistently', async () => {
      const testGraph = 'unicode_test';
      await testDbHelper.createTestGraph(testGraph);

      const unicodeTests = [
        { name: 'Basic Unicode', text: 'Hello 世界 🌍' },
        { name: 'Emojis', text: '🚀🎉🔥💡🌟' },
        { name: 'Cyrillic', text: 'Привет мир' },
        { name: 'Arabic', text: 'مرحبا بالعالم' },
        { name: 'Special chars', text: 'Test!@#$%^&*()_+-={}[]|\\:";\'<>?,./' },
        { name: 'Newlines and tabs', text: 'Line 1\nLine 2\tTabbed' },
        { name: 'Quotes', text: 'Single \' and double " quotes' }
      ];

      for (const test of unicodeTests) {
        const response = await request(app)
          .post('/api/mcp/context')
          .set('x-api-key', 'test-api-key')
          .send({
            graphName: testGraph,
            query: 'CREATE (n:UnicodeTest {name: $name, text: $text}) RETURN n',
            params: { name: test.name, text: test.text }
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('data');
        expect(response.body).toHaveProperty('metadata');
      }
    });
  });

  describe('Backward Compatibility Validation', () => {
    test('should maintain API contract across configuration changes', async () => {
      const testGraph = 'compatibility_validation';
      await testDbHelper.createTestGraph(testGraph);

      const configurations = [
        { name: 'Legacy (no MT vars)', env: {} },
        { name: 'MT explicitly disabled', env: { ENABLE_MULTI_TENANCY: 'false' } },
        { name: 'MT enabled, API key mode', env: { ENABLE_MULTI_TENANCY: 'true', MULTI_TENANT_AUTH_MODE: 'api-key' } }
      ];

      const baselineResponse: { context: any, graphs: any, metadata: any } = { context: null, graphs: null, metadata: null };

      for (const [index, config] of configurations.entries()) {
        // Set environment
        Object.keys(config.env).forEach(key => {
          process.env[key] = (config.env as any)[key];
        });
        process.env.MCP_API_KEY = 'test-api-key';
        jest.resetModules();

        // Test all endpoints
        const responses = {
          context: await request(app)
            .post('/api/mcp/context')
            .set('x-api-key', 'test-api-key')
            .send({
              graphName: testGraph,
              query: `CREATE (n:Test {config: "${config.name}"}) RETURN n`
            }),
          
          graphs: await request(app)
            .get('/api/mcp/graphs')
            .set('x-api-key', 'test-api-key'),
          
          metadata: await request(app)
            .get('/api/mcp/metadata')
            .set('x-api-key', 'test-api-key')
        };

        // Validate all responses are successful
        Object.values(responses).forEach(response => {
          expect(response.status).toBe(200);
        });

        if (index === 0) {
          // Store baseline
          baselineResponse.context = responses.context.body;
          baselineResponse.graphs = responses.graphs.body;
          baselineResponse.metadata = responses.metadata.body;
        } else {
          // Compare with baseline
          
          // Context response structure should be identical (excluding tenant fields)
          expect(responses.context.body).toHaveProperty('data');
          expect(responses.context.body).toHaveProperty('metadata');
          expect(responses.context.body.metadata.provider).toBe(baselineResponse.context!.metadata.provider);
          expect(responses.context.body.metadata.source).toBe(baselineResponse.context!.metadata.source);

          // Graphs response structure should be identical (excluding tenant fields)
          expect(responses.graphs.body).toHaveProperty('data');
          expect(responses.graphs.body).toHaveProperty('metadata');
          expect(Array.isArray(responses.graphs.body.data)).toBe(true);
          expect(typeof responses.graphs.body.metadata.count).toBe('number');

          // Metadata response should be completely identical
          expect(responses.metadata.body).toEqual(baselineResponse.metadata);
        }
      }
    });
  });
});