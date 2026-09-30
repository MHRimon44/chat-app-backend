#!/usr/bin/env bash

set -Eeuo pipefail

readonly script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly docker_directory="$(cd -- "${script_directory}/.." && pwd)"
readonly compose="${script_directory}/compose.sh"

mongo_root_username="$(sed -n 's/^MONGO_ROOT_USERNAME=//p' "${docker_directory}/../../.env")"
mongo_root_password="$(sed -n 's/^MONGO_ROOT_PASSWORD=//p' "${docker_directory}/../../.env")"
mongo_app_database="$(sed -n 's/^MONGO_APP_DATABASE=//p' "${docker_directory}/../../.env")"
mongo_app_username="$(sed -n 's/^MONGO_APP_USERNAME=//p' "${docker_directory}/../../.env")"
mongo_app_password="$(sed -n 's/^MONGO_APP_PASSWORD=//p' "${docker_directory}/../../.env")"

"${compose}" exec -T \
  -e MONGO_APP_DATABASE="${mongo_app_database}" \
  -e MONGO_APP_USERNAME="${mongo_app_username}" \
  mongo mongosh \
  --quiet \
  --host 127.0.0.1 \
  --port 27017 \
  --username "${mongo_root_username}" \
  --password "${mongo_root_password}" \
  --authenticationDatabase admin \
  /scripts/verify.js

"${compose}" exec -T \
  -e MONGO_APP_DATABASE="${mongo_app_database}" \
  mongo mongosh \
  --quiet \
  --host 127.0.0.1 \
  --port 27017 \
  --username "${mongo_app_username}" \
  --password "${mongo_app_password}" \
  --authenticationDatabase "${mongo_app_database}" \
  /scripts/verify-transaction.js

"${compose}" exec -T redis /bin/sh -ec \
  'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli --no-auth-warning ping | grep -q PONG'

"${compose}" exec -T mailpit /mailpit readyz

echo 'MongoDB, Redis, and the local Mailpit email inbox are ready.'
