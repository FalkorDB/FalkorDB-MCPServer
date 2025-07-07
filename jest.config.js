/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    displayName: 'Unit Tests',
    
    // Transform configuration
    transform: {
      '^.+\\.tsx?$': 'ts-jest',
    },
    
    // Only run unit tests (exclude integration tests)
    testRegex: '(\\.|/)(test|spec)\\.tsx?$',
    testPathIgnorePatterns: [
      '/node_modules/', 
      '/dist/',
      '/src/tests/integration/'  // Exclude integration tests
    ],
    
    // Module file extensions
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    
    // Coverage collection for unit tests only
    collectCoverageFrom: [
      'src/**/*.ts',
      '!src/**/*.d.ts',
      '!src/**/*.test.ts',
      '!src/**/*.spec.ts',
      '!src/tests/**/*',  // Exclude test utilities from coverage
    ],
    coverageDirectory: 'coverage/unit',
    coverageReporters: ['text', 'lcov', 'html'],
    
    // Standard timeout for unit tests
    testTimeout: 10000,
    
    // Clear mocks between tests
    clearMocks: true,
    
    // Global test configuration
    globals: {
      'ts-jest': {
        tsconfig: 'tsconfig.json',
      },
    },
  };