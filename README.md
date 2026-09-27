# Chat App Backend

Standalone Node.js backend for the Chat App. Registration requires a unique searchable username, and authenticated users can update their username, display name, bio, and presence privacy. It also provides direct conversations, real-time messaging, presence, typing indicators, receipts, Swagger documentation, and local password-recovery email.

## Stack

Node.js 24, TypeScript, Express, Socket.IO, MongoDB, Redis, Docker Compose, Mailpit and Swagger.

## Structure

```text
src/              API and Socket.IO source
test/             Automated tests
infrastructure/   MongoDB, Redis and Mailpit Docker setup
scripts/          Local setup and security checks
docs/             API and security documentation
```

## First-time setup

Install Docker Desktop and Node.js 24, then open Git Bash:

```bash
corepack yarn install --immutable
corepack yarn local:setup
MSYS2_ARG_CONV_EXCL='/scripts/;/bin/;/mailpit' corepack yarn infra:up
corepack yarn db:indexes:create
```

## Run locally

Start Docker Desktop, then run:

```bash
MSYS2_ARG_CONV_EXCL='/scripts/;/bin/;/mailpit' corepack yarn infra:up
corepack yarn dev
```

Local URLs:

- API readiness: http://localhost:4000/v1/health/ready
- Swagger: http://localhost:4000/docs/
- Mailpit: http://localhost:8025

New usernames must contain 3–30 letters, numbers, or underscores. Existing accounts without a username can add one through the mobile Profile & Settings screen or `PATCH /v1/users/me` in Swagger.

## Verify

```bash
corepack yarn format:check
corepack yarn lint
corepack yarn typecheck
corepack yarn test
corepack yarn build
```

Stop containers without deleting data:

```bash
corepack yarn infra:down
```

Never commit `.env`.

## Switching environments

All editable backend environment values live in the root `.env`. `.env.example` is a safe template; `yarn local:setup` generates local credentials and both sections for a fresh checkout.

- Local: uncomment the values under `# Dev` (including local Docker values), and keep every value under `# Prod` commented.
- Production: comment every Dev value and uncomment the Prod values. Fill in production database, Redis, signing keys, email settings, and public URLs before starting.
- Keep exactly one section active and restart the backend after changing it. A line beginning with `#` is disabled.

Run `yarn dev` locally. For the compiled backend, run `yarn build` followed by `yarn start`; start loads the same `.env`. Build only compiles TypeScript and does not embed environment values. Existing shell or deployment environment variables take precedence over `.env`; clear conflicting exported values when switching manually. Deployments can also inject values without a file.

Docker development commands also read the root `.env`. Production uses the external services configured in the Prod section. TypeScript, lint, test, and Docker files remain as tooling definitions; `src/config/env.ts` validates the environment values.

This repository builds the backend, not an Android APK. Configure the API base URL in the mobile project separately, and keep backend secrets on the server.
