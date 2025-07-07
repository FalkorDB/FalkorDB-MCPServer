import { TenantGraphService } from '../../services/tenant-graph.service';
import { config } from '../../config';

// Mock the config module
jest.mock('../../config', () => ({
  config: {
    multiTenancy: {
      enabled: false,
      tenantGraphPrefix: false
    }
  }
}));

describe('TenantGraphService', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  describe('resolveGraphName', () => {
    test('should return original graph name when multi-tenancy is disabled', () => {
      // Arrange
      (config.multiTenancy as any).enabled = false;
      
      // Act
      const result = TenantGraphService.resolveGraphName('testGraph', 'tenant1');
      
      // Assert
      expect(result).toBe('testGraph');
    });

    test('should return original graph name when tenant prefix is disabled', () => {
      // Arrange
      (config.multiTenancy as any).enabled = true;
      (config.multiTenancy as any).tenantGraphPrefix = false;
      
      // Act
      const result = TenantGraphService.resolveGraphName('testGraph', 'tenant1');
      
      // Assert
      expect(result).toBe('testGraph');
    });

    test('should return original graph name when no tenant ID provided', () => {
      // Arrange
      (config.multiTenancy as any).enabled = true;
      (config.multiTenancy as any).tenantGraphPrefix = true;
      
      // Act
      const result = TenantGraphService.resolveGraphName('testGraph');
      
      // Assert
      expect(result).toBe('testGraph');
    });

    test('should return tenant-prefixed graph name when enabled', () => {
      // Arrange
      (config.multiTenancy as any).enabled = true;
      (config.multiTenancy as any).tenantGraphPrefix = true;
      
      // Act
      const result = TenantGraphService.resolveGraphName('testGraph', 'tenant1');
      
      // Assert
      expect(result).toBe('tenant1_testGraph');
    });
  });

  describe('extractTenantFromGraphName', () => {
    test('should return null when multi-tenancy is disabled', () => {
      // Arrange
      (config.multiTenancy as any).enabled = false;
      
      // Act
      const result = TenantGraphService.extractTenantFromGraphName('tenant1_testGraph');
      
      // Assert
      expect(result).toBeNull();
    });

    test('should return null when tenant prefix is disabled', () => {
      // Arrange
      (config.multiTenancy as any).enabled = true;
      (config.multiTenancy as any).tenantGraphPrefix = false;
      
      // Act
      const result = TenantGraphService.extractTenantFromGraphName('tenant1_testGraph');
      
      // Assert
      expect(result).toBeNull();
    });

    test('should return null for non-prefixed graph names', () => {
      // Arrange
      (config.multiTenancy as any).enabled = true;
      (config.multiTenancy as any).tenantGraphPrefix = true;
      
      // Act
      const result = TenantGraphService.extractTenantFromGraphName('testGraph');
      
      // Assert
      expect(result).toBeNull();
    });

    test('should extract tenant and graph name from prefixed name', () => {
      // Arrange
      (config.multiTenancy as any).enabled = true;
      (config.multiTenancy as any).tenantGraphPrefix = true;
      
      // Act
      const result = TenantGraphService.extractTenantFromGraphName('tenant1_testGraph');
      
      // Assert
      expect(result).toEqual({
        tenantId: 'tenant1',
        originalGraphName: 'testGraph'
      });
    });

    test('should handle graph names with multiple underscores', () => {
      // Arrange
      (config.multiTenancy as any).enabled = true;
      (config.multiTenancy as any).tenantGraphPrefix = true;
      
      // Act
      const result = TenantGraphService.extractTenantFromGraphName('tenant1_test_graph_name');
      
      // Assert
      expect(result).toEqual({
        tenantId: 'tenant1',
        originalGraphName: 'test_graph_name'
      });
    });
  });

  describe('filterGraphsForTenant', () => {
    test('should return all graphs when multi-tenancy is disabled', () => {
      // Arrange
      (config.multiTenancy as any).enabled = false;
      const allGraphs = ['graph1', 'tenant1_graph2', 'tenant2_graph3'];
      
      // Act
      const result = TenantGraphService.filterGraphsForTenant(allGraphs, 'tenant1');
      
      // Assert
      expect(result).toEqual(['graph1', 'tenant1_graph2', 'tenant2_graph3']);
    });

    test('should return all graphs when tenant prefix is disabled', () => {
      // Arrange
      (config.multiTenancy as any).enabled = true;
      (config.multiTenancy as any).tenantGraphPrefix = false;
      const allGraphs = ['graph1', 'tenant1_graph2', 'tenant2_graph3'];
      
      // Act
      const result = TenantGraphService.filterGraphsForTenant(allGraphs, 'tenant1');
      
      // Assert
      expect(result).toEqual(['graph1', 'tenant1_graph2', 'tenant2_graph3']);
    });

    test('should return only non-prefixed graphs when no tenant ID provided', () => {
      // Arrange
      (config.multiTenancy as any).enabled = true;
      (config.multiTenancy as any).tenantGraphPrefix = true;
      const allGraphs = ['graph1', 'tenant1_graph2', 'tenant2_graph3', 'shared_graph'];
      
      // Act
      const result = TenantGraphService.filterGraphsForTenant(allGraphs);
      
      // Assert
      expect(result).toEqual(['graph1']);
    });

    test('should return tenant-specific graphs with prefix removed', () => {
      // Arrange
      (config.multiTenancy as any).enabled = true;
      (config.multiTenancy as any).tenantGraphPrefix = true;
      const allGraphs = ['graph1', 'tenant1_graph2', 'tenant1_graph3', 'tenant2_graph4'];
      
      // Act
      const result = TenantGraphService.filterGraphsForTenant(allGraphs, 'tenant1');
      
      // Assert
      expect(result).toEqual(['graph2', 'graph3']);
    });
  });

  describe('validateTenantAccess', () => {
    test('should validate access correctly when multi-tenancy enabled', () => {
      // Arrange
      (config.multiTenancy as any).enabled = true;
      (config.multiTenancy as any).tenantGraphPrefix = true;
      const allGraphs = ['tenant1_testGraph', 'tenant2_otherGraph'];
      
      // Act & Assert
      expect(TenantGraphService.validateTenantAccess('testGraph', 'tenant1', allGraphs)).toBe(true);
      expect(TenantGraphService.validateTenantAccess('otherGraph', 'tenant1', allGraphs)).toBe(false);
      expect(TenantGraphService.validateTenantAccess('testGraph', 'tenant2', allGraphs)).toBe(false);
    });

    test('should validate access correctly when multi-tenancy disabled', () => {
      // Arrange
      (config.multiTenancy as any).enabled = false;
      const allGraphs = ['testGraph', 'otherGraph'];
      
      // Act & Assert
      expect(TenantGraphService.validateTenantAccess('testGraph', 'tenant1', allGraphs)).toBe(true);
      expect(TenantGraphService.validateTenantAccess('otherGraph', 'tenant1', allGraphs)).toBe(true);
      expect(TenantGraphService.validateTenantAccess('nonExistent', 'tenant1', allGraphs)).toBe(false);
    });
  });
});