# Chat App Backend

Standalone Node.js backend for the Chat App.

Registration requires a unique searchable username. Authenticated users can update their username, display name, bio, and presence privacy.

The backend also provides:

- Direct conversations
- Real-time messaging with Socket.IO
- Online/offline presence and last-seen support
- Presence privacy
- Typing indicators
- Message receipts
- Email OTP verification (retained, temporarily disabled)
- Password recovery (retained, temporarily disabled)
- Swagger API documentation
- Local MongoDB, Redis, and Mailpit development infrastructure

## Stack

- Node.js 24
- TypeScript
- Express
- Socket.IO
- MongoDB
- Redis
- Docker Compose
- Mailpit
- Swagger
- Yarn 4

## Project Structure

```text
src/              API and Socket.IO source
test/             Automated tests
infrastructure/   MongoDB, Redis and Mailpit Docker setup
scripts/          Local setup and security checks
docs/             API and security documentation
```

---

## Requirements

For local development, install:

- Git
- Homebrew
- Node.js 24
- Yarn via Corepack
- Docker Desktop

Check what is already installed:

```bash
git --version
node -v
yarn -v
docker --version
docker compose version
```

The project requires Node.js 24.

---

## Install Node.js 24 on macOS

Check your current Node.js version:

```bash
node -v
```

If Node.js 24 is not installed:

```bash
brew install node@24
```

Add Node.js 24 to your PATH:

```bash
echo 'export PATH="/opt/homebrew/opt/node@24/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Verify:

```bash
node -v
```

You should see:

```text
v24.x.x
```

Enable Corepack:

```bash
corepack enable
```

Verify Yarn:

```bash
yarn -v
```

This project uses Yarn 4.18.0 as defined in `package.json`.

---

## Install Docker Desktop on macOS

If Docker Desktop is not installed:

```bash
brew install --cask docker
```

Start Docker Desktop:

```bash
open -a Docker
```

Wait until Docker Desktop has fully started.

Verify:

```bash
docker --version
docker compose version
docker info
```

`docker info` must successfully show both client and server information before starting the local infrastructure.

### If Homebrew says Docker is installed but Docker.app is missing

Reinstall Docker Desktop:

```bash
brew uninstall --cask docker --force
brew cleanup
brew install --cask docker
```

Then:

```bash
open -a Docker
```

Verify again:

```bash
docker --version
docker compose version
docker info
```

---

## Clone the Project

```bash
git clone https://github.com/MHRimon44/chat-app-backend.git
cd chat-app-backend
```

For development:

```bash
git checkout devMain
git pull origin devMain
```

For the production branch:

```bash
git checkout main
git pull origin main
```

---

## Install Dependencies

Make sure Node.js 24 is active:

```bash
node -v
```

Then:

```bash
corepack enable
yarn install --immutable
```

---

## Environment Configuration

The backend reads environment variables from the root `.env` file.

`.env.example` is the safe template.

Never commit the real `.env` file.

For a fresh local setup, use the project's setup script:

```bash
yarn local:setup
```

Review the generated `.env` before starting the backend.

### Local Development

Use the development values in `.env`.

Local infrastructure uses:

```text
MongoDB    127.0.0.1:27017
Redis      127.0.0.1:6379
Mailpit    127.0.0.1:8025
SMTP       127.0.0.1:1025
API        127.0.0.1:4000
```

Keep production credentials commented out while developing locally.

### Production

For production, configure the production MongoDB, Redis, JWT/signing keys, email provider, public URLs, and other secrets through the deployment environment.

Do not commit production credentials to Git.

---

# First-Time Local Setup

Make sure Docker Desktop is running:

```bash
open -a Docker
```

Then start the local infrastructure:

```bash
yarn infra:up
```

This starts the project's local:

- MongoDB replica set
- Redis
- Mailpit

Verify everything:

```bash
yarn infra:status
```

Then:

```bash
yarn infra:verify
```

A successful verification should confirm that MongoDB, Redis, and the local Mailpit inbox are ready.

Create the required MongoDB indexes:

```bash
yarn db:indexes:create
```

Finally, start the backend:

```bash
yarn dev
```

The API should start on:

```text
http://127.0.0.1:4000
```

---

# Normal Daily Development

After the first-time setup, you do not need to reinstall anything.

### 1. Start Docker Desktop

```bash
open -a Docker
```

Wait until Docker is running.

### 2. Start MongoDB, Redis and Mailpit

From the backend directory:

```bash
yarn infra:up
```

### 3. Start the Backend

```bash
yarn dev
```

That's normally all you need.

---

## Local URLs

API readiness:

```text
http://localhost:4000/v1/health/ready
```

Swagger:

```text
http://localhost:4000/docs/
```

Mailpit:

```text
http://localhost:8025
```

Mailpit can be used to inspect emails generated during local development.

---

## Local Infrastructure Commands

Start infrastructure:

```bash
yarn infra:up
```

Check container status:

```bash
yarn infra:status
```

Verify MongoDB, Redis, and Mailpit:

```bash
yarn infra:verify
```

View infrastructure logs:

```bash
yarn infra:logs
```

Stop containers without deleting their stored data:

```bash
yarn infra:down
```

Reset local infrastructure:

```bash
yarn infra:reset
```

Be careful with `infra:reset`, because it is intended to reset the local infrastructure/data.

---

## Database Indexes

Create the application's MongoDB indexes:

```bash
yarn db:indexes:create
```

Normally this is required after the first local setup or when database indexes change.

---

## Run the Backend

Development mode with file watching:

```bash
yarn dev
```

Production-style compiled execution:

```bash
yarn build
yarn start
```

`yarn build` only compiles TypeScript. It does not embed environment variables into the build.

`yarn start` loads the runtime environment.

---

## Verify the Project

Before pushing or merging important backend changes, run:

```bash
yarn typecheck && yarn lint && yarn test && yarn build
```

You can also run them individually:

```bash
yarn typecheck
yarn lint
yarn test
yarn build
```

Check formatting:

```bash
yarn format:check
```

Check the repository for accidentally committed secrets:

```bash
yarn security:secrets
```

All checks should pass before merging into `main` or deploying.

---

## Usernames

New usernames must contain 3–30 letters, numbers, or underscores.

Existing accounts without a username can add one through the mobile Profile & Settings screen or:

```text
PATCH /v1/users/me
```

The endpoint can also be tested through Swagger.

---

## Switching Environments

All editable backend environment values live in the root `.env`.

`.env.example` is the safe template.

### Development

Use the values under the development section and keep production values disabled/commented.

Then run:

```bash
yarn infra:up
yarn dev
```

### Production

Use production MongoDB, Redis, signing keys, email settings, URLs, and other production credentials.

For hosted deployments such as Render, environment variables should normally be configured directly in the deployment environment rather than committing a production `.env` file.

Restart the backend after changing runtime environment variables.

Existing shell or deployment environment variables can take precedence over values from `.env`, so check for conflicting exported variables when troubleshooting environment changes.

`src/config/env.ts` validates the backend environment configuration.

---

## Useful Fresh-Mac Setup

For a new macOS development machine, the basic setup is:

```bash
# Install Node.js 24
brew install node@24

