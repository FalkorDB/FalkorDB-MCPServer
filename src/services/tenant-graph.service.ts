import { config } from '../config';

export class TenantGraphService {
  /**
   * Resolves the actual graph name based on tenant context and configuration
   * @param graphName - Original graph name from request
   * @param tenantId - Tenant identifier (optional)
   * @returns Resolved graph name
   */
  static resolveGraphName(graphName: string, tenantId?: string): string {
    // When multi-tenancy is disabled, return original graph name
    if (!config.multiTenancy.enabled) {
      return graphName;
    }

    // When tenant graph prefixing is disabled, return original graph name
    if (!config.multiTenancy.tenantGraphPrefix) {
      return graphName;
    }

    // If no tenant ID provided, return original graph name
    if (!tenantId) {
      return graphName;
    }

    // Return tenant-prefixed graph name
    return `${tenantId}_${graphName}`;
  }

  /**
   * Extracts tenant ID from a tenant-prefixed graph name
   * @param resolvedGraphName - Graph name that may include tenant prefix
   * @returns Object with tenantId and originalGraphName, or null if not tenant-prefixed
   */
  static extractTenantFromGraphName(resolvedGraphName: string): { tenantId: string; originalGraphName: string } | null {
    if (!config.multiTenancy.enabled || !config.multiTenancy.tenantGraphPrefix) {
      return null;
    }

    const parts = resolvedGraphName.split('_');
    if (parts.length < 2) {
      return null;
    }

    const tenantId = parts[0];
    const originalGraphName = parts.slice(1).join('_');
    
    return { tenantId, originalGraphName };
  }

  /**
   * Filters graph list to only show graphs accessible to the tenant
   * @param allGraphs - Complete list of graphs from FalkorDB
   * @param tenantId - Tenant identifier (optional)
   * @returns Filtered list of graph names (with tenant prefixes removed)
   */
  static filterGraphsForTenant(allGraphs: string[], tenantId?: string): string[] {
    // When multi-tenancy is disabled, return all graphs
    if (!config.multiTenancy.enabled) {
      return allGraphs;
    }

    // When tenant graph prefixing is disabled, return all graphs
    if (!config.multiTenancy.tenantGraphPrefix) {
      return allGraphs;
    }

    // If no tenant ID, return only non-prefixed graphs
    if (!tenantId) {
      return allGraphs.filter(graphName => !graphName.includes('_'));
    }

    // Filter to tenant-specific graphs and remove the tenant prefix
    const tenantPrefix = `${tenantId}_`;
    return allGraphs
      .filter(graphName => graphName.startsWith(tenantPrefix))
      .map(graphName => graphName.substring(tenantPrefix.length));
  }

  /**
   * Validates if a tenant has access to a specific graph
   * @param graphName - Original graph name
   * @param tenantId - Tenant identifier (optional)
   * @param allGraphs - Complete list of graphs from FalkorDB
   * @returns True if tenant has access, false otherwise
   */
  static validateTenantAccess(graphName: string, tenantId: string | undefined, allGraphs: string[]): boolean {
    const resolvedGraphName = this.resolveGraphName(graphName, tenantId);
    return allGraphs.includes(resolvedGraphName);
  }
}