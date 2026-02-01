# Contributing to Nevent SDKs

Thank you for your interest in contributing! This document provides guidelines and workflows for contributors.

## Development Setup

### Prerequisites

- Node.js 18 or higher
- pnpm 8 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/nevent/nev-sdks.git
cd nev-sdks

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## Development Workflow

### 1. Create a Branch

```bash
# Fetch latest changes
git checkout development
git pull origin development

# Create feature branch
git checkout -b feat/NEV-XXX-your-feature-name
```

### 2. Make Changes

Work on your changes in the appropriate package:

```bash
# Example: Work on core package
cd packages/core

# Watch mode for development
pnpm dev

# Run tests
pnpm test
```

### 3. Write Tests

All new features and bug fixes must include tests:

```typescript
// Example: packages/core/src/my-feature.test.ts
import { describe, expect, it } from 'vitest';
import { myFeature } from './my-feature';

describe('myFeature', () => {
  it('should do something', () => {
    const result = myFeature('input');
    expect(result).toBe('expected output');
  });
});
```

### 4. Commit Your Changes

We follow conventional commit format:

```bash
# Add your changes
git add .

# Commit with conventional format
git commit -m "feat: add new validation utility

- Implement phone number validation
- Add tests with 100% coverage
- Update documentation

Refs: NEV-XXX"
```

**Commit Types:**

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `docs`: Documentation changes
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes

### 5. Add Changeset

For changes that affect package versions:

```bash
pnpm changeset
```

Follow the prompts to:

1. Select affected packages
2. Choose version bump type (major/minor/patch)
3. Describe the changes

### 6. Push and Create PR

```bash
# Push your branch
git push -u origin feat/NEV-XXX-your-feature-name

# Create PR via GitHub CLI (optional)
gh pr create --base development --title "feat: your feature name"
```

## Code Standards

### TypeScript

- **Strict mode**: All code must pass `tsc --noEmit` with strict checks
- **No `any`**: Use proper types or `unknown` with type guards
- **Explicit return types**: For public APIs
- **JSDoc comments**: For all public functions and classes

Example:

````typescript
/**
 * Validates an email address
 *
 * @param email - Email address to validate
 * @returns Validation result with errors
 *
 * @example
 * ```typescript
 * const result = validateEmail('user@example.com');
 * if (result.valid) {
 *   console.log('Valid email');
 * }
 * ```
 */
export function validateEmail(email: string): ValidationResult {
  // Implementation
}
````

### ESLint

All code must pass ESLint checks:

```bash
# Check for issues
pnpm lint

# Auto-fix issues
pnpm lint:fix
```

### Prettier

All code must be formatted with Prettier:

```bash
# Check formatting
pnpm format:check

# Auto-format
pnpm format
```

### Testing

- **Coverage threshold**: 80% minimum (lines, functions, statements)
- **Test organization**: Co-locate tests with source files (`*.test.ts`)
- **Test naming**: Descriptive `describe` and `it` blocks

```typescript
describe('FeatureName', () => {
  describe('methodName', () => {
    it('should handle valid input correctly', () => {
      // Test case
    });

    it('should throw error for invalid input', () => {
      // Test case
    });
  });
});
```

## Package-Specific Guidelines

### @nevent/core

- **No DOM dependencies**: Must work in Node.js environment
- **Pure functions**: Prefer stateless utilities
- **Minimal dependencies**: Avoid external packages unless necessary

### @nevent/subscriptions

- **Browser-only**: Can use DOM APIs
- **Accessibility**: Follow WCAG 2.1 Level AA
- **Performance**: Bundle size < 20KB minified

## Pull Request Process

### Before Submitting

- [ ] All tests pass (`pnpm test`)
- [ ] Lint checks pass (`pnpm lint`)
- [ ] Type checks pass (`pnpm typecheck`)
- [ ] Code is formatted (`pnpm format`)
- [ ] Changeset added (if needed)
- [ ] Documentation updated
- [ ] Examples updated (if API changed)

### PR Template

Your PR should include:

1. **Description**: What does this PR do?
2. **Motivation**: Why is this change needed?
3. **Testing**: How was this tested?
4. **Breaking Changes**: Any breaking changes?
5. **Screenshots**: For UI changes

### Review Process

1. CI checks must pass
2. At least one maintainer approval required
3. All review comments addressed
4. Up-to-date with base branch

## Release Process

Releases are automated via Changesets:

1. Developer adds changeset with their PR
2. Changesets bot creates a "Version Packages" PR
3. Maintainer reviews and merges version PR
4. GitHub Actions publishes to NPM
5. Git tags and GitHub releases created automatically

## Need Help?

- **Questions**: Open a GitHub Discussion
- **Bugs**: Open a GitHub Issue
- **Security**: Email security@nevent.es

## Code of Conduct

Be respectful and professional. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
