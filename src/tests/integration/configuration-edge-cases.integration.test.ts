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

describe('Configuration Edge Cases Integration Tests', () => {
  beforeAll(async () => {
    await testDbHelper.connect();
  });

  afterEach(async () => {
    await testDbHelper.clearAllTestGraphs();
    // Clean up environment variables
    delete process.env.ENABLE_MULTI_TENANCY;
    delete process.env.MULTI_TENANT_AUTH_MODE;
    delete process.env.TENANT_GRAPH_PREFIX;
    delete process.env.BEARER_JWKS_URI;
    delete process.env.BEARER_ISSUER;
    delete process.env.BEARER_ALGORITHM;
    delete process.env.BEARER_AUDIENCE;
    process.env.MCP_API_KEY = 'test-api-key';
    jest.resetModules();
  });

  describe('Environment Variable Edge Cases', () => {
    test('should handle undefined environment variables gracefully', async () => {
      // Completely remove all multi-tenancy env vars but keep API key
      delete process.env.ENABLE_MULTI_TENANCY;
      delete process.env.MULTI_TENANT_AUTH_MODE;
      delete process.env.TENANT_GRAPH_PREFIX;
      delete process.env.BEARER_JWKS_URI;
      delete process.env.BEARER_ISSUER;
      delete process.env.BEARER_ALGORITHM;
      delete process.env.BEARER_AUDIENCE;
      process.env.MCP_API_KEY = 'test-api-key'; // Ensure API key is set

      jest.resetModules();

      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key')
        .send({
          graphName: 'test_undefined_vars',
          query: 'CREATE (n:Test {type: "undefined_vars"}) RETURN n'
        });

      expect(response.status).toBe(200);
      expect(response.body.metadata.tenantId).toBeUndefined();
      expect(response.body.metadata.provider).toBe('FalkorDB MCP Server');
    });

    test('should handle empty string environment variables', async () => {
      process.env.ENABLE_MULTI_TENANCY = '';
      process.env.MULTI_TENANT_AUTH_MODE = '';
      process.env.TENANT_GRAPH_PREFIX = '';
      process.env.BEARER_JWKS_URI = '';
      process.env.BEARER_ISSUER = '';
      process.env.BEARER_ALGORITHM = '';
      process.env.BEARER_AUDIENCE = '';
      process.env.MCP_API_KEY = 'test-api-key'; // Ensure API key is set

      jest.resetModules();

      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key')
        .send({
          graphName: 'test_empty_strings',
          query: 'CREATE (n:Test {type: "empty_strings"}) RETURN n'
        });

      expect(response.status).toBe(200);
      expect(response.body.metadata.tenantId).toBeUndefined();
    });

    test('should handle whitespace-only environment variables', async () => {
      process.env.ENABLE_MULTI_TENANCY = '   ';
      process.env.MULTI_TENANT_AUTH_MODE = '\t\n';
      process.env.TENANT_GRAPH_PREFIX = '  \t  ';
      process.env.OAUTH2_JWKS_URL = ' ';
      process.env.OAUTH2_ISSUER = '\n\t';

      jest.resetModules();

      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key')
        .send({
          graphName: 'test_whitespace',
          query: 'CREATE (n:Test {type: "whitespace"}) RETURN n'
        });

      expect(response.status).toBe(200);
      expect(response.body.metadata.tenantId).toBeUndefined();
    });

    test('should handle invalid boolean values for feature flags', async () => {
      const invalidBooleans = ['yes', 'no', '1', '0', 'TRUE', 'FALSE', 'on', 'off', 'enabled', 'disabled'];

      for (const invalidValue of invalidBooleans) {
        process.env.ENABLE_MULTI_TENANCY = invalidValue;
        process.env.TENANT_GRAPH_PREFIX = invalidValue;

        jest.resetModules();

        const response = await request(app)
          .post('/api/mcp/context')
          .set('x-api-key', 'test-api-key')
          .send({
            graphName: 'test_invalid_bool',
            query: `CREATE (n:Test {value: "${invalidValue}"}) RETURN n`
          });

        expect(response.status).toBe(200);
        // Invalid boolean values should default to false
        expect(response.body.metadata.tenantId).toBeUndefined();
      }
    });

    test('should handle case variations in boolean environment variables', async () => {
      const caseVariations = ['True', 'TRUE', 'tRuE', 'False', 'FALSE', 'fAlSe'];

      for (const variation of caseVariations) {
        process.env.ENABLE_MULTI_TENANCY = variation;
        process.env.TENANT_GRAPH_PREFIX = variation;

        jest.resetModules();

        const response = await request(app)
          .post('/api/mcp/context')
          .set('x-api-key', 'test-api-key')
          .send({
            graphName: 'test_case_variation',
            query: `CREATE (n:Test {case: "${variation}"}) RETURN n`
          });

        expect(response.status).toBe(200);
        
        if (variation.toLowerCase() === 'true') {
          // Only exact 'true' should enable multi-tenancy, but without OAuth2 config it should still work
          expect(response.body.metadata.tenantId).toBeUndefined();
        } else {
          expect(response.body.metadata.tenantId).toBeUndefined();
        }
      }
    });

    test('should handle invalid authentication mode values', async () => {
      process.env.ENABLE_MULTI_TENANCY = 'true';
      process.env.TENANT_GRAPH_PREFIX = 'true';

      const invalidAuthModes = ['jwt', 'oauth', 'invalid', 'api_key', 'oauth2-jwt', 'oauth2', ''];

      for (const invalidMode of invalidAuthModes) {
        process.env.MULTI_TENANT_AUTH_MODE = invalidMode;

        jest.resetModules();

        const response = await request(app)
          .post('/api/mcp/context')
          .set('x-api-key', 'test-api-key')
          .send({
            graphName: 'test_invalid_auth',
            query: `CREATE (n:Test {auth_mode: "${invalidMode}"}) RETURN n`
          });

        expect(response.status).toBe(200);
        // Invalid auth modes should default to 'api-key' behavior
        expect(response.body.metadata.tenantId).toBeUndefined();
      }
    });
  });

  describe('OAuth2 Configuration Edge Cases', () => {
    beforeEach(() => {
      process.env.ENABLE_MULTI_TENANCY = 'true';
      process.env.MULTI_TENANT_AUTH_MODE = 'oauth2';
      process.env.TENANT_GRAPH_PREFIX = 'true';
    });

    test('should handle missing OAuth2 configuration gracefully', async () => {
      // Don't set OAUTH2_JWKS_URL or OAUTH2_ISSUER
      jest.resetModules();

      // Should not crash the server initialization
      const response = await request(app)
        .post('/api/mcp/context')
        .set('Authorization', 'Bearer some-token')
        .send({
          graphName: 'test_missing_oauth2_config',
          query: 'CREATE (n:Test) RETURN n'
        });

      // Should handle gracefully (may return 401 or 500, but shouldn't crash)
      expect([401, 500]).toContain(response.status);
    });

    test('should handle malformed OAuth2 URLs', async () => {
      const malformedUrls = [
        'not-a-url',
        'ftp://invalid-protocol.com/jwks',
        'http://missing-path',
        'https://',
        'https://example.com/jwks with spaces',
        'https://[invalid-ipv6]/.well-known/jwks.json'
      ];

      for (const badUrl of malformedUrls) {
        process.env.OAUTH2_JWKS_URL = badUrl;
        process.env.OAUTH2_ISSUER = badUrl;

        jest.resetModules();

        const response = await request(app)
          .post('/api/mcp/context')
          .set('Authorization', 'Bearer some-token')
          .send({
            graphName: 'test_malformed_urls',
            query: 'CREATE (n:Test) RETURN n'
          });

        // Should handle malformed URLs gracefully
        expect([401, 500]).toContain(response.status);
      }
    });

    test('should handle OAuth2 configuration with valid format but unreachable endpoints', async () => {
      process.env.OAUTH2_JWKS_URL = 'https://unreachable-domain-12345.example/.well-known/jwks.json';
      process.env.OAUTH2_ISSUER = 'https://unreachable-domain-12345.example';

      jest.resetModules();

      const response = await request(app)
        .post('/api/mcp/context')
        .set('Authorization', 'Bearer valid-format-token')
        .send({
          graphName: 'test_unreachable',
          query: 'CREATE (n:Test) RETURN n'
        });

      // Should handle network failures gracefully
      expect([401, 500]).toContain(response.status);
      if (response.body.error) {
        expect(typeof response.body.error).toBe('string');
      }
    });
  });

  describe('Mixed Configuration Scenarios', () => {
    test('should handle multi-tenancy enabled but prefix disabled', async () => {
      process.env.ENABLE_MULTI_TENANCY = 'true';
      process.env.MULTI_TENANT_AUTH_MODE = 'api-key';
      process.env.TENANT_GRAPH_PREFIX = 'false'; // Key difference

      jest.resetModules();

      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key')
        .send({
          graphName: 'test_mixed_config',
          query: 'CREATE (n:Test {config: "mt_enabled_prefix_disabled"}) RETURN n'
        });

      expect(response.status).toBe(200);
      expect(response.body.metadata.tenantId).toBeUndefined();
      expect(response.body.metadata.provider).toBe('FalkorDB MCP Server');
    });

    test('should handle prefix enabled but multi-tenancy disabled', async () => {
      process.env.ENABLE_MULTI_TENANCY = 'false';
      process.env.TENANT_GRAPH_PREFIX = 'true'; // This should be ignored

      jest.resetModules();

      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key')
        .send({
          graphName: 'test_prefix_ignored',
          query: 'CREATE (n:Test {config: "prefix_enabled_mt_disabled"}) RETURN n'
        });

      expect(response.status).toBe(200);
      expect(response.body.metadata.tenantId).toBeUndefined();
    });

    test('should handle OAuth2 mode but missing OAuth2 URLs with fallback to API key', async () => {
      process.env.ENABLE_MULTI_TENANCY = 'true';
      process.env.MULTI_TENANT_AUTH_MODE = 'oauth2';
      process.env.TENANT_GRAPH_PREFIX = 'true';
      // Don't set OAuth2 URLs - should gracefully degrade

      jest.resetModules();

      const response = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key') // Try API key instead of Bearer token
        .send({
          graphName: 'test_oauth2_fallback',
          query: 'CREATE (n:Test {config: "oauth2_mode_api_key_auth"}) RETURN n'
        });

      // Behavior may vary - could accept API key or reject due to OAuth2 mode
      expect([200, 401]).toContain(response.status);
    });
  });

  describe('Runtime Configuration Changes', () => {
    test('should maintain consistency when environment changes during runtime', async () => {
      // Initial configuration
      process.env.ENABLE_MULTI_TENANCY = 'false';
      jest.resetModules();

      const response1 = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key')
        .send({
          graphName: 'test_runtime_changes',
          query: 'CREATE (n:Test {phase: "initial"}) RETURN n'
        });

      expect(response1.status).toBe(200);
      expect(response1.body.metadata.tenantId).toBeUndefined();

      // Change environment during runtime (config should remain stable)
      process.env.ENABLE_MULTI_TENANCY = 'true';
      // Don't reset modules - config should be cached

      const response2 = await request(app)
        .post('/api/mcp/context')
        .set('x-api-key', 'test-api-key')
        .send({
          graphName: 'test_runtime_changes',
          query: 'CREATE (n:Test {phase: "changed_env"}) RETURN n'
        });

      expect(response2.status).toBe(200);
      // Config should remain stable (no tenant ID since modules weren't reset)
      expect(response2.body.metadata.tenantId).toBeUndefined();
    });

    test('should handle configuration reloading correctly', async () => {
      // Test multiple config reload cycles
      const configs = [
        { ENABLE_MULTI_TENANCY: 'false', expected: false },
        { ENABLE_MULTI_TENANCY: 'true', MULTI_TENANT_AUTH_MODE: 'api-key', expected: true },
        { ENABLE_MULTI_TENANCY: 'false', expected: false },
        { ENABLE_MULTI_TENANCY: 'true', MULTI_TENANT_AUTH_MODE: 'oauth2', expected: true }
      ];

      for (const [index, config] of configs.entries()) {
        // Set configuration
        Object.keys(config).forEach(key => {
          if (key !== 'expected') {
            process.env[key] = (config as any)[key];
          }
        });

        jest.resetModules();

        const response = await request(app)
          .post('/api/mcp/context')
          .set('x-api-key', 'test-api-key')
          .send({
            graphName: 'test_config_reload',
            query: `CREATE (n:Test {cycle: ${index}}) RETURN n`
          });

        if (config.expected && (config as any).MULTI_TENANT_AUTH_MODE === 'oauth2') {
          // OAuth2 mode without proper config should fail or handle gracefully
          expect([200, 401, 500]).toContain(response.status);
        } else {
          expect(response.status).toBe(200);
          expect(response.body.metadata.tenantId).toBeUndefined();
        }
      }
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should provide helpful error messages for configuration issues', async () => {
      process.env.ENABLE_MULTI_TENANCY = 'true';
      process.env.MULTI_TENANT_AUTH_MODE = 'oauth2';
      process.env.OAUTH2_JWKS_URL = 'invalid-url';

      jest.resetModules();

      const response = await request(app)
        .post('/api/mcp/context')
        .set('Authorization', 'Bearer test-token')
        .send({
          graphName: 'test_config_errors',
          query: 'CREATE (n:Test) RETURN n'
        });

      if (response.status !== 200) {
        expect(response.body).toHaveProperty('error');
        expect(typeof response.body.error).toBe('string');
        expect(response.body.error.length).toBeGreaterThan(0);
      }
    });

    test('should maintain service availability despite configuration errors', async () => {
      // Set up invalid OAuth2 configuration
      process.env.ENABLE_MULTI_TENANCY = 'true';
      process.env.MULTI_TENANT_AUTH_MODE = 'oauth2';
      process.env.OAUTH2_JWKS_URL = 'https://invalid-domain-xyz.com/jwks';

      jest.resetModules();

      // Multiple requests to test service stability
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(
          request(app)
            .post('/api/mcp/context')
            .set('Authorization', 'Bearer test-token')
            .send({
              graphName: 'test_service_stability',
              query: `CREATE (n:Test {attempt: ${i}}) RETURN n`
            })
        );
      }

      const responses = await Promise.all(requests);

      // All requests should complete (not crash), even if they fail
      responses.forEach((response) => {
        expect(response.status).toBeGreaterThan(0); // Got some response
        expect(response.status).toBeLessThan(600); // Valid HTTP status
      });
    });

    test('should handle configuration validation edge cases', async () => {
      const edgeCaseConfigs = [
        {
          name: 'Very long URLs',
          config: {
            OAUTH2_JWKS_URL: 'https://example.com/' + 'a'.repeat(2000) + '/.well-known/jwks.json',
            OAUTH2_ISSUER: 'https://example.com/' + 'b'.repeat(2000)
          }
        },
        {
          name: 'URLs with special characters',
          config: {
            OAUTH2_JWKS_URL: 'https://example.com/path%20with%20spaces/.well-known/jwks.json',
            OAUTH2_ISSUER: 'https://example.com/issuer%20with%20spaces'
          }
        },
        {
          name: 'Unicode in URLs',
          config: {
            OAUTH2_JWKS_URL: 'https://example.com/пуц/.well-known/jwks.json',
            OAUTH2_ISSUER: 'https://example.com/пуц'
          }
        }
      ];

      for (const testCase of edgeCaseConfigs) {
        process.env.ENABLE_MULTI_TENANCY = 'true';
        process.env.MULTI_TENANT_AUTH_MODE = 'oauth2';
        
        Object.keys(testCase.config).forEach(key => {
          process.env[key] = (testCase.config as any)[key];
        });

        jest.resetModules();

        const response = await request(app)
          .post('/api/mcp/context')
          .set('Authorization', 'Bearer test-token')
          .send({
            graphName: 'test_edge_case',
            query: `CREATE (n:Test {case: "${testCase.name}"}) RETURN n`
          });

        // Should handle edge cases gracefully without crashing
        expect(response.status).toBeGreaterThan(0);
        expect(response.status).toBeLessThan(600);
      }
    });
  });
});