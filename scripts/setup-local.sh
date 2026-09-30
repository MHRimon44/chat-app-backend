#!/usr/bin/env bash

set -Eeuo pipefail

readonly repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly api_env="${repository_root}/.env"

if [[ -e "${api_env}" ]]; then
  echo 'Root .env already exists; no files were overwritten.' >&2
  echo 'Move or remove .env only if you intentionally want fresh local data.' >&2
  exit 1
fi

for command_name in openssl mktemp; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "${command_name} is required for secure local setup." >&2
    exit 1
  fi
done

readonly task_temp_dir="$(mktemp -d)"
cleanup() { rm -rf -- "${task_temp_dir}"; }
trap cleanup EXIT

mongo_root_password="$(openssl rand -hex 32)"
mongo_app_password="$(openssl rand -hex 32)"
redis_password="$(openssl rand -hex 32)"
readonly mongo_uri_prefix='mongodb://chat_app:'
readonly mongo_uri_suffix='@localhost:27017/chat_app?authSource=chat_app&replicaSet=rs0&directConnection=true'
openssl genpkey -algorithm Ed25519 -out "${task_temp_dir}/access-private.pem" 2>/dev/null
openssl pkey -in "${task_temp_dir}/access-private.pem" -pubout \
  -out "${task_temp_dir}/access-public.pem" 2>/dev/null
access_private_key_base64="$(openssl base64 -A -in "${task_temp_dir}/access-private.pem")"
access_public_key_base64="$(openssl base64 -A -in "${task_temp_dir}/access-public.pem")"

umask 077
{
  echo '# Activate exactly one section. Restart the backend after switching.'
  echo '# Dev'
  echo 'COMPOSE_PROJECT_NAME=production-chat-local'
  echo 'MONGO_ROOT_USERNAME=chat_local_admin'
  echo "MONGO_ROOT_PASSWORD=${mongo_root_password}"
  echo 'MONGO_APP_DATABASE=chat_app'
  echo 'MONGO_APP_USERNAME=chat_app'
  echo "MONGO_APP_PASSWORD=${mongo_app_password}"
  echo "REDIS_PASSWORD=${redis_password}"
} > "${api_env}"

{
  echo 'NODE_ENV=development'
  echo 'EMAIL_PROVIDER=smtp'
  echo 'SMTP_HOST=127.0.0.1'
  echo 'SMTP_PORT=1025'
  echo 'SMTP_FROM_EMAIL=security@chat.local'
  echo 'PORT=4000'
  echo "MONGODB_URI=${mongo_uri_prefix}${mongo_app_password}${mongo_uri_suffix}"
  echo 'MONGODB_MAX_POOL_SIZE=20'
  echo 'MONGODB_SERVER_SELECTION_TIMEOUT_MS=5000'
  echo "REDIS_URL=redis://:${redis_password}@localhost:6379/0"
  echo 'REDIS_CONNECT_TIMEOUT_MS=5000'
  echo 'ACCESS_TOKEN_ISSUER=production-chat-api-local'
  echo 'ACCESS_TOKEN_AUDIENCE=production-chat-mobile-local'
  echo "ACCESS_TOKEN_PRIVATE_KEY_BASE64=${access_private_key_base64}"
  echo "ACCESS_TOKEN_PUBLIC_KEY_BASE64=${access_public_key_base64}"
  echo 'ACCESS_TOKEN_TTL_SECONDS=600'
  echo 'REFRESH_TOKEN_TTL_DAYS=30'
  echo 'PASSWORD_RESET_TTL_MINUTES=15'
  echo 'PASSWORD_RESET_URL=http://localhost:3000/password/reset'
  echo 'CORS_ALLOWED_ORIGINS=http://localhost:3000'
  echo 'BODY_LIMIT=100kb'
  echo 'LOG_LEVEL=info'
  echo 'SHUTDOWN_TIMEOUT_MS=10000'
  echo 'TRUST_PROXY=false'
} >> "${api_env}"

sed -n '/^# Prod$/,$p' "${repository_root}/.env.example" >> "${api_env}"

echo 'Created root .env with Dev credentials and a commented Prod section.'
echo 'Next: corepack yarn infra:up'
