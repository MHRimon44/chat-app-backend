# Infrastructure

The `docker/` directory contains the local MongoDB replica set, Redis, and Mailpit services.

The local stack reads the Dev section of the root `.env`. See [setup and environment switching](../README.md). Production connections are configured in the Prod section and use external services.
