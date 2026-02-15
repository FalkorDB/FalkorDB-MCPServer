import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

function registerUserSetupPrompt(server: McpServer): void {
  // Register graph_list resource
  server.registerPrompt(
    "user_setup",
    {
      title: "User Setup",
      description: "Setup the user graph node and connect it to the rest of the relevant nodes",
      argsSchema: {
        name: z.string().describe("The name of the user"),
      }
    },
    async ({name}) => {
      const userMessage = `# User Setup Task

You are working with a FalkorDB graph database to manage user information and relationships. 

**User Information:**
- Name: ${name}

**Your task is to:**

1. **Check if user exists**: Search for a node with the name "${name}" in the memory graph
2. **Create user node if needed**: If no node exists with this name, create a new user node with the following properties:
   - name: "${name}"
   - type: "User"
   - created_at: current timestamp
3. **Establish relationships**: Ensure the user node is properly connected to relevant nodes in the graph, such as:
   - Recent conversations or interactions
   - Associated topics or interests
   - Related entities or contexts

**Guidelines:**
- Use appropriate Cypher queries to search, create, and connect nodes
- Maintain data consistency and avoid duplicate user nodes
- Consider the existing graph structure when establishing new relationships
- Log any operations performed for debugging purposes

Please proceed with setting up the user "${name}" in the memory graph.`
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: userMessage
            }
          }
        ]
      }
    }
  )
}

function registerMemoryQueryPrompt(server: McpServer): void {
  server.registerPrompt(
    "memory_query",
    {
      title: "Memory Query",
      description: "Query the memory graph to retrieve and analyze stored information",
      argsSchema: {
        query: z.string().describe("The query or topic to search for in memory"),
        context: z.string().optional().describe("Additional context to help scope the search"),
        relationship_depth: z.string().describe("How many relationship hops to traverse (1-3)")
      }
    },
    async ({query, context, relationship_depth}) => {
      const memoryMessage = `# Memory Query Task

You are working with a FalkorDB graph database to retrieve and analyze stored memory information.

**Query Information:**
- Search Query: ${query}
${context ? `- Additional Context: ${context}` : ''}
- Relationship Depth: ${relationship_depth} hops

**Your task is to:**

1. **Search for relevant nodes**: Use Cypher queries to find nodes that match or relate to "${query}"
   - Look for nodes with matching names, properties, or content
   - Consider partial matches and semantic relationships
   
2. **Traverse relationships**: Explore connected nodes up to ${relationship_depth} relationship hops to gather context:
   - Follow relationships like RELATES_TO, MENTIONED_IN, CONNECTED_TO
   - Include timestamps and relationship properties
   
3. **Analyze and synthesize**: Process the retrieved information to:
   - Identify key patterns and connections
   - Extract relevant facts and relationships
   - Organize information chronologically or by relevance
   
4. **Provide structured results**: Format your findings including:
   - Direct matches and their properties
   - Related nodes and connection paths
   - Temporal patterns if applicable
   - Confidence levels for relationships

**Query Guidelines:**
- Use MATCH patterns to find relevant nodes
- Utilize WHERE clauses for filtering
- Consider using OPTIONAL MATCH for related information
- Include LIMIT clauses to manage result size
- Order results by relevance or timestamp

**Example Cypher patterns:**
\`\`\`cypher
MATCH (n) WHERE n.name CONTAINS "${query}" OR n.content CONTAINS "${query}"
MATCH (n)-[r*1..${relationship_depth}]-(related)
RETURN n, r, related ORDER BY n.timestamp DESC
\`\`\`

Please proceed with querying the memory graph for information about "${query}".`

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: memoryMessage
            }
          }
        ]
      }
    }
  )
}

function registerGraphReorganizationPrompt(server: McpServer): void {
  server.registerPrompt(
    "graph_reorganization",
    {
      title: "Graph Reorganization",
      description: "Analyze and reorganize the graph structure for optimal performance and usability"
    },
    async () => {
      const reorganizationMessage = `# Graph Reorganization Task

You are working with a FalkorDB graph database to optimize its structure for better performance and usability.

**Your task is to:**

1. **Analyze Current Structure**: Examine the graph to identify structural issues:
   - Find nodes with excessive connections (hubs with >50 relationships)
   - Identify disconnected components or islands
   - Locate duplicate or near-duplicate nodes
   - Find outdated or stale connections
   - Analyze relationship distribution and patterns

2. **Performance Optimization**: Based on the analysis, implement improvements:
   - **Merge duplicate nodes**: Combine nodes with similar properties or content
   - **Create strategic hubs**: Add intermediate nodes to reduce direct connections
   - **Remove dead connections**: Delete relationships to non-existent or irrelevant nodes
   - **Add semantic clustering**: Group related nodes under topic or category nodes
   - **Optimize relationship types**: Ensure relationship labels are descriptive and indexed

3. **Usability Enhancement**: Improve graph navigation and querying:
   - **Add metadata nodes**: Create nodes that summarize clusters or topics
   - **Establish clear hierarchies**: Organize nodes in logical parent-child relationships
   - **Create shortcut relationships**: Add direct paths for frequently accessed connections
   - **Implement time-based organization**: Group nodes by temporal relevance

4. **Validation and Testing**: After reorganization:
   - Verify all critical paths remain intact
   - Test common query patterns for performance
   - Ensure no data loss occurred during restructuring
   - Document changes made for future reference

**Optimization Strategies by Goal:**

**Performance Focus:**
- Minimize query traversal depth
- Balance node degree distribution
- Create efficient index structures
- Reduce redundant relationships

**Usability Focus:**
- Improve semantic organization
- Add descriptive metadata
- Create intuitive navigation paths
- Enhance discoverability

**Balanced Approach:**
- Apply moderate optimizations from both areas
- Prioritize changes with highest impact/effort ratio

**Analysis Queries to Run:**
\`\`\`cypher
// Find high-degree nodes
MATCH (n)
WITH n, size((n)--()) as degree
WHERE degree > 20
RETURN n, degree ORDER BY degree DESC LIMIT 10

// Find disconnected components
MATCH (n)
WHERE NOT (n)--()
RETURN count(n) as isolated_nodes

// Identify potential duplicates
MATCH (n1), (n2)
WHERE id(n1) < id(n2) 
AND n1.name = n2.name 
AND n1.type = n2.type
RETURN n1, n2

// Find stale nodes (older than 30 days with no recent connections)
MATCH (n)
WHERE n.created_at < datetime() - duration({days: 30})
AND NOT (n)-[:UPDATED_AT|ACCESSED_AT]-()
RETURN n LIMIT 20
\`\`\`

**Reorganization Operations:**
Implement the most impactful optimizations. Prioritize operations that provide the best balance of performance improvement and structural clarity.

Begin with analyzing the current graph structure and proceed with the reorganization plan.`

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: reorganizationMessage
            }
          }
        ]
      }
    }
  )
}

export default function registerAllPrompts(server: McpServer): void {
  registerUserSetupPrompt(server);
  registerMemoryQueryPrompt(server);
  registerGraphReorganizationPrompt(server);
}