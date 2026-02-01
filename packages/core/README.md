# @nevent/core

Core utilities and shared types for Nevent SDKs.

## Features

- **HTTP Client**: Type-safe HTTP client for Nevent API communication
- **Validators**: Email and form validation utilities
- **Storage**: LocalStorage wrapper with error handling
- **Logger**: Debug logging with configurable levels
- **Types**: Shared TypeScript types and interfaces

## Installation

```bash
npm install @nevent/core
# or
pnpm add @nevent/core
```

## Usage

### HTTP Client

```typescript
import { HttpClient } from '@nevent/core';

const client = new HttpClient('https://api.nevent.io', 'your-api-key');

// GET request
const response = await client.get('/campaigns');

// POST request
await client.post('/subscriptions', {
  email: 'user@example.com',
  consent: true,
});
```

### Email Validation

```typescript
import { EmailValidator } from '@nevent/core';

const result = EmailValidator.validate('user@example.com');

if (result.valid) {
  console.log('Email is valid');
} else {
  console.error('Validation errors:', result.errors);
}
```

### Form Validation

```typescript
import { FormValidator } from '@nevent/core';

const nameValidation = FormValidator.required(name, 'Name');
const emailValidation = EmailValidator.validate(email);

const combined = FormValidator.combine(nameValidation, emailValidation);

if (!combined.valid) {
  console.error(combined.errors);
}
```

### Storage

```typescript
import { Storage } from '@nevent/core';

const storage = new Storage('myapp_');

// Save data
storage.set('user', { id: 123, name: 'John' });

// Retrieve data
const user = storage.get<User>('user');

// Remove data
storage.remove('user');
```

### Logger

```typescript
import { Logger } from '@nevent/core';

const logger = new Logger('[MySDK]', true); // Enable debug mode

logger.debug('Initializing widget...');
logger.info('Widget loaded');
logger.warn('Deprecated option used');
logger.error('Failed to load configuration');
```

## API Reference

See [TypeScript definitions](./dist/index.d.ts) for complete API documentation.

## License

MIT
