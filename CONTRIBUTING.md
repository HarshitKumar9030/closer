# Contributing

Keep Closer small: native Android, vanilla web UI, one Node service and MongoDB. Avoid adding a framework or service for a feature that fits the existing stack.

1. Install with `npm ci` and configure `.env.example` locally.
2. Run MongoDB on an isolated test port (see [development checks](docs/DEVELOPMENT.md)).
3. Run `npm test`, `npm run build:web`, and `npm run build:android` when applicable.
4. Describe the behavior change and validation in your pull request.

Never commit `.env` files, app signing keys, tokens, database files or real usage data. Use sample fixtures and preserve read-only viewer boundaries, pause behavior, explicit pairing, and reduced-motion support.
