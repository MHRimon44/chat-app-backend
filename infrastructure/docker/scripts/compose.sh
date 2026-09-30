#!/usr/bin/env bash

set -Eeuo pipefail

readonly script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly docker_directory="$(cd -- "${script_directory}/.." && pwd)"
readonly env_file="${docker_directory}/../../.env"
readonly compose_file="${docker_directory}/compose.yaml"

if ! command -v docker >/dev/null 2>&1; then
  echo 'Docker is required. Install Docker Desktop or Docker Engine with Compose v2.' >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo 'Docker Compose v2 is required.' >&2
  exit 1
fi

if [[ ! -f "${env_file}" ]]; then
  echo 'Missing .env.' >&2
  echo 'Copy .env.example to .env and replace every placeholder.' >&2
  exit 1
fi

if grep -Eq '^[[:space:]]*[^#[:space:]][^=]*=.*replace_with_' "${env_file}"; then
  echo 'Replace every replace_with_* value in .env before starting services.' >&2
  exit 1
fi

exec docker compose --env-file "${env_file}" --file "${compose_file}" "$@"

