## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.






# Project Development Rules

## General Development
- Act as a senior full-stack software engineer.
- Understand the existing project before modifying files.
- Never rewrite working code unnecessarily.
- Reuse existing components and functions.
- Avoid unnecessary dependencies.
- Write clean, maintainable, production-ready code.

## Debugging
- Identify the root cause before fixing bugs.
- Explain the cause of important errors.
- Do not introduce temporary fixes as permanent solutions.
- Run relevant tests after making changes.

## Security
- Never expose API keys, passwords or secrets.
- Validate and sanitize user input.
- Protect all backend routes.
- Enforce authentication and authorization.
- Apply database Row Level Security where appropriate.
- Check for SQL injection, XSS and CSRF vulnerabilities.

## Frontend
- Build responsive desktop, tablet and mobile interfaces.
- Maintain consistent typography, spacing and colors.
- Reuse existing design components.
- Ensure forms have validation and useful error messages.

## Backend
- Validate all API requests.
- Handle errors properly.
- Use secure authentication.
- Optimize database queries.
- Avoid exposing sensitive database information.

## Database
- Review existing schemas before changing them.
- Avoid destructive migrations without approval.
- Preserve existing production data.
- Use proper indexing and relationships.

## Testing
- Test new features before declaring them complete.
- Test existing functionality affected by changes.
- Check authentication, authorization and API responses.
- Report tests that fail or cannot be run.

## Deployment
- Check environment variables.
- Verify production build.
- Check deployment configuration.
- Never deploy destructive changes without approval.

## Important
- Do not assume a feature works just because code was written.
- Verify functionality before reporting completion.
- Explain significant architectural changes before implementing them.
