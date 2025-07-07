// Test data for FalkorDB MCP Server integration tests

// Create test nodes with various properties
CREATE (u1:User {id: 1, name: "Alice", email: "alice@example.com", age: 30})
CREATE (u2:User {id: 2, name: "Bob", email: "bob@example.com", age: 25})
CREATE (u3:User {id: 3, name: "Charlie", email: "charlie@example.com", age: 35})

// Create test projects
CREATE (p1:Project {id: 1, name: "Project Alpha", status: "active", created: datetime()})
CREATE (p2:Project {id: 2, name: "Project Beta", status: "completed", created: datetime()})
CREATE (p3:Project {id: 3, name: "Project Gamma", status: "planning", created: datetime()})

// Create relationships
CREATE (u1)-[:WORKS_ON {role: "lead", since: date()}]->(p1)
CREATE (u2)-[:WORKS_ON {role: "developer", since: date()}]->(p1)
CREATE (u2)-[:WORKS_ON {role: "developer", since: date()}]->(p2)
CREATE (u3)-[:WORKS_ON {role: "architect", since: date()}]->(p3)
CREATE (u1)-[:COLLABORATES_WITH {project_id: 1}]->(u2)

// Create some test categories for more complex queries
CREATE (c1:Category {id: 1, name: "Development"})
CREATE (c2:Category {id: 2, name: "Testing"})
CREATE (c3:Category {id: 3, name: "Documentation"})

// Link projects to categories
CREATE (p1)-[:BELONGS_TO]->(c1)
CREATE (p1)-[:BELONGS_TO]->(c2)
CREATE (p2)-[:BELONGS_TO]->(c1)
CREATE (p3)-[:BELONGS_TO]->(c3)