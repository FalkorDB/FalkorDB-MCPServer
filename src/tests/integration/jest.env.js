// Environment setup for integration tests
process.env.NODE_ENV = 'test';
process.env.TEST_FALKORDB_HOST = 'localhost';
process.env.TEST_FALKORDB_PORT = '6380';
process.env.TEST_FALKORDB_USERNAME = '';
process.env.TEST_FALKORDB_PASSWORD = '';
process.env.TEST_SERVER_PORT = '3001';
process.env.TEST_SERVER_URL = 'http://localhost:3001';
process.env.TEST_MCP_API_KEY = 'test-api-key-12345';

// Disable logging during tests (optional)
if (process.env.DISABLE_TEST_LOGS === 'true') {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
}