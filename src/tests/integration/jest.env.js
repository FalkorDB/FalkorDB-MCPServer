// Environment setup for integration tests
process.env.NODE_ENV = 'test';
process.env.FALKORDB_HOST = 'localhost';
process.env.FALKORDB_PORT = '6380';
process.env.FALKORDB_USERNAME = '';
process.env.FALKORDB_PASSWORD = '';
process.env.PORT = '3001';
process.env.MCP_API_KEY = 'test-api-key';

// Disable logging during tests (optional)
if (process.env.DISABLE_TEST_LOGS === 'true') {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
}