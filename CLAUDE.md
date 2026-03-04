# Claude.md - Repository Guidelines

This file contains project-specific instructions and conventions for working with this repository.

## Project Overview

- **Repository**: Colaberry
- **Primary Branch**: main
- **Working Directory**: c:\Users\tkeya\.vscode\Colaberry

## Code Standards

### General Principles
- Write clean, readable, and maintainable code
- Follow existing patterns and conventions in the codebase
- Keep changes focused and minimal - only modify what's necessary
- Prioritize simplicity over complexity

### Code Style
- Use consistent indentation (spaces or tabs as established in existing files)
- Write self-documenting code with clear variable and function names
- Add comments only when logic is non-obvious
- Remove unused code and imports

## Git Workflow

### Commits
- Create meaningful commit messages that explain the "why" behind changes
- Stage specific files rather than using `git add .` or `git add -A`
- Always include co-authorship: `Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`
- Never use `--no-verify` flag unless explicitly requested

### Branches
- Default branch for pull requests: main
- Create feature branches with descriptive names when needed
- Keep branches focused on single features or fixes

### Pull Requests
- Always confirm before pushing to remote
- Include clear PR descriptions with summary and test plan
- Reference related issues when applicable

## File Operations

### Reading Before Writing
- Always read existing files before modifying them
- Understand the current implementation before suggesting changes
- Use the Read tool to examine file contents

### New Files
- Only create new files when absolutely necessary
- Prefer editing existing files over creating new ones
- Ensure new files follow project structure conventions

## Testing

- Run tests before marking tasks complete
- Fix any failing tests before committing
- Write tests for new functionality when applicable
- Never skip tests to speed up development

## Security

- Avoid introducing common vulnerabilities (XSS, SQL injection, command injection, etc.)
- Never commit sensitive data (.env files, credentials, API keys)
- Validate user input at system boundaries
- Use parameterized queries for database operations

## Communication

- Keep responses concise and focused
- Use markdown links for file references: [filename.ts](path/to/filename.ts)
- For specific lines: [filename.ts:42](path/to/filename.ts#L42)
- Ask for clarification when requirements are ambiguous

## Permissions and Confirmations

### Always Confirm Before:
- Pushing code to remote repository
- Deleting files or branches
- Running destructive operations (rm -rf, git reset --hard, etc.)
- Modifying CI/CD pipelines
- Force-pushing to any branch

### May Proceed Without Confirmation:
- Reading files and searching code
- Running local tests
- Creating local commits
- Editing files in working directory

## Tools Usage

- Use dedicated tools (Read, Edit, Write, Glob, Grep) instead of bash commands
- Use TodoWrite to track progress on multi-step tasks
- Break down complex tasks into manageable steps
- Mark tasks complete immediately after finishing them

## Project-Specific Notes

*(Add project-specific conventions, patterns, and requirements here as they are established)*

---

**Last Updated**: 2026-02-25
**Maintained By**: Project contributors
