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

Never commit `.env` or `infrastructure/docker/.env`.
