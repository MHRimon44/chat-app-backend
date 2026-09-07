#!/usr/bin/env bash

set -Eeuo pipefail

readonly mongo_host='mongo'
readonly mongo_port='27017'
readonly max_attempts=60

for ((attempt = 1; attempt <= max_attempts; attempt += 1)); do
  if mongosh \
    --quiet \
    --host "${mongo_host}" \
    --port "${mongo_port}" \
    --username "${MONGO_ROOT_USERNAME}" \
    --password "${MONGO_ROOT_PASSWORD}" \
    --authenticationDatabase admin \
    --eval 'quit(db.adminCommand({ ping: 1 }).ok ? 0 : 1)' >/dev/null; then
    break
  fi

  if [[ "${attempt}" -eq "${max_attempts}" ]]; then
    echo 'MongoDB did not become reachable before the initialization timeout.' >&2
    exit 1
  fi

  sleep 2
done

mongosh \
  --quiet \
  --host "${mongo_host}" \
  --port "${mongo_port}" \
  --username "${MONGO_ROOT_USERNAME}" \
  --password "${MONGO_ROOT_PASSWORD}" \
  --authenticationDatabase admin \
  /scripts/init-replica.js

