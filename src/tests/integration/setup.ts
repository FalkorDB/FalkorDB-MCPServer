import { testDbHelper, waitForDatabase } from '../utils/test-helpers';

// Global setup for integration tests
export async function setupIntegrationTests(): Promise<void> {
  console.log('Setting up integration tests...');
  
  try {
    // Wait for test database to be ready
    await waitForDatabase();
    
    // Clear any existing test data
    await testDbHelper.clearAllTestGraphs();
    
    console.log('Integration test setup completed successfully');
  } catch (error) {
    console.error('Integration test setup failed:', error);
    throw error;
  }
}

// Global teardown for integration tests
export async function teardownIntegrationTests(): Promise<void> {
  console.log('Tearing down integration tests...');
  
  try {
    // Clean up all test graphs
    await testDbHelper.clearAllTestGraphs();
    
    // Disconnect from database
    await testDbHelper.disconnect();
    
    console.log('Integration test teardown completed successfully');
  } catch (error) {
    console.error('Integration test teardown failed:', error);
    // Don't throw here to avoid masking test failures
  }
}

// Setup and teardown hooks for Jest
beforeAll(async () => {
  await setupIntegrationTests();
}, 30000); // 30 second timeout for setup

afterAll(async () => {
  await teardownIntegrationTests();
}, 10000); // 10 second timeout for teardown