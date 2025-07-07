import { FalkorDB } from 'falkordb';
import { testConfig } from './test-helpers';

class TestFalkorDBService {
  private client: FalkorDB | null = null;
  private isClosing: boolean = false;

  constructor() {
    this.init();
  }

  private async init() {
    if (this.isClosing) {
      return; // Don't initialize if we're in the process of closing
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
      
      // Only log if we're not closing
      if (!this.isClosing) {
        console.log('Successfully connected to Test FalkorDB');
      }
    } catch (error) {
      if (!this.isClosing) {
        console.error('Failed to connect to Test FalkorDB:', error);
        // Retry connection after a delay
        setTimeout(() => this.init(), 5000);
      }
    }
  }

  async executeQuery(graphName: string, query: string, params?: Record<string, any>): Promise<any> {
    if (!this.client) {
      throw new Error('Test FalkorDB client not initialized');
    }
    
    try {
      const graph = this.client.selectGraph(graphName);
      const result = await graph.query(query, params);
      return result;
    } catch (error) {
      const sanitizedGraphName = graphName.replace(/\n|\r/g, "");
      console.error('Error executing Test FalkorDB query on graph %s:', sanitizedGraphName, error);
      throw error;
    }
  }

  async listGraphs(): Promise<string[]> {
    if (!this.client) {
      throw new Error('Test FalkorDB client not initialized');
    }

    try {
      return await this.client.list();
    } catch (error) {
      console.error('Error listing Test FalkorDB graphs:', error);
      throw error;
    }
  }

  async close() {
    this.isClosing = true;
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        // Ignore close errors
      }
      this.client = null;
    }
  }
}

export const testFalkorDBService = new TestFalkorDBService();