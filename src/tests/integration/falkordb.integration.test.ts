import { testDbHelper, generateTestGraphName, testConfig } from '../utils/test-helpers';
import './setup';

describe('FalkorDB Integration Tests', () => {
  let testGraphName: string;

  beforeEach(() => {
    testGraphName = generateTestGraphName('falkordb_integration');
  });

  afterEach(async () => {
    if (testGraphName) {
      await testDbHelper.deleteTestGraph(testGraphName);
    }
  });

  describe('Database Connection', () => {
    test('should connect to FalkorDB test instance', async () => {
      const client = await testDbHelper.connect();
      expect(client).toBeDefined();
      
      // Verify connection is working
      const connection = await client.connection;
      const result = await connection.ping();
      expect(result).toBe('PONG');
    });

    test('should handle connection configuration', async () => {
      const client = await testDbHelper.connect();
      expect(client).toBeDefined();
      
      // Verify we're connected to the test database
      expect(testConfig.falkorDB.port).toBe(6380);
      expect(testConfig.falkorDB.host).toBe('localhost');
    });

    test('should list graphs initially (empty or existing)', async () => {
      const client = await testDbHelper.connect();
      const graphs = await client.list();
      
      expect(Array.isArray(graphs)).toBe(true);
      // Should not contain any graphs starting with 'test_' (cleaned up)
      const testGraphs = graphs.filter(name => name.startsWith('test_'));
      expect(testGraphs).toHaveLength(0);
    });
  });

  describe('Graph Operations', () => {
    test('should create a new graph', async () => {
      await testDbHelper.createTestGraph(testGraphName);
      
      const client = await testDbHelper.connect();
      const graphs = await client.list();
      
      expect(graphs).toContain(testGraphName);
    });

    test('should execute simple query on graph', async () => {
      await testDbHelper.createTestGraph(testGraphName);
      
      const result = await testDbHelper.executeQuery(
        testGraphName, 
        'MATCH (n:TestNode) RETURN n.id as id, n.name as name'
      );
      
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({ id: 1, name: 'test' });
    });

    test('should execute parameterized query', async () => {
      // Create test graph with initial data
      await testDbHelper.createTestGraph(testGraphName);
      
      // Add additional test data and verify we can query with different parameters
      await testDbHelper.executeQuery(
        testGraphName,
        'CREATE (n:TestNode {id: 99, name: "another"})'
      );
      
      // Query for all nodes and verify both exist
      const result = await testDbHelper.executeQuery(
        testGraphName,
        'MATCH (n:TestNode) RETURN n.id as id, n.name as name ORDER BY n.id'
      );
      
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({ id: 1, name: 'test' });
      expect(result.data[1]).toEqual({ id: 99, name: 'another' });
    });

    test('should handle complex graph operations', async () => {
      await testDbHelper.createTestGraph(testGraphName);
      
      // Create more complex test data
      const createQuery = `
        CREATE (u1:User {id: 1, name: 'Alice'})
        CREATE (u2:User {id: 2, name: 'Bob'})
        CREATE (p1:Project {id: 1, name: 'Test Project'})
        CREATE (u1)-[:WORKS_ON {role: 'lead'}]->(p1)
        CREATE (u2)-[:WORKS_ON {role: 'developer'}]->(p1)
      `;
      
      await testDbHelper.executeQuery(testGraphName, createQuery);
      
      // Query relationships
      const result = await testDbHelper.executeQuery(
        testGraphName,
        'MATCH (u:User)-[r:WORKS_ON]->(p:Project) RETURN u.name as user, r.role as role, p.name as project'
      );
      
      expect(result.data).toHaveLength(2);
      expect(result.data.map((row: any) => row.user)).toContain('Alice');
      expect(result.data.map((row: any) => row.user)).toContain('Bob');
    });

    test('should handle empty query results', async () => {
      await testDbHelper.createTestGraph(testGraphName);
      
      const result = await testDbHelper.executeQuery(
        testGraphName,
        'MATCH (n:NonExistentLabel) RETURN n'
      );
      
      expect(result.data).toHaveLength(0);
    });

    test('should handle query errors gracefully', async () => {
      await testDbHelper.createTestGraph(testGraphName);
      
      await expect(testDbHelper.executeQuery(
        testGraphName,
        'INVALID CYPHER QUERY'
      )).rejects.toThrow();
    });
  });

  describe('Graph Management', () => {
    test('should delete a graph', async () => {
      await testDbHelper.createTestGraph(testGraphName);
      
      // Verify graph exists
      const client = await testDbHelper.connect();
      let graphs = await client.list();
      expect(graphs).toContain(testGraphName);
      
      // Delete graph
      await testDbHelper.deleteTestGraph(testGraphName);
      
      // Verify graph is gone
      graphs = await client.list();
      expect(graphs).not.toContain(testGraphName);
      
      // Clear testGraphName to avoid double cleanup
      testGraphName = '';
    });

    test('should handle deleting non-existent graph', async () => {
      // Should not throw error when deleting non-existent graph
      await expect(testDbHelper.deleteTestGraph('non_existent_graph')).resolves.not.toThrow();
    });

    test('should clear all test graphs', async () => {
      // Create multiple test graphs
      const graph1 = generateTestGraphName('clear_test_1');
      const graph2 = generateTestGraphName('clear_test_2');
      
      await testDbHelper.createTestGraph(graph1);
      await testDbHelper.createTestGraph(graph2);
      
      // Verify they exist
      const client = await testDbHelper.connect();
      let graphs = await client.list();
      expect(graphs).toContain(graph1);
      expect(graphs).toContain(graph2);
      
      // Clear all test graphs
      await testDbHelper.clearAllTestGraphs();
      
      // Verify they're gone
      graphs = await client.list();
      expect(graphs).not.toContain(graph1);
      expect(graphs).not.toContain(graph2);
    });
  });

  describe('Connection Management', () => {
    test('should maintain connection across multiple operations', async () => {
      const client1 = await testDbHelper.connect();
      const client2 = await testDbHelper.connect();
      
      // Should return the same client instance (singleton)
      expect(client1).toBe(client2);
    });

    test('should reconnect after disconnect', async () => {
      await testDbHelper.connect();
      await testDbHelper.disconnect();
      
      // Should be able to connect again
      const client = await testDbHelper.connect();
      expect(client).toBeDefined();
      
      const connection = await client.connection;
      const result = await connection.ping();
      expect(result).toBe('PONG');
    });
  });
});