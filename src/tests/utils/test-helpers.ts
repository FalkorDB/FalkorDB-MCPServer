import { FalkorDB } from 'falkordb';

export interface TestConfig {
  falkorDB: {
    host: string;
    port: number;
    username?: string;
    password?: string;
  };
  server: {
    port: number;
    baseUrl: string;
  };
  apiKey: string;
}

export const testConfig: TestConfig = {
  falkorDB: {
    host: process.env.TEST_FALKORDB_HOST || 'localhost',
    port: parseInt(process.env.TEST_FALKORDB_PORT || '6380'),
    username: process.env.TEST_FALKORDB_USERNAME || '',
    password: process.env.TEST_FALKORDB_PASSWORD || '',
  },
  server: {
    port: parseInt(process.env.TEST_SERVER_PORT || '3001'),
    baseUrl: process.env.TEST_SERVER_URL || 'http://localhost:3001',
  },
  apiKey: process.env.TEST_MCP_API_KEY || 'test-api-key-12345',
};

export class TestDatabaseHelper {
  private client: FalkorDB | null = null;

  async connect(): Promise<FalkorDB> {
    if (this.client) {
      return this.client;
    }

    try {
      this.client = await FalkorDB.connect({
        socket: {
          host: testConfig.falkorDB.host,
          port: testConfig.falkorDB.port,
        },
        password: testConfig.falkorDB.password,
        username: testConfig.falkorDB.username,
      });

      // Test connection
      const connection = await this.client.connection;
      await connection.ping();
      
      return this.client;
    } catch (error) {
      console.error('Failed to connect to test FalkorDB:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  async createTestGraph(graphName: string): Promise<void> {
    const client = await this.connect();
    const graph = client.selectGraph(graphName);
    
    // Create a simple test node to initialize the graph
    await graph.query('CREATE (n:TestNode {id: 1, name: "test"})');
  }

  async deleteTestGraph(graphName: string): Promise<void> {
    const client = await this.connect();
    
    try {
      // Check if graph exists first
      const graphs = await client.list();
      if (!graphs.includes(graphName)) {
        console.log(`Graph ${graphName} does not exist, skipping deletion`);
        return;
      }
      
      // Delete the graph using the graph instance
      const graph = client.selectGraph(graphName);
      await graph.delete();
      console.log(`Successfully deleted graph ${graphName}`);
    } catch (error: any) {
      // Graph might not exist or be empty, that's okay for cleanup
      console.log(`Graph ${graphName} deletion skipped:`, error?.message || error);
    }
  }

  async clearAllTestGraphs(): Promise<void> {
    const client = await this.connect();
    
    try {
      const graphs = await client.list();
      const testGraphs = graphs.filter(name => name.startsWith('test_'));
      
      for (const graphName of testGraphs) {
        await this.deleteTestGraph(graphName);
      }
    } catch (error) {
      console.log('Error clearing test graphs:', error);
    }
  }

  async executeQuery(graphName: string, query: string, params?: Record<string, any>): Promise<any> {
    const client = await this.connect();
    const graph = client.selectGraph(graphName);
    return await graph.query(query, params);
  }
}

export const testDbHelper = new TestDatabaseHelper();

export function generateTestGraphName(testName: string): string {
  const timestamp = Date.now();
  const sanitized = testName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  return `test_${sanitized}_${timestamp}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitForDatabase(maxRetries: number = 10, delayMs: number = 1000): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await testDbHelper.connect();
      console.log('Test database is ready');
      return;
    } catch (error) {
      if (i === maxRetries - 1) {
        throw new Error(`Database not ready after ${maxRetries} attempts: ${(error as any)?.message || error}`);
      }
      console.log(`Waiting for database... attempt ${i + 1}/${maxRetries}`);
      await sleep(delayMs);
    }
  }
}