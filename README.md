# Chat App Backend

Standalone Node.js backend for the Chat App. It provides authentication, profiles, username search, direct conversations, real-time messaging, presence, typing indicators, receipts, Swagger documentation, and local password-recovery email.

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
