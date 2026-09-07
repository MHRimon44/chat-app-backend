# Local Docker Environment

## Objectives

The local stack provides:

- A single-node MongoDB replica set with authentication and transaction support.
- A least-privilege application database user separate from the local root user.
- Password-protected Redis with append-only persistence.
- A Mailpit SMTP server and browser inbox for password-reset testing without a paid provider.
- Loopback-only host ports, health checks, named volumes, deterministic initialization, and verification commands.

This is a development topology, not production deployment guidance.

## Prerequisites

- Docker Desktop or Docker Engine with Compose v2.
- At least 2 GB of memory available to Docker.
- Node.js and Yarn versions documented in `docs/tooling.md`.

## First start

1. Generate both ignored environment files, independent database/cache passwords, and an Ed25519 access-token keypair:

   ```bash
   corepack yarn local:setup
   ```

   This command refuses to overwrite either file. Never put the generated files in source control.

2. Start and verify:

   ```bash
   yarn infra:up
   ```

The start command waits for MongoDB, Redis, and Mailpit health checks, initializes the replica set idempotently, creates the application user, and runs infrastructure verification.

Open the captured-email inbox at <http://127.0.0.1:8025>. Mailpit captures messages locally instead of delivering them to real email addresses.

## Commands

```bash
yarn infra:config
yarn infra:up
yarn infra:status
yarn infra:logs
yarn infra:verify
yarn infra:down
CONFIRM_LOCAL_DATA_RESET=yes yarn infra:reset
```

`infra:down` preserves named volumes. `infra:reset` permanently removes only this Compose project’s local MongoDB, Mongo keyfile, and Redis volumes and requires explicit confirmation.

## Connection strings

Use values from your ignored `infrastructure/docker/.env` file:

```text
mongodb://<MONGO_APP_USERNAME>:<MONGO_APP_PASSWORD>@localhost:27017/<MONGO_APP_DATABASE>?authSource=<MONGO_APP_DATABASE>&replicaSet=rs0&directConnection=true
redis://:<REDIS_PASSWORD>@localhost:6379/0
```

Local email settings in `.env`:

```text
EMAIL_PROVIDER=smtp
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_FROM_EMAIL=security@chat.local
PASSWORD_RESET_URL=http://localhost:3000/password/reset
```

Local reset URLs may use HTTP only on a loopback host and only outside production. Production rejects both local SMTP and non-HTTPS reset URLs.

## Run the application locally

Use two terminals in this backend repository:

```bash
# Terminal 1
MSYS2_ARG_CONV_EXCL='/scripts/;/bin/;/mailpit' corepack yarn infra:up

# Terminal 2
corepack yarn dev
```

Start Metro and the Android or iOS application from the separate `chat-app-mobile` repository. Never expose the development API directly to the internet.

To test password recovery, submit **Forgot password**, open <http://127.0.0.1:8025>, then copy the token from the captured reset URL into the app's reset-password screen.

## Automated local end-to-end verification

With infrastructure and the API running, execute:

```bash
corepack yarn local:verify
```

This verifies infrastructure, applies indexes, registers two unique users, creates a direct conversation, sends and retrieves a private message, advances a seen receipt, requests password recovery, and confirms that Mailpit captured the email. Test records remain in the local disposable database.

Optional endpoint overrides:

```bash
LOCAL_E2E_API_URL=http://127.0.0.1:4000 \
LOCAL_E2E_MAILPIT_URL=http://127.0.0.1:8025 \
corepack yarn verify:local-e2e
```

`directConnection=true` is suitable for the local single-node Docker replica set. Do not carry it into a multi-node production connection string.

## Security decisions

- Database, cache, SMTP, and email-inbox ports bind to `127.0.0.1`, not every host interface.
- MongoDB uses an automatically generated keyfile stored in a named volume. Keyfiles are appropriate only for development; production should use managed authentication or stronger certificate-based membership authentication.
- MongoDB root credentials are used only for initialization/verification. The API uses the database-scoped `readWrite` user.
- Redis requires a password and uses `noeviction` so critical coordination keys are not silently evicted in local tests.
- Environment and generated-secret files are ignored by Git. Example files contain placeholders only.
- Exact image patch versions are pinned to avoid unexpected local changes.

## Troubleshooting

### Missing environment file or placeholder rejection

Run `corepack yarn local:setup`. If one environment file already exists, the command refuses to overwrite either file. Preserve existing credentials when named Docker volumes contain data.

### Port already in use

Stop the process using `27017`, `6379`, `1025`, or `8025`. Do not change the replica-set hostname (`mongo:27017`) without reinitializing its data volume.

### Replica-set hostname changed

The replica-set configuration is persistent. If this is disposable local data, run the explicitly confirmed reset and start again.

### Authentication fails after changing passwords

MongoDB initialization variables only apply to an empty data directory. Either restore the original local credentials or reset disposable local volumes. Do not reset if the data matters.

### `mongo-init` failed

Inspect `yarn infra:status` and `yarn infra:logs`. After MongoDB is healthy, rerun `yarn infra:up`; initialization is idempotent.

### Docker Desktop on macOS/Windows

The stack uses named volumes instead of host-mounted MongoDB data, avoiding host-filesystem incompatibilities and permission drift.

## Production differences

Production must use managed or multi-node MongoDB, managed Redis, TLS, restricted private networking, secret management, backups, monitoring, capacity policies, and tested restore/rollback procedures. The local Compose file must never be deployed as the production topology.
