import { FalkorDB } from 'falkordb';
import { config } from '../config';

class FalkorDBService {
  private client: FalkorDB | null = null;
  private initPromise: Promise<void> | null = null;
  private retryCount: number = 0;
  private maxRetries: number = 5;

  constructor() {
    // Don't initialize immediately in constructor
    // Initialize lazily when first method is called
  }

  private ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.init();
    }
    return this.initPromise;
  }

  private async init() {
    try {
      // Add connection timeout
      const connectPromise = FalkorDB.connect({
        socket: {
          host: config.falkorDB.host,
          port: config.falkorDB.port,
        },
        password: config.falkorDB.password,
        username: config.falkorDB.username,
      });
      
      // Apply timeout to connection
      this.client = await this.withTimeout(connectPromise, 10000, 'Connection timeout');
      
      // Test connection with timeout
      const connection = await this.client.connection;
      await this.withTimeout(connection.ping(), 5000, 'Ping timeout');
      console.log('Successfully connected to FalkorDB');
    } catch (error) {
      console.error('Failed to connect to FalkorDB:', error);
      this.client = null;
      this.initPromise = null;
      
      // Retry connection after a delay with exponential backoff
      const retryDelay = Math.min(5000 * Math.pow(2, this.getRetryCount()), 30000);
      setTimeout(() => this.init(), retryDelay);
      throw error;
    }
  }

  private escapeValue(value: any): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value === 'string') {
      // Escape quotes and special characters for Cypher
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      // FalkorDB only supports arrays of primitives
      const primitiveValues = value.map(v => {
        if (typeof v === 'object' && v !== null) {
          return JSON.stringify(v); // Convert objects to JSON strings
        }
        return v;
      });
      return `[${primitiveValues.map(v => this.escapeValue(v)).join(', ')}]`;
    }
    if (typeof value === 'object') {
      // FalkorDB doesn't support nested objects as property values
      // Convert to JSON string instead
      return this.escapeValue(JSON.stringify(value));
    }
    return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  private substituteParameters(query: string, params?: Record<string, any>): string {
    if (!params) {
      return query;
    }

    let substitutedQuery = query;
    for (const [key, value] of Object.entries(params)) {
      const escapedValue = this.escapeValue(value);
      substitutedQuery = substitutedQuery.replace(new RegExp(`\\$${key}\\b`, 'g'), escapedValue);
    }
    return substitutedQuery;
  }

  async executeQuery(graphName: string, query: string, params?: Record<string, any>, tenantId?: string): Promise<any> {
    await this.ensureInitialized();
    if (!this.client) {
      throw new Error('FalkorDB client not initialized');
    }
    
    try {
      // Import here to avoid circular dependency
      const { TenantGraphService } = await import('./tenant-graph.service');
      const resolvedGraphName = TenantGraphService.resolveGraphName(graphName, tenantId);
      
      const graph = this.client.selectGraph(resolvedGraphName);
      
      // WORKAROUND: FalkorDB parameter binding is broken, use safe string substitution
      const finalQuery = this.substituteParameters(query, params);
      
      // Execute query with timeout
      const result = await this.withTimeout(
        graph.query(finalQuery),
        30000,
        'Query execution timeout'
      );
      
      // Reset retry count on successful operation
      this.retryCount = 0;
      
      return result;
    } catch (error) {
      const sanitizedGraphName = graphName.replace(/\n|\r/g, "");
      console.error('Error executing FalkorDB query on graph %s:', sanitizedGraphName, error);
      
      // Handle connection errors by resetting client
      if (this.isConnectionError(error)) {
        console.log('Connection error detected, resetting client');
        this.client = null;
        this.initPromise = null;
      }
      
      throw error;
    }
  }

  /**
   * Lists all available graphs in FalkorDB
   * @param tenantId - Optional tenant identifier for filtering
   * @returns Array of graph names (filtered for tenant if provided)
   */
  async listGraphs(tenantId?: string): Promise<string[]> {
    await this.ensureInitialized();
    if (!this.client) {
      throw new Error('FalkorDB client not initialized');
    }

    try {
      // Get all graphs from FalkorDB with timeout
      const allGraphs = await this.withTimeout(
        this.client.list(),
        10000,
        'List graphs timeout'
      );
      
      // Import here to avoid circular dependency
      const { TenantGraphService } = await import('./tenant-graph.service');
      
      // Filter graphs based on tenant context
      return TenantGraphService.filterGraphsForTenant(allGraphs, tenantId);
    } catch (error) {
      console.error('Error listing FalkorDB graphs:', error);
      
      // Handle connection errors by resetting client
      if (this.isConnectionError(error)) {
        console.log('Connection error detected, resetting client');
        this.client = null;
        this.initPromise = null;
      }
      
      throw error;
    }
  }

  async close() {
    if (this.client) {
      try {
        await this.withTimeout(this.client.close(), 5000, 'Close connection timeout');
      } catch (error) {
        console.error('Error closing FalkorDB connection:', error);
      } finally {
        this.client = null;
        this.initPromise = null;
        this.retryCount = 0;
      }
    }
  }
  
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });
    
    return Promise.race([promise, timeoutPromise]);
  }
  
  private isConnectionError(error: any): boolean {
    if (!error || !error.message) return false;
    
    const errorMsg = error.message.toLowerCase();
    return errorMsg.includes('connection') || 
           errorMsg.includes('timeout') || 
           errorMsg.includes('network') ||
           errorMsg.includes('econnrefused') ||
           errorMsg.includes('enotfound') ||
           errorMsg.includes('closed');
  }
  
  private getRetryCount(): number {
    return this.retryCount++;
  }
  
  async healthCheck(): Promise<{ connected: boolean; latency?: number }> {
    try {
      await this.ensureInitialized();
      if (!this.client) {
        return { connected: false };
      }
      
      const startTime = Date.now();
      const connection = await this.client.connection;
      await this.withTimeout(connection.ping(), 5000, 'Health check timeout');
      const latency = Date.now() - startTime;
      
      return { connected: true, latency };
    } catch (error) {
      console.error('Health check failed:', error);
      return { connected: false };
    }
  }
}

// Export a singleton instance
export const falkorDBService = new FalkorDBService();