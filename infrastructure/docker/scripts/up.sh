#!/usr/bin/env bash

set -Eeuo pipefail

readonly script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly compose="${script_directory}/compose.sh"

"${compose}" up --detach --wait mongo redis mailpit
"${compose}" run --rm mongo-init
"${script_directory}/verify.sh"
