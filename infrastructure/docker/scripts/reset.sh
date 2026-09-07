#!/usr/bin/env bash

set -Eeuo pipefail

readonly script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly compose="${script_directory}/compose.sh"

if [[ "${CONFIRM_LOCAL_DATA_RESET:-}" != 'yes' ]]; then
  echo 'This removes all local MongoDB, Redis, and captured-email volumes.' >&2
  echo 'Run with CONFIRM_LOCAL_DATA_RESET=yes yarn infra:reset to confirm.' >&2
  exit 1
fi

"${compose}" down --volumes --remove-orphans
echo 'Local MongoDB, Redis, and captured-email data volumes were removed.'
