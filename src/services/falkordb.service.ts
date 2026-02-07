import { FalkorDB } from 'falkordb';
import { config } from '../config';

class FalkorDBService {
  private client: FalkorDB | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    try {
      this.client = await FalkorDB.connect({
        socket: {
          host: config.falkorDB.host,
          port: config.falkorDB.port,
        },
        password: config.falkorDB.password,
        username: config.falkorDB.username,
      });
      
      // Test connection
      const connection = await this.client.connection;
      await connection.ping();
      console.error('Successfully connected to FalkorDB');
    } catch (error) {
      console.error('Failed to connect to FalkorDB:', error);
      // Retry connection after a delay
      setTimeout(() => this.init(), 5000);
    }
  }

  async executeQuery(graphName: string, query: string, params?: Record<string, any>): Promise<any> {
    if (!this.client) {
      throw new Error('FalkorDB client not initialized');
    }
    
    try {
      const graph = this.client.selectGraph(graphName);
      const result = await graph.query(query, params);
      return result;
    } catch (error) {
      const sanitizedGraphName = graphName.replace(/\n|\r/g, "");
      console.error('Error executing FalkorDB query on graph %s:', sanitizedGraphName, error);
      throw error;
    }
  }

  /**
   * Lists all available graphs in FalkorDB
   * @returns Array of graph names
   */
  async listGraphs(): Promise<string[]> {
    if (!this.client) {
      throw new Error('FalkorDB client not initialized');
    }

    try {
      // Using the simplified list method which always returns an array
      return await this.client.list();
    } catch (error) {
      console.error('Error listing FalkorDB graphs:', error);
      throw error;
    }
  }

  async close() {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}

// Export a singleton instance
export const falkorDBService = new FalkorDBService();
