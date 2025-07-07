// Environment setup for integration tests
process.env.NODE_ENV = 'test';
process.env.FALKORDB_HOST = 'localhost';
process.env.FALKORDB_PORT = '6380';
process.env.FALKORDB_USERNAME = '';
process.env.FALKORDB_PASSWORD = '';
process.env.PORT = '3001';
process.env.MCP_API_KEY = 'test-api-key';

// Set multi-tenancy environment variables for tenant isolation tests
process.env.ENABLE_MULTI_TENANCY = 'true';
process.env.MULTI_TENANT_AUTH_MODE = 'oauth2';
process.env.TENANT_GRAPH_PREFIX = 'true';
process.env.OAUTH2_JWKS_URL = 'https://example.com/.well-known/jwks.json';
process.env.OAUTH2_ISSUER = 'https://example.com';

// Disable logging during tests (optional)
if (process.env.DISABLE_TEST_LOGS === 'true') {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
}