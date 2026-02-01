# Nevent SDKs

Official JavaScript/TypeScript SDKs for the Nevent platform.

## Packages

| Package                                           | Version | Description              | Size  |
| ------------------------------------------------- | ------- | ------------------------ | ----- |
| [@nevent/core](./packages/core)                   | 0.1.0   | Core utilities and types | ~5KB  |
| [@nevent/subscriptions](./packages/subscriptions) | 2.0.0   | Newsletter widget        | ~15KB |

## Installation

### Via CDN (Recommended for quick integration)

The fastest way to get started is to load the SDK directly from our CDN:

```html
<!-- Production (always pin to specific version) -->
<script src="https://neventapps.com/subs/v2.0.0/nevent-subscriptions.umd.cjs"></script>
<script>
  const widget = new NeventSubscriptions.NewsletterWidget({
    newsletterId: 'your-newsletter-id',
    tenantId: 'your-tenant-id',
    containerId: 'newsletter-container',
  });
  widget.init();
</script>

<!-- Development (latest version, updates automatically) -->
<script src="https://dev.neventapps.com/subs/latest/nevent-subscriptions.umd.cjs"></script>
```

**Important:** Always use versioned URLs in production (e.g., `/v2.0.0/`) to prevent breaking changes. The `/latest/` alias auto-updates and should only be used for development/testing.

**Available formats:**

- **UMD (Browser):** `nevent-subscriptions.umd.cjs` - Global `NeventSubscriptions` object
- **ES Module:** `nevent-subscriptions.js` - For modern bundlers

See [examples/basic-integration.html](./examples/basic-integration.html) for a complete working example.

### Via npm/pnpm (For bundled applications)

```bash
# Install packages
npm install @nevent/subscriptions
# or
pnpm add @nevent/subscriptions
```

```typescript
import { NewsletterWidget } from '@nevent/subscriptions';

const widget = new NewsletterWidget({
  newsletterId: 'your-newsletter-id',
  tenantId: 'your-tenant-id',
  containerId: 'newsletter-container',
});

await widget.init();
```

See individual package READMEs for detailed documentation.

## Development

This is a monorepo managed with pnpm workspaces.

### Prerequisites

- Node.js 18+
- pnpm 8+

### Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint

# Type check
pnpm typecheck
```

### Workspace Commands

```bash
# Build all packages
pnpm build

# Watch mode (all packages)
pnpm dev

# Run tests with coverage
pnpm test:coverage

# Lint and fix
pnpm lint:fix

# Format code
pnpm format
```

### Package-specific Commands

```bash
# Build specific package
pnpm --filter @nevent/core build

# Test specific package
pnpm --filter @nevent/subscriptions test

# Run all commands in a package
cd packages/core
pnpm build
pnpm test
```

## Project Structure

```
nev-sdks/
├── packages/
│   ├── core/              # Shared utilities
│   │   ├── src/
│   │   ├── dist/
│   │   └── package.json
│   └── subscriptions/     # Newsletter widget
│       ├── src/
│       ├── dist/
│       └── package.json
├── examples/
│   └── basic-html/        # HTML integration examples
├── .github/
│   └── workflows/         # CI/CD pipelines
├── package.json           # Root package (workspace config)
├── pnpm-workspace.yaml    # pnpm workspace definition
├── tsconfig.json          # Base TypeScript config
├── vitest.config.ts       # Test configuration
├── .eslintrc.js           # Linting rules
└── README.md
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architectural decisions and patterns.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development workflow and guidelines.

## Versioning

We use [Changesets](https://github.com/changesets/changesets) for version management and changelog generation.

### Creating a Changeset

```bash
# Add a changeset for your changes
pnpm changeset

# Follow the prompts to select packages and change types
```

### Releasing

Releases are automated through GitHub Actions when changesets are merged to `main`.

## Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

Coverage thresholds are enforced:

- Lines: 80%
- Functions: 80%
- Branches: 75%
- Statements: 80%

## Browser Support

- Chrome/Edge 88+
- Firefox 90+
- Safari 14+
- Modern mobile browsers

## License

MIT

## Maintainers

- Nevent Team

## Support

For issues and questions:

- [GitHub Issues](https://github.com/nevent/nev-sdks/issues)
- Email: support@nevent.es