# Make Node.js 24 the default
echo 'export PATH="/opt/homebrew/opt/node@24/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Verify Node
node -v

# Enable Yarn through Corepack
corepack enable

# Install Docker Desktop
brew install --cask docker

# Start Docker
open -a Docker
```

Clone and prepare the backend:

```bash
git clone https://github.com/MHRimon44/chat-app-backend.git
cd chat-app-backend

git checkout devMain

yarn install --immutable
yarn local:setup
```

Start the infrastructure:

```bash
yarn infra:up
yarn infra:verify
```

Prepare the database:

```bash
yarn db:indexes:create
```

Start the API:

```bash
yarn dev
```

After that, normal development usually only requires:

```bash
yarn infra:up
yarn dev
```

---

## Security

Never commit:

```text
.env
API keys
MongoDB passwords
Redis credentials
JWT/private signing keys
production secrets
```

Keep `.env.example` limited to placeholders and safe example values.

Before pushing important changes:

```bash
yarn security:secrets
```

## Temporary auth configuration

- Registration OTP verification: disabled (`REGISTRATION_OTP_ENABLED=false`, the default).
- Registration creates the account directly. `POST /v1/auth/register` returns HTTP 201 with `{ data: { accessToken, accessTokenExpiresAt, refreshToken, user } }`, the same result previously returned by verification. Mobile clients should store these tokens and proceed to the signed-in screen without requesting an OTP.
- Forgot Password: disabled (`PASSWORD_RESET_ENABLED=false`, the default).
- Normal login and JWT/refresh authentication: enabled and unchanged.
- Resend, OTP hashing/verification, email templates and password recovery implementations are retained.

Disabled routes return the normal HTTP 404 envelope and are hidden from active Swagger:
`POST /v1/auth/register/verify`, `POST /v1/auth/password/forgot`,
`POST /v1/auth/password/verify-otp`, and `POST /v1/auth/password/reset`.
Direct registration retains validation, normalization, Argon2id password hashing,
MongoDB unique indexes, Redis registration rate limits, and the existing session creation logic.
It creates no pending registration or OTP record; any previous pending registration
for the successfully registered email is removed. Other pending registrations and
reset records expire through their existing MongoDB TTL indexes. No Redis data is cleared.
When both features are disabled, email configuration is unused and Resend credentials
are optional, including with `EMAIL_PROVIDER=resend`. `EMAIL_PROVIDER=unconfigured`
is suitable for this temporary state. MongoDB, Redis and JWT configuration remain required.

TODO — restore registration verification after production email delivery is ready:

1. Configure `EMAIL_PROVIDER=resend`, a valid `RESEND_API_KEY`, a sender address in
   `RESEND_FROM_EMAIL` on your configured domain, and optionally `RESEND_FROM_NAME`.
2. Set `REGISTRATION_OTP_ENABLED=true` in the runtime environment and restart the server.
3. Update the mobile client to handle HTTP 202 with `data.message` from registration,
   show the OTP screen, and call `/v1/auth/register/verify` with email, OTP and device.
   Verification returns HTTP 201 with the existing token/user response.
4. Verify delivery and the registration/verification flow with a real recipient.

TODO — restore Forgot Password independently:

1. Configure the same Resend settings above.
2. Set `PASSWORD_RESET_ENABLED=true` and restart the server.
3. Enable the mobile recovery UI: call `/v1/auth/password/forgot`, then
   `/v1/auth/password/verify-otp`; submit its `data.resetToken` as `token` with the new
   `password` to `/v1/auth/password/reset`. Successful reset revokes existing sessions.
4. Verify the full recovery flow with a real inbox. Both flags automatically restore
   their routes and Swagger documentation; no source changes or migrations are needed.
