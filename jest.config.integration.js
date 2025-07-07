/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  displayName: 'Integration Tests',
  
  // Test file patterns - only integration tests
  testMatch: [
    '<rootDir>/src/tests/integration/**/*.test.ts',
    '<rootDir>/src/tests/integration/**/*.integration.test.ts'
  ],
  
  // Transform configuration
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Coverage collection (separate from unit tests)
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/tests/**/*',
  ],
  coverageDirectory: 'coverage/integration',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Test environment setup
  setupFilesAfterEnv: ['<rootDir>/src/tests/integration/setup.ts'],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/src/tests/integration/setup.ts'
  ],
  
  // Longer timeouts for integration tests
  testTimeout: 30000,
  
  // Environment variables for integration tests
  setupFiles: ['<rootDir>/src/tests/integration/jest.env.js'],
  
  // Verbose output for debugging
  verbose: true,
  
  // Detect open handles (useful for integration tests)
  detectOpenHandles: true,
  
  // Force exit after tests (important for database connections)
  forceExit: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Global test configuration
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
};