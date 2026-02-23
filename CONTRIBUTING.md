# Contributing to FalkorDB MCP Server

Thank you for your interest in contributing to the FalkorDB MCP Server! We welcome contributions from the community.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm 8+
- FalkorDB instance for testing
- Git

### Development Setup

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/your-username/falkordb-mcpserver.git
   cd falkordb-mcpserver
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your FalkorDB and Redis connection details
   ```

4. **Run tests to ensure everything works:**
   ```bash
   npm test
   ```

## 🛠️ Development Workflow

### Making Changes

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our coding standards

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Test your changes:**
   ```bash
   npm test
   npm run lint
   npm run build
   ```

### Code Standards

- **TypeScript**: All code must be written in TypeScript with proper types
- **ESLint**: Code must pass linting (`npm run lint`)
- **Tests**: New features must include tests
- **Documentation**: Update README.md if you add new features

### Commit Messages

Use conventional commit format:
```
type(scope): description

Examples:
feat(tools): add new graph visualization tool
fix(service): resolve connection timeout issue
docs(readme): update installation instructions
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

- Tests should be placed alongside source files with `.test.ts` extension
- Use Jest for testing framework
- Mock external dependencies (FalkorDB, Redis)
- Aim for high test coverage

### Test Structure

```typescript
describe('Feature Name', () => {
  beforeEach(() => {
    // Setup
  });

  it('should do something specific', () => {
    // Test implementation
  });
});
```

## 📝 Pull Request Process

1. **Ensure your PR**:
   - Passes all tests (`npm test`)
   - Passes linting (`npm run lint`)
   - Builds successfully (`npm run build`)
   - Includes appropriate documentation updates

2. **PR Title**: Use conventional commit format

3. **PR Description**: Include:
   - What changes were made
   - Why the changes were necessary
   - How to test the changes
   - Any breaking changes

4. **Review Process**:
   - Maintainers will review your PR
   - Address any feedback
   - PR will be merged once approved

## 🐛 Bug Reports

### Before Submitting

- Check existing issues to avoid duplicates
- Test with the latest version
- Gather relevant information (logs, environment details)

### Bug Report Template

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Configure server with...
2. Send query...
3. See error

**Expected behavior**
What you expected to happen.

**Environment:**
- Node.js version:
- npm version:
- FalkorDB version:
- OS:

**Additional context**
Any other context about the problem.
```

## 💡 Feature Requests

We welcome feature requests! Please:

1. Check existing issues to avoid duplicates
2. Describe the use case clearly
3. Explain why this feature would be valuable
4. Consider if it fits the project scope

## 🏗️ Project Structure

Understanding the codebase:

```
src/
├── index.ts              # MCP server entry point
├── services/             # Core business logic
│   ├── falkordb.service.ts
│   ├── redis.service.ts
│   └── logger.service.ts
├── mcp/                  # MCP-specific implementations
│   ├── tools.ts          # MCP tool definitions
│   ├── resources.ts      # MCP resource definitions
│   └── prompts.ts        # MCP prompt definitions
├── errors/               # Error handling
├── models/               # TypeScript type definitions
├── config/               # Configuration management
└── utils/                # Utility functions
```

## 🤝 Code of Conduct

We expect all contributors to follow our code of conduct:

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Maintain a welcoming environment

## 📞 Getting Help

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Documentation**: Check README.md and code comments

## 🙏 Recognition

Contributors will be recognized in:
- GitHub contributors list
- Release notes for significant contributions
- Project documentation

Thank you for contributing to FalkorDB MCP Server! 🎉