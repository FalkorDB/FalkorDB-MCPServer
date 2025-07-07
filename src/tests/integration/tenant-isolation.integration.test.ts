import request from 'supertest';
import express from 'express';
import { mcpController } from '../../controllers/mcp.controller';
import { testDbHelper, generateTestGraphName } from '../utils/test-helpers';

// Mock the auth middleware to support tenant testing
const mockAuthMiddleware = jest.fn();
jest.mock('../../middleware/auth.middleware', () => ({
  authenticateMCP: mockAuthMiddleware
}));

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/mcp', mockAuthMiddleware);

app.post('/api/mcp/context', mcpController.processContextRequest.bind(mcpController));
app.get('/api/mcp/graphs', mcpController.listGraphs.bind(mcpController));

describe('Tenant Isolation Integration Tests', () => {
  // Get the mocked bearer middleware
  const { bearerMiddleware } = require('../../middleware/bearer.middleware');

  beforeAll(async () => {
    await testDbHelper.connect();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up mock auth middleware to simulate Bearer token behavior
    mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
      // Default behavior - will be overridden per test
      next();
    });
  });

  afterEach(async () => {
    await testDbHelper.clearAllTestGraphs();
  });

  describe('Real Data Isolation Verification', () => {
    test('should completely isolate tenant data with real graph operations', async () => {
      // Setup: Create tenant-specific graphs with real data
      await testDbHelper.createTestGraph('tenant1_customer_data');
      await testDbHelper.createTestGraph('tenant2_customer_data');
      await testDbHelper.createTestGraph('shared_public_data');

      // Add real data to each tenant's graph
      await testDbHelper.executeQuery(
        'tenant1_customer_data',
        'CREATE (c:Customer {id: 1, name: "Tenant1 Customer", email: "user@tenant1.com", ssn: "123-45-6789"})'
      );

      await testDbHelper.executeQuery(
        'tenant2_customer_data', 
        'CREATE (c:Customer {id: 1, name: "Tenant2 Customer", email: "user@tenant2.com", ssn: "987-65-4321"})'
      );

      await testDbHelper.executeQuery(
        'shared_public_data',
        'CREATE (p:PublicData {id: 1, info: "This is shared public information"})'
      );


      // Test Tenant 1 access
      mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
        req.tenantId = 'tenant1';
        next();
      });

      const tenant1Response = await request(app)
        .post('/api/mcp/context')
        .set('Authorization', 'Bearer tenant1-jwt')
        .send({
          graphName: 'customer_data',
          query: 'MATCH (c:Customer) RETURN c.name, c.email, c.ssn'
        });

      expect(tenant1Response.status).toBe(200);
      expect(tenant1Response.body.metadata.tenantId).toBe('tenant1');
      
      // Should only return tenant1's data
      const tenant1Data = tenant1Response.body.data;
      expect(JSON.stringify(tenant1Data)).toContain('Tenant1 Customer');
      expect(JSON.stringify(tenant1Data)).toContain('user@tenant1.com');
      expect(JSON.stringify(tenant1Data)).not.toContain('Tenant2 Customer');
      expect(JSON.stringify(tenant1Data)).not.toContain('user@tenant2.com');

      // Test Tenant 2 access
      mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
        req.tenantId = 'tenant2';
        next();
      });

      const tenant2Response = await request(app)
        .post('/api/mcp/context')
        .set('Authorization', 'Bearer tenant2-jwt')
        .send({
          graphName: 'customer_data',
          query: 'MATCH (c:Customer) RETURN c.name, c.email, c.ssn'
        });

      expect(tenant2Response.status).toBe(200);
      expect(tenant2Response.body.metadata.tenantId).toBe('tenant2');
      
      // Should only return tenant2's data
      const tenant2Data = tenant2Response.body.data;
      expect(JSON.stringify(tenant2Data)).toContain('Tenant2 Customer');
      expect(JSON.stringify(tenant2Data)).toContain('user@tenant2.com');
      expect(JSON.stringify(tenant2Data)).not.toContain('Tenant1 Customer');
      expect(JSON.stringify(tenant2Data)).not.toContain('user@tenant1.com');
    });

    test('should prevent cross-tenant data access attempts', async () => {
      // Setup: Create graphs for different tenants
      await testDbHelper.createTestGraph('tenant1_sensitive');
      await testDbHelper.createTestGraph('tenant2_sensitive');
      
      // Add sensitive data
      await testDbHelper.executeQuery(
        'tenant1_sensitive',
        'CREATE (s:Secret {data: "Tenant1 Secret Data", classified: true})'
      );

      await testDbHelper.executeQuery(
        'tenant2_sensitive',
        'CREATE (s:Secret {data: "Tenant2 Secret Data", classified: true})'
      );

      // Tenant 1 tries to access their own data (should succeed)
      mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
        req.tenantId = 'tenant1';
        next();
      });

      const validAccess = await request(app)
        .post('/api/mcp/context')
        .set('Authorization', 'Bearer tenant1-jwt')
        .send({
          graphName: 'sensitive',
          query: 'MATCH (s:Secret) RETURN s.data'
        });

      expect(validAccess.status).toBe(200);
      expect(JSON.stringify(validAccess.body.data)).toContain('Tenant1 Secret Data');

      // Tenant 1 tries to access non-existent graph that would be tenant2's data
      // (This should fail because tenant2_sensitive doesn't resolve to tenant1_sensitive)
      const crossTenantAttempt = await request(app)
        .post('/api/mcp/context')
        .set('Authorization', 'Bearer tenant1-jwt')
        .send({
          graphName: 'sensitive', // This resolves to tenant1_sensitive, not tenant2_sensitive
          query: 'MATCH (s:Secret {data: "Tenant2 Secret Data"}) RETURN s'
        });

      expect(crossTenantAttempt.status).toBe(200);
      // Should return empty results because tenant2's data doesn't exist in tenant1's graph
      const resultData = crossTenantAttempt.body.data;
      expect(!resultData || !resultData.records || resultData.records.length === 0).toBe(true);
    });

    test('should isolate graph listings by tenant', async () => {
      // Setup: Create multiple graphs for different tenants
      await testDbHelper.createTestGraph('tenant1_users');
      await testDbHelper.createTestGraph('tenant1_orders');
      await testDbHelper.createTestGraph('tenant1_products');
      await testDbHelper.createTestGraph('tenant2_users');
      await testDbHelper.createTestGraph('tenant2_orders');
      await testDbHelper.createTestGraph('shared_config');

      // Test Tenant 1 graph listing
      mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
        req.tenantId = 'tenant1';
        next();
      });

      const tenant1Graphs = await request(app)
        .get('/api/mcp/graphs')
        .set('Authorization', 'Bearer tenant1-jwt');

      expect(tenant1Graphs.status).toBe(200);
      expect(tenant1Graphs.body.metadata.tenantId).toBe('tenant1');

      const tenant1GraphNames = tenant1Graphs.body.data.map((g: any) => g.name);
      expect(tenant1GraphNames).toContain('users');
      expect(tenant1GraphNames).toContain('orders');
      expect(tenant1GraphNames).toContain('products');
      expect(tenant1GraphNames).not.toContain('tenant2_users');
      expect(tenant1GraphNames).not.toContain('tenant2_orders');

      // Test Tenant 2 graph listing
      mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
        req.tenantId = 'tenant2';
        next();
      });

      const tenant2Graphs = await request(app)
        .get('/api/mcp/graphs')
        .set('Authorization', 'Bearer tenant2-jwt');

      expect(tenant2Graphs.status).toBe(200);
      expect(tenant2Graphs.body.metadata.tenantId).toBe('tenant2');

      const tenant2GraphNames = tenant2Graphs.body.data.map((g: any) => g.name);
      expect(tenant2GraphNames).toContain('users');
      expect(tenant2GraphNames).toContain('orders');
      expect(tenant2GraphNames).not.toContain('products'); // Only tenant1 has products
      expect(tenant2GraphNames).not.toContain('tenant1_users');
      expect(tenant2GraphNames).not.toContain('tenant1_orders');
    });

    test.skip('should handle concurrent tenant operations without interference', async () => {
      // Setup: Ensure clean state and create graphs for concurrent testing
      await testDbHelper.clearAllTestGraphs();
      await testDbHelper.createTestGraph('tenant1_concurrent');
      await testDbHelper.createTestGraph('tenant2_concurrent');

      // Set up dynamic mock that determines tenant from Authorization header
      mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
        const authHeader = req.headers.authorization;
        if (authHeader === 'Bearer tenant1-jwt') {
          req.tenantId = 'tenant1';
        } else if (authHeader === 'Bearer tenant2-jwt') {
          req.tenantId = 'tenant2';
        }
        next();
      });

      const concurrentOperations = [];

      // Simulate concurrent operations from different tenants
      for (let i = 0; i < 5; i++) {
        // Tenant 1 operations
        concurrentOperations.push(
          request(app)
            .post('/api/mcp/context')
            .set('Authorization', 'Bearer tenant1-jwt')
            .send({
              graphName: 'concurrent',
              query: `CREATE (n:ConcurrentTest {tenant: "tenant1", iteration: ${i}, timestamp: timestamp()}) RETURN n`
            })
        );

        // Tenant 2 operations
        concurrentOperations.push(
          request(app)
            .post('/api/mcp/context')
            .set('Authorization', 'Bearer tenant2-jwt')
            .send({
              graphName: 'concurrent',
              query: `CREATE (n:ConcurrentTest {tenant: "tenant2", iteration: ${i}, timestamp: timestamp()}) RETURN n`
            })
        );
      }

      // Execute all operations concurrently
      const results = await Promise.all(concurrentOperations);


      // Verify all operations succeeded
      results.forEach((result, index) => {
        expect(result.status).toBe(200);
        const expectedTenant = index % 2 === 0 ? 'tenant1' : 'tenant2';
        expect(result.body.metadata.tenantId).toBe(expectedTenant);
      });

      // Verify data isolation - check each tenant only sees their own data

      // (mock is already set up to handle tenant1-jwt → tenant1)
      const tenant1Data = await request(app)
        .post('/api/mcp/context')
        .set('Authorization', 'Bearer tenant1-jwt')
        .send({
          graphName: 'concurrent',
          query: 'MATCH (n:ConcurrentTest) RETURN n.tenant, count(*) as count'
        });

      expect(tenant1Data.status).toBe(200);
      // Should only see tenant1 data
      const tenant1Results = JSON.stringify(tenant1Data.body.data);
      expect(tenant1Results).toContain('tenant1');
      expect(tenant1Results).not.toContain('tenant2');

      // (mock is already set up to handle tenant2-jwt → tenant2)

      const tenant2Data = await request(app)
        .post('/api/mcp/context')
        .set('Authorization', 'Bearer tenant2-jwt')
        .send({
          graphName: 'concurrent',
          query: 'MATCH (n:ConcurrentTest) RETURN n.tenant, count(*) as count'
        });

      expect(tenant2Data.status).toBe(200);
      // Should only see tenant2 data
      const tenant2Results = JSON.stringify(tenant2Data.body.data);
      expect(tenant2Results).toContain('tenant2');
      expect(tenant2Results).not.toContain('tenant1');
    });

    test('should handle tenant-specific data modifications without cross-contamination', async () => {
      // Setup: Create identical graph structures for different tenants
      await testDbHelper.createTestGraph('tenant1_inventory');
      await testDbHelper.createTestGraph('tenant2_inventory');

      // Initialize with identical data
      const initData = [
        'CREATE (p:Product {id: 1, name: "Widget", price: 10.00, stock: 100})',
        'CREATE (p:Product {id: 2, name: "Gadget", price: 25.00, stock: 50})',
        'CREATE (c:Category {name: "Electronics"})',
        'MATCH (p:Product), (c:Category) CREATE (p)-[:BELONGS_TO]->(c)'
      ];

      for (const query of initData) {
        await testDbHelper.executeQuery('tenant1_inventory', query);
        await testDbHelper.executeQuery('tenant2_inventory', query);
      }

      // Tenant 1 modifies their data
      mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
        req.tenantId = 'tenant1';
        next();
      });

      await request(app)
        .post('/api/mcp/context')
        .set('Authorization', 'Bearer tenant1-jwt')
        .send({
          graphName: 'inventory',
          query: 'MATCH (p:Product {id: 1}) SET p.price = 15.00, p.stock = 75'
        });

      // Tenant 2 modifies their data differently
      mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
        req.tenantId = 'tenant2';
        next();
      });

      await request(app)
        .post('/api/mcp/context')
        .set('Authorization', 'Bearer tenant2-jwt')
        .send({
          graphName: 'inventory',
          query: 'MATCH (p:Product {id: 1}) SET p.price = 12.00, p.stock = 90'
        });

      // Verify Tenant 1's changes
      mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
        req.tenantId = 'tenant1';
        next();
      });

      const tenant1Check = await request(app)
        .post('/api/mcp/context')
        .set('Authorization', 'Bearer tenant1-jwt')
        .send({
          graphName: 'inventory',
          query: 'MATCH (p:Product {id: 1}) RETURN p.price, p.stock'
        });

      expect(tenant1Check.status).toBe(200);
      const tenant1Product = JSON.stringify(tenant1Check.body.data);
      expect(tenant1Product).toContain('15'); // Price should be 15.00
      expect(tenant1Product).toContain('75'); // Stock should be 75

      // Verify Tenant 2's changes (should be different)
      mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
        req.tenantId = 'tenant2';
        next();
      });

      const tenant2Check = await request(app)
        .post('/api/mcp/context')
        .set('Authorization', 'Bearer tenant2-jwt')
        .send({
          graphName: 'inventory',
          query: 'MATCH (p:Product {id: 1}) RETURN p.price, p.stock'
        });

      expect(tenant2Check.status).toBe(200);
      const tenant2Product = JSON.stringify(tenant2Check.body.data);
      expect(tenant2Product).toContain('12'); // Price should be 12.00
      expect(tenant2Product).toContain('90'); // Stock should be 90

      // Verify complete isolation - tenant1 shouldn't see tenant2's changes
      expect(tenant1Product).not.toContain('12'); // Shouldn't see tenant2's price
      expect(tenant1Product).not.toContain('90'); // Shouldn't see tenant2's stock
      expect(tenant2Product).not.toContain('15'); // Shouldn't see tenant1's price
      expect(tenant2Product).not.toContain('75'); // Shouldn't see tenant1's stock
    });
  });

  describe('Edge Cases and Security', () => {
    test('should reject attempts to access other tenant graphs via naming manipulation', async () => {
      // Setup: Create graphs that might be targeted
      await testDbHelper.createTestGraph('tenant1_secrets');
      await testDbHelper.createTestGraph('tenant2_secrets');
      
      await testDbHelper.executeQuery('tenant1_secrets', 'CREATE (s:Secret {value: "Tenant1 Secret"})');
      await testDbHelper.executeQuery('tenant2_secrets', 'CREATE (s:Secret {value: "Tenant2 Secret"})');

      // Tenant 1 tries various graph name manipulations
      mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
        req.tenantId = 'tenant1';
        next();
      });

      const maliciousAttempts = [
        'tenant2_secrets', // Direct attempt to access other tenant
        '../tenant2_secrets', // Path traversal attempt
        'tenant1_secrets', // Prefixed name (should be double-prefixed to tenant1_tenant1_secrets)
        'secrets/../tenant2_secrets', // Complex path manipulation
      ];

      for (const maliciousGraphName of maliciousAttempts) {
        const response = await request(app)
          .post('/api/mcp/context')
          .set('Authorization', 'Bearer tenant1-jwt')
          .send({
            graphName: maliciousGraphName,
            query: 'MATCH (s:Secret) RETURN s.value'
          });

        // Should either fail or return empty results (never tenant2's data)
        if (response.status === 200) {
          const responseData = JSON.stringify(response.body.data);
          expect(responseData).not.toContain('Tenant2 Secret');
        }
        
        expect(response.body.metadata.tenantId).toBe('tenant1');
      }
    });

    test('should handle empty tenant IDs gracefully', async () => {
      mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
        req.tenantId = ''; // Empty tenant ID
        next();
      });

      const response = await request(app)
        .post('/api/mcp/context')
        .set('Authorization', 'Bearer empty-tenant-jwt')
        .send({
          graphName: 'test',
          query: 'MATCH (n) RETURN count(n)'
        });

      expect(response.status).toBe(200);
      expect(response.body.metadata.tenantId).toBe('');
      // Should behave like no tenant (no prefix applied)
    });

    test('should handle special characters in tenant IDs safely', async () => {
      const specialTenantIds = [
        'tenant-with-dashes',
        'tenant.with.dots',
        'tenant_with_underscores',
        'TENANT_UPPERCASE',
        'tenant123numbers'
      ];

      for (const tenantId of specialTenantIds) {
        mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
          req.tenantId = tenantId;
          next();
        });

        const response = await request(app)
          .post('/api/mcp/context')
          .set('Authorization', 'Bearer special-tenant-jwt')
          .send({
            graphName: 'test',
            query: 'MATCH (n) RETURN count(n)'
          });

        expect(response.status).toBe(200);
        expect(response.body.metadata.tenantId).toBe(tenantId);
        // Should handle special characters without breaking
      }
    });
  });
});