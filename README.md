# Vonum Worker

A Cloudflare Workers implementation for a decentralized identity registry using Durable Objects and WebSocket signaling.


## Features

- WebSocket-based client registration and signaling
- End-to-end signature verification using Ed25519
- Durable Object for persistent registry storage
- GitHub Actions CI pipeline with linting, testing, license checking, and vulnerability scanning
- TypeScript support

## Architecture

- **Worker**: Handles WebSocket upgrades, message routing, and signature verification.
- **Durable Object (`VonumDO`)**: Stores the registry mapping from phone numbers to public keys and metadata.
- **WebSocket Clients**: Register with a public key and can exchange signaling messages (offer, answer, ICE candidates, etc.) via the worker.

## Message Format

All WebSocket messages are JSON objects with the following fields:

```ts
{
  type: 'register' | 'resolve' | 'offer' | 'answer' | 'ice-candidate' | 'hangup';
  payload: any; // depends on type
  sig: string; // base64url Ed25519 signature of the payload
  kid: string; // key identifier (the phone number of the sender)
}
```

### Register

```ts
{
  type: 'register',
  payload: {
    number: string; // phone number to register
    publicKey: string; // base64url Ed25519 public key
    metadata?: unknown; // optional metadata
  };
  sig: string; // signature of the payload
  kid: string; // same as payload.number
}
```

Response: `{ type: 'register-result', payload: { ok: boolean }, sig: '', kid: '' }`

### Resolve

```ts
{
  type: 'resolve',
  payload: {
    number: string; // phone number to resolve
  };
  sig: string;
  kid: string;
}
```

Response: `{ type: 'resolve-result', payload: { ok: boolean, publicKey?: string, metadata?: unknown }, sig: '', kid: '' }`

### Offer / Answer / ICE Candidate / Hangup

These follow the same pattern, with payload containing the relevant signaling data and an optional `target` field indicating the recipient's phone number. If `target` is omitted, the message is broadcast to all connected clients (current implementation forwards only to the target if online).

## Development

### Prerequisites

- Node.js (>=18)
- `npm` or `yarn`
- `wrangler` (Cloudflare CLI)

### Setup

```bash
# Install dependencies
npm install

# Start local development server
npm run dev
```

The worker will be available at `http://localhost:8787` (or another port shown in the output).

### Testing

```bash
# Run unit tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

### CI

The repository includes a GitHub Actions workflow (`.github/workflows/ci.yml`) that runs on every push and pull request to `main`/`master`:

- **Lint**: ESLint + Prettier
- **Test**: Vitest unit tests
- **Build**: `wrangler build`
- **License Check**: Ensures only permissive licenses (MIT, Apache-2.0, BSD-2/3-Clause, ISC, Unlicense, CC0-1.0) are used
- **Vulnerability Check**: `npm audit --production --audit-level=high`

## Deployment

```bash
# Publish to Cloudflare Workers
npm run deploy
```

Make sure to set the `TURN_SECRET` variable via `wrangler secret` if needed.

## License

This project is licensed under the Apache License, Version 2.0.

